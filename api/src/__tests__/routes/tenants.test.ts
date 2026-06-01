// @vitest-environment node
/**
 * Tests for api/src/routes/tenants.ts
 * Covers: GET /search, POST /sync
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
import { validateSyncRequest } from "#/server/tenantSync";

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

describe("GET /search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectChain();
  });

  it("returns 400 when query is too short (< 2 chars)", async () => {
    const res = await req("GET", "/search?q=a");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("at least 2 characters");
  });

  it("returns 400 when query is too long (> 100 chars)", async () => {
    const longQuery = "a".repeat(101);
    const res = await req("GET", "/search?q=" + longQuery);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("at most 100 characters");
  });

  it("returns 400 when limit is not an integer", async () => {
    const res = await req("GET", "/search?q=test&limit=abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Limit must be a valid integer");
  });

  it("returns 400 when limit is less than 1", async () => {
    const res = await req("GET", "/search?q=test&limit=0");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("between 1 and 50");
  });

  it("returns 400 when limit is greater than 50", async () => {
    const res = await req("GET", "/search?q=test&limit=51");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("between 1 and 50");
  });

  it("returns 200 with empty results when no tenants match", async () => {
    setupSelectChain([]);
    const res = await req("GET", "/search?q=test");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("returns 200 with matching tenants", async () => {
    setupSelectChain([
      { tenantId: "t-1", slug: "test-tenant", name: "Test Tenant" },
      { tenantId: "t-2", slug: "test-org", name: "Test Organization" },
    ]);
    const res = await req("GET", "/search?q=test");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("uses default limit of 10 when not specified", async () => {
    const res = await req("GET", "/search?q=test");
    expect(res.status).toBe(200);
  });

  it("accepts custom limit", async () => {
    const res = await req("GET", "/search?q=test&limit=5");
    expect(res.status).toBe(200);
  });

  it("accepts minimum query length of 2 characters", async () => {
    setupSelectChain([]);
    const res = await req("GET", "/search?q=ab");
    expect(res.status).toBe(200);
  });

  it("accepts maximum query length of 100 characters", async () => {
    setupSelectChain([]);
    const query = "a".repeat(100);
    const res = await req("GET", "/search?q=" + query);
    expect(res.status).toBe(200);
  });
});

describe("POST /sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectChain([]);
    setupBatch();
  });

  it("returns 400 when body is invalid JSON", async () => {
    const res = await tenantsRoutes.request(
      new Request("http://localhost/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
      undefined,
      env,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 when validation fails", async () => {
    vi.mocked(validateSyncRequest).mockReturnValueOnce([
      { field: "slug", message: "Slug is required" },
    ]);

    const res = await req("POST", "/sync", {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.errors).toHaveLength(1);
  });

  it("returns 409 when slug already exists", async () => {
    setupSelectChain([{ tenantId: "t-1", slug: "existing", name: "Existing Tenant" }]);
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce({ tenantId: "t-1", slug: "existing", name: "Existing Tenant" })
      .mockResolvedValueOnce(null);

    const res = await req("POST", "/sync", {
      slug: "existing",
      name: "New Tenant",
      timezone: "UTC",
      adminUsername: "admin",
      adminPasswordHash: "hash",
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
    expect(body.conflictType).toBe("slug_only");
  });

  it("returns 409 when admin username already exists", async () => {
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ accountId: "a-1", tenantId: "t-1", username: "admin" })
      .mockResolvedValueOnce({ tenantId: "t-1", slug: "existing", name: "Existing Tenant" });

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

  it("returns 409 when both slug and admin exist", async () => {
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce({ tenantId: "t-1", slug: "existing", name: "Existing Tenant" })
      .mockResolvedValueOnce({ accountId: "a-1", tenantId: "t-1", username: "admin" });

    const res = await req("POST", "/sync", {
      slug: "existing",
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

  it("returns 201 on successful tenant creation", async () => {
    mockDb.get = vi.fn().mockResolvedValue(null);
    setupBatch();

    const res = await req("POST", "/sync", {
      slug: "new-tenant",
      name: "New Tenant",
      timezone: "UTC",
      adminUsername: "admin",
      adminPasswordHash: "hash",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tenantId).toBeDefined();
    expect(body.accountId).toBeDefined();
    expect(body.slug).toBe("new-tenant");
    expect(body.name).toBe("New Tenant");
    expect(body.synced).toBe(true);
    expect(body.accessToken).toBeDefined();
  });

  it("uses localTenantId when provided", async () => {
    mockDb.get = vi.fn().mockResolvedValue(null);
    setupBatch();

    const res = await req("POST", "/sync", {
      slug: "new-tenant",
      name: "New Tenant",
      timezone: "UTC",
      adminUsername: "admin",
      adminPasswordHash: "hash",
      localTenantId: "local-tenant-id",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tenantId).toBe("local-tenant-id");
  });

  it("handles race condition with UNIQUE constraint error", async () => {
    mockDb.get = vi.fn().mockResolvedValue(null);
    setupBatch({ throws: new Error("UNIQUE constraint failed") });

    // After race condition, recheck finds the conflict
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ tenantId: "t-1", slug: "new-tenant", name: "New Tenant" })
      .mockResolvedValueOnce(null);

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
  });

  it("returns 500 on non-constraint database error", async () => {
    mockDb.get = vi.fn().mockResolvedValue(null);
    setupBatch({ throws: new Error("Database connection lost") });

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
