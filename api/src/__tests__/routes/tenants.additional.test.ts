// @vitest-environment node
/**
 * Additional tests for api/src/routes/tenants.ts
 * Covers uncovered lines: search DB error, race condition with admin_only conflict,
 * race condition fallback (neither slug nor admin found on recheck),
 * outer catch block with UNIQUE constraint
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── DB mock ──────────────────────────────────────────────────────────────────

const mockDb: Record<string, ReturnType<typeof vi.fn>> = {};

vi.mock("drizzle-orm/d1", () => ({
  drizzle: vi.fn(() => mockDb),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  like: vi.fn((a: unknown, b: unknown) => ({ like: [a, b] })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
  asc: vi.fn((a: unknown) => ({ asc: a })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values })),
}));

vi.mock("#/db/schema", () => ({
  tenants: {
    tenantId: "tenants.tenantId",
    slug: "tenants.slug",
    name: "tenants.name",
    timezone: "tenants.timezone",
    status: "tenants.status",
  },
  accounts: {
    accountId: "accounts.accountId",
    tenantId: "accounts.tenantId",
    username: "accounts.username",
    passwordHash: "accounts.passwordHash",
    role: "accounts.role",
    status: "accounts.status",
  },
}));

vi.mock("#/server/tenantSync", () => ({
  validateSyncRequest: vi.fn(() => []),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { tenantsRoutes } from "../../routes/tenants";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };
const env: Env = { DB: {} as D1Database, SESSION_MASTER_KEY: "test-key" };

function setupSelectChain(rows: unknown[] = []) {
  mockDb.select = vi.fn().mockReturnValue(mockDb);
  mockDb.from = vi.fn().mockReturnValue(mockDb);
  mockDb.where = vi.fn().mockReturnValue(mockDb);
  mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
  mockDb.limit = vi.fn().mockResolvedValue(rows);
  mockDb.get = vi.fn().mockResolvedValue(rows[0] ?? null);
}

function setupBatch(opts: { throws?: Error } = {}) {
  mockDb.insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnThis(),
  });
  mockDb.batch = opts.throws
    ? vi.fn().mockRejectedValue(opts.throws)
    : vi.fn().mockResolvedValue([{}, {}]);
}

function req(method: string, path: string, body?: unknown) {
  return tenantsRoutes.request(
    new Request(`http://localhost${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
    undefined,
    env,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /search - error paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 when database query throws", async () => {
    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockReturnValue(mockDb);
    mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
    mockDb.limit = vi.fn().mockRejectedValue(new Error("Database connection failed"));

    const res = await req("GET", "/search?q=test");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Database connection failed");
  });
});

describe("POST /sync - race condition paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectChain([]);
    setupBatch();
  });

  it("handles race condition with admin_only conflict on recheck", async () => {
    // Pre-insert check: no slug, no admin conflict
    mockDb.get = vi.fn().mockResolvedValue(null);

    // Batch throws UNIQUE constraint
    setupBatch({ throws: new Error("UNIQUE constraint failed") });

    // After race condition recheck: slug NOT found, admin IS found
    let recheckCallCount = 0;
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce(null) // pre-insert slug check
      .mockResolvedValueOnce(null) // pre-insert admin check
      .mockImplementation(async () => {
        recheckCallCount++;
        if (recheckCallCount === 1) return null; // recheck slug: not found
        if (recheckCallCount === 2) return { accountId: "a-1", tenantId: "t-1" }; // recheck admin: found
        if (recheckCallCount === 3) return { slug: "other-tenant", name: "Other Tenant" }; // conflictTenant lookup
        return null;
      });

    const res = await req("POST", "/sync", {
      slug: "new-tenant",
      name: "New Tenant",
      timezone: "UTC",
      adminUsername: "admin",
      adminPasswordHash: "hash",
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
    expect(body.conflictType).toBe("admin_only");
  });

  it("handles race condition with slug_and_admin conflict on recheck", async () => {
    mockDb.get = vi.fn().mockResolvedValue(null);
    setupBatch({ throws: new Error("UNIQUE constraint failed") });

    let recheckCallCount = 0;
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce(null) // pre-insert slug check
      .mockResolvedValueOnce(null) // pre-insert admin check
      .mockImplementation(async () => {
        recheckCallCount++;
        if (recheckCallCount === 1)
          return { tenantId: "t-1", slug: "new-tenant", name: "Existing" }; // recheck slug: found
        if (recheckCallCount === 2) return { accountId: "a-1", tenantId: "t-1" }; // recheck admin: found
        return null;
      });

    const res = await req("POST", "/sync", {
      slug: "new-tenant",
      name: "New Tenant",
      timezone: "UTC",
      adminUsername: "admin",
      adminPasswordHash: "hash",
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
    expect(body.conflictType).toBe("slug_and_admin");
  });

  it("handles race condition fallback when neither found on recheck", async () => {
    mockDb.get = vi.fn().mockResolvedValue(null);
    setupBatch({ throws: new Error("UNIQUE constraint failed") });

    // After race condition recheck: nothing found (edge case)
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce(null) // pre-insert slug check
      .mockResolvedValueOnce(null) // pre-insert admin check
      .mockResolvedValueOnce(null) // recheck slug: not found
      .mockResolvedValueOnce(null); // recheck admin: not found

    const res = await req("POST", "/sync", {
      slug: "new-tenant",
      name: "New Tenant",
      timezone: "UTC",
      adminUsername: "admin",
      adminPasswordHash: "hash",
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
    // Fallback case
    expect(body.conflictType).toBe("slug_and_admin");
    expect(body.existingTenantName).toBe("Unknown");
  });

  it("handles outer catch block with unique constraint (from initial select throwing)", async () => {
    // Simulate the outer try/catch where a non-inner UNIQUE error is caught
    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockReturnValue(mockDb);
    mockDb.get = vi.fn().mockRejectedValue(new Error("UNIQUE constraint: already exists"));

    const res = await req("POST", "/sync", {
      slug: "new-tenant",
      name: "New Tenant",
      timezone: "UTC",
      adminUsername: "admin",
      adminPasswordHash: "hash",
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("Conflict");
  });

  it("handles outer catch block with non-UNIQUE error", async () => {
    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockReturnValue(mockDb);
    mockDb.get = vi.fn().mockRejectedValue(new Error("Catastrophic DB failure"));

    const res = await req("POST", "/sync", {
      slug: "new-tenant",
      name: "New Tenant",
      timezone: "UTC",
      adminUsername: "admin",
      adminPasswordHash: "hash",
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Internal server error");
  });
});
