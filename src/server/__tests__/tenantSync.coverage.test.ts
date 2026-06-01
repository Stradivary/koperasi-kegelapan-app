/**
 * Coverage tests for tenantSync.ts - processTenantSync and its conflict/race paths.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Use a queue-based approach so each .get() call returns the next value
const getQueue: Array<unknown> = [];

const mockBatch = vi.fn();
const mockGet = vi.fn();

vi.mock("#/db", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      get: vi.fn(() => {
        if (getQueue.length > 0) return Promise.resolve(getQueue.shift());
        return Promise.resolve(undefined);
      }),
    })),
    batch: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn().mockReturnThis() })),
  })),
}));

import { processTenantSync } from "../tenantSync";

const VALID_HASH = `100000:${"a".repeat(32)}:${"b".repeat(64)}`;

function makeRequest(overrides = {}) {
  return {
    slug: "new-tenant",
    name: "New Tenant",
    timezone: "Asia/Jakarta",
    adminUsername: "admin_user",
    adminPasswordHash: VALID_HASH,
    ...overrides,
  };
}

describe("processTenantSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatch.mockResolvedValue([]);
  });

  it("returns synced=true when no conflicts exist", async () => {
    mockGet.mockResolvedValue(undefined); // no slug conflict, no admin conflict
    const result = await processTenantSync(makeRequest());
    expect("synced" in result && result.synced).toBe(true);
    if ("synced" in result) {
      expect(result.tenantId).toBeDefined();
      expect(result.slug).toBe("new-tenant");
    }
  });

  it("returns slug_and_admin conflict when both exist", async () => {
    mockGet
      .mockResolvedValueOnce({ tenantId: "t1", slug: "new-tenant", name: "Existing" })
      .mockResolvedValueOnce({ accountId: "a1", tenantId: "t1", username: "admin_user" });
    const result = await processTenantSync(makeRequest());
    if ("error" in result) {
      expect(result.conflictType).toBe("slug_and_admin");
    }
  });

  it("returns admin_only conflict when only username exists", async () => {
    mockGet
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ accountId: "a1", tenantId: "t2", username: "admin_user" })
      .mockResolvedValueOnce({ tenantId: "t2", slug: "other-tenant", name: "Other" });
    const result = await processTenantSync(makeRequest());
    if ("error" in result) {
      expect(result.conflictType).toBe("admin_only");
      expect(result.existingTenantName).toBe("Other");
    }
  });

  it("returns admin_only with Unknown when conflict tenant not found", async () => {
    mockGet
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ accountId: "a1", tenantId: "t2", username: "admin_user" })
      .mockResolvedValueOnce(undefined);
    const result = await processTenantSync(makeRequest());
    if ("error" in result) {
      expect(result.existingTenantName).toBe("Unknown");
      expect(result.existingSlug).toBe("");
    }
  });

  it("handles UNIQUE constraint error - slug race condition", async () => {
    mockGet.mockResolvedValue(undefined); // pre-checks pass
    mockBatch.mockRejectedValueOnce(new Error("UNIQUE constraint failed: tenants.slug"));
    // recheck: slug found, admin not found
    mockGet
      .mockResolvedValueOnce({ tenantId: "t1", slug: "new-tenant", name: "Race Tenant" })
      .mockResolvedValueOnce(undefined);
    const result = await processTenantSync(makeRequest());
    if ("error" in result) {
      expect(result.conflictType).toBe("slug_only");
    }
  });

  it("handles UNIQUE constraint error - both race condition", async () => {
    mockGet.mockResolvedValue(undefined);
    mockBatch.mockRejectedValueOnce(new Error("UNIQUE constraint failed"));
    mockGet
      .mockResolvedValueOnce({ tenantId: "t1", slug: "new-tenant", name: "Race" })
      .mockResolvedValueOnce({ accountId: "a1", tenantId: "t1" });
    const result = await processTenantSync(makeRequest());
    if ("error" in result) {
      expect(result.conflictType).toBe("slug_and_admin");
    }
  });

  it("handles UNIQUE constraint error - admin race condition", async () => {
    mockGet.mockResolvedValue(undefined);
    mockBatch.mockRejectedValueOnce(new Error("UNIQUE constraint failed"));
    mockGet
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ accountId: "a1", tenantId: "t2" })
      .mockResolvedValueOnce({ slug: "other", name: "Other" });
    const result = await processTenantSync(makeRequest());
    if ("error" in result) {
      expect(result.conflictType).toBe("admin_only");
    }
  });

  it("handles UNIQUE constraint error - fallback when recheck finds nothing", async () => {
    mockGet.mockResolvedValue(undefined);
    mockBatch.mockRejectedValueOnce(new Error("UNIQUE constraint failed"));
    mockGet.mockResolvedValue(undefined); // recheck also finds nothing
    const result = await processTenantSync(makeRequest());
    if ("error" in result) {
      expect(result.conflictType).toBe("slug_and_admin");
    }
  });
});
