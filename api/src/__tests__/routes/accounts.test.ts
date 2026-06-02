// @vitest-environment node
/**
 * Tests for api/src/routes/accounts.ts
 * Covers: GET (tenantId validation), POST (field validation, UNIQUE conflict),
 *         PATCH (status update, invalid status)
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
}));

vi.mock("#/infrastructure/persistence/drizzle/schema", () => ({
  accounts: {
    accountId: "accounts.accountId",
    tenantId: "accounts.tenantId",
    username: "accounts.username",
    role: "accounts.role",
    status: "accounts.status",
    createdAt: "accounts.createdAt",
  },
}));

vi.mock("#/core/auth/authRules", () => ({
  hashPassword: vi.fn((pw: string) => `hashed:${pw}`),
  generateId: vi.fn(() => "generated-id-123"),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { accountsRoutes } from "../../routes/accounts";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };
const env: Env = { DB: {} as D1Database, SESSION_MASTER_KEY: "test-key" };

function setupSelectChain(rows: unknown[] = []) {
  mockDb.select = vi.fn().mockReturnValue(mockDb);
  mockDb.from = vi.fn().mockReturnValue(mockDb);
  mockDb.where = vi.fn().mockReturnValue(mockDb);
  mockDb.all = vi.fn().mockResolvedValue(rows);
}

function setupInsertChain(opts: { throws?: Error } = {}) {
  const runFn = opts.throws
    ? vi.fn().mockRejectedValue(opts.throws)
    : vi.fn().mockResolvedValue({});
  mockDb.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ run: runFn }) });
}

function setupUpdateChain() {
  mockDb.update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({}) }),
    }),
  });
}

function req(method: string, path: string, body?: unknown) {
  return accountsRoutes.request(
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

describe("GET /api/accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectChain();
  });

  it("returns 400 when tenantId is missing", async () => {
    const res = await req("GET", "/");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("tenantId required");
  });

  it("returns empty array when no accounts found", async () => {
    const res = await req("GET", "/?tenantId=t-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns accounts for a given tenantId", async () => {
    const accounts = [
      { accountId: "a-1", username: "admin", role: "admin", status: "active", createdAt: 1000 },
    ];
    setupSelectChain(accounts);
    const res = await req("GET", "/?tenantId=t-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(accounts);
  });
});

describe("POST /api/accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupInsertChain();
  });

  it("returns 400 when body is invalid JSON", async () => {
    const res = await accountsRoutes.request(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
      undefined,
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when tenantId is missing", async () => {
    const res = await req("POST", "/", { username: "user", password: "password1", role: "admin" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("tenantId");
  });

  it("returns 400 when username is missing", async () => {
    const res = await req("POST", "/", { tenantId: "t-1", password: "password1", role: "admin" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await req("POST", "/", { tenantId: "t-1", username: "user", role: "admin" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when role is missing", async () => {
    const res = await req("POST", "/", {
      tenantId: "t-1",
      username: "user",
      password: "password1",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when role is invalid", async () => {
    const res = await req("POST", "/", {
      tenantId: "t-1",
      username: "user",
      password: "password1",
      role: "superadmin",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid role");
  });

  it("returns 400 when password is too short (< 8 chars)", async () => {
    const res = await req("POST", "/", {
      tenantId: "t-1",
      username: "user",
      password: "short",
      role: "admin",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("8 characters");
  });

  it("returns 200 with accountId on successful creation", async () => {
    const res = await req("POST", "/", {
      tenantId: "t-1",
      username: "newuser",
      password: "securepass",
      role: "admin",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.accountId).toBe("generated-id-123");
  });

  it("accepts all valid roles", async () => {
    const validRoles = ["admin", "station", "gate", "terminal", "scout"];
    for (const role of validRoles) {
      setupInsertChain();
      const res = await req("POST", "/", {
        tenantId: "t-1",
        username: "user",
        password: "securepass",
        role,
      });
      expect(res.status).toBe(200);
    }
  });

  it("returns 409 when username already exists (UNIQUE constraint)", async () => {
    setupInsertChain({ throws: new Error("UNIQUE constraint failed: accounts.username") });
    const res = await req("POST", "/", {
      tenantId: "t-1",
      username: "existing",
      password: "securepass",
      role: "admin",
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Username already exists");
  });

  it("returns 500 for non-UNIQUE errors (Hono catches and returns 500)", async () => {
    setupInsertChain({ throws: new Error("DB connection lost") });
    const res = await req("POST", "/", {
      tenantId: "t-1",
      username: "user",
      password: "securepass",
      role: "admin",
    });
    expect(res.status).toBe(500);
  });

  it("trims whitespace from username", async () => {
    const res = await req("POST", "/", {
      tenantId: "t-1",
      username: "  trimmed  ",
      password: "securepass",
      role: "admin",
    });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUpdateChain();
  });

  it("returns 400 when tenantId is missing", async () => {
    const res = await req("PATCH", "/", { accountId: "a-1", status: "active" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("tenantId");
  });

  it("returns 400 when accountId is missing", async () => {
    const res = await req("PATCH", "/", { tenantId: "t-1", status: "active" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when status is missing", async () => {
    const res = await req("PATCH", "/", { tenantId: "t-1", accountId: "a-1" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when status is invalid", async () => {
    const res = await req("PATCH", "/", { tenantId: "t-1", accountId: "a-1", status: "deleted" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid status");
  });

  it("returns 200 when status is set to active", async () => {
    const res = await req("PATCH", "/", { tenantId: "t-1", accountId: "a-1", status: "active" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 200 when status is set to suspended", async () => {
    const res = await req("PATCH", "/", {
      tenantId: "t-1",
      accountId: "a-1",
      status: "suspended",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 400 when body is invalid JSON", async () => {
    const res = await accountsRoutes.request(
      new Request("http://localhost/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "bad-json",
      }),
      undefined,
      env,
    );
    expect(res.status).toBe(400);
  });
});
