/**
 * Tests for api/src/routes/tenants.ts
 * Tests the Hono tenants route handlers (search + sync).
 * Focuses on input validation and error handling.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock drizzle to return a chainable mock DB
const mockDb: any = {};

vi.mock("drizzle-orm/d1", () => ({
  drizzle: vi.fn(() => mockDb),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => [a, b]),
  like: vi.fn((a: unknown, b: unknown) => [a, b]),
  or: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((a: unknown) => a),
  sql: vi.fn((_strings: TemplateStringsArray, ...values: unknown[]) => values),
}));

vi.mock("#/db/schema", () => ({
  tenants: {
    tenantId: "t.id",
    slug: "t.slug",
    name: "t.name",
    status: "t.status",
    timezone: "t.tz",
  },
  accounts: {
    accountId: "a.id",
    tenantId: "a.tid",
    username: "a.user",
    passwordHash: "a.pw",
    role: "a.role",
    status: "a.status",
  },
}));

vi.mock("#/server/tenantSync", () => ({
  validateSyncRequest: vi.fn().mockReturnValue([]),
}));

import { tenantsRoutes } from "../../routes/tenants";
import { validateSyncRequest } from "#/server/tenantSync";

const env = { DB: { fake: "d1" }, SESSION_MASTER_KEY: "test-key" };

function searchRequest(query: string, limit?: number) {
  const params = new URLSearchParams({ q: query });
  if (limit !== undefined) params.set("limit", String(limit));
  return tenantsRoutes.request(
    new Request(`http://localhost/search?${params}`, { method: "GET" }),
    undefined,
    env,
  );
}

function syncRequest(body: unknown) {
  return tenantsRoutes.request(
    new Request("http://localhost/sync", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    undefined,
    env,
  );
}

function setupChainableDb() {
  mockDb.select = vi.fn().mockReturnValue(mockDb);
  mockDb.from = vi.fn().mockReturnValue(mockDb);
  mockDb.where = vi.fn().mockReturnValue(mockDb);
  mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
  mockDb.limit = vi.fn().mockResolvedValue([]);
  mockDb.get = vi.fn().mockResolvedValue(undefined);
  mockDb.insert = vi.fn().mockReturnValue({ values: vi.fn() });
  mockDb.batch = vi.fn().mockResolvedValue([]);
}

describe("GET /api/tenants/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupChainableDb();
  });

  it("returns 400 when query is less than 2 characters", async () => {
    const res = await searchRequest("a");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("at least 2 characters");
  });

  it("returns 400 when query is more than 100 characters", async () => {
    const longQuery = "a".repeat(101);
    const res = await searchRequest(longQuery);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("at most 100 characters");
  });

  it("returns 400 when limit is invalid (0)", async () => {
    const res = await searchRequest("test", 0);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Limit must be");
  });

  it("returns 400 when limit exceeds 50", async () => {
    const res = await searchRequest("test", 51);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Limit must be");
  });

  it("returns results on valid query", async () => {
    const results = [{ tenantId: "t-1", slug: "test-tenant", name: "Test Tenant" }];
    mockDb.limit.mockResolvedValue(results);

    const res = await searchRequest("test");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tenants).toEqual(results);
    expect(data.total).toBe(1);
  });

  it("returns empty results when no match", async () => {
    const res = await searchRequest("nonexistent");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tenants).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("returns 500 on database error", async () => {
    mockDb.select.mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const res = await searchRequest("test");
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("DB connection failed");
  });
});

describe("POST /api/tenants/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupChainableDb();
    (validateSyncRequest as ReturnType<typeof vi.fn>).mockReturnValue([]);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await tenantsRoutes.request(
      new Request("http://localhost/sync", {
        method: "POST",
        body: "not json{{{",
        headers: { "Content-Type": "application/json" },
      }),
      undefined,
      env,
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid JSON body");
  });

  it("returns 400 when validation fails", async () => {
    (validateSyncRequest as ReturnType<typeof vi.fn>).mockReturnValue([
      { field: "slug", message: "slug is required" },
    ]);

    const res = await syncRequest({ slug: "" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("validation_failed");
    expect(data.errors).toHaveLength(1);
  });

  it("returns 201 on successful tenant creation (no conflicts)", async () => {
    mockDb.get.mockResolvedValue(undefined);
    mockDb.batch.mockResolvedValue([]);

    const res = await syncRequest({
      slug: "new-tenant",
      name: "New Tenant",
      timezone: "Asia/Jakarta",
      adminUsername: "admin",
      adminPasswordHash: "100000:aaaa:bbbb",
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.slug).toBe("new-tenant");
    expect(data.name).toBe("New Tenant");
    expect(data.synced).toBe(true);
    expect(data.tenantId).toBeDefined();
    expect(data.accountId).toBeDefined();
    expect(data.accessToken).toBeDefined();
  });

  it("uses localTenantId when provided", async () => {
    mockDb.get.mockResolvedValue(undefined);
    mockDb.batch.mockResolvedValue([]);

    const res = await syncRequest({
      slug: "new-tenant",
      name: "New Tenant",
      timezone: "Asia/Jakarta",
      adminUsername: "admin",
      adminPasswordHash: "100000:aaaa:bbbb",
      localTenantId: "my-local-id",
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.tenantId).toBe("my-local-id");
  });

  it("returns 409 on slug conflict", async () => {
    mockDb.get
      .mockResolvedValueOnce({ tenantId: "existing-t", slug: "taken-slug", name: "Existing" })
      .mockResolvedValueOnce(undefined);

    const res = await syncRequest({
      slug: "taken-slug",
      name: "New Tenant",
      timezone: "Asia/Jakarta",
      adminUsername: "admin",
      adminPasswordHash: "100000:aaaa:bbbb",
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("conflict");
    expect(data.conflictType).toBe("slug_only");
    expect(data.existingTenantName).toBe("Existing");
  });

  it("returns 409 on both slug and admin conflict", async () => {
    mockDb.get
      .mockResolvedValueOnce({ tenantId: "t-1", slug: "taken-slug", name: "Existing" })
      .mockResolvedValueOnce({ accountId: "a-1", tenantId: "t-1", username: "admin" });

    const res = await syncRequest({
      slug: "taken-slug",
      name: "New Tenant",
      timezone: "Asia/Jakarta",
      adminUsername: "admin",
      adminPasswordHash: "100000:aaaa:bbbb",
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("conflict");
    expect(data.conflictType).toBe("slug_and_admin");
  });
});
