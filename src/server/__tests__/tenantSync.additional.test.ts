/**
 * Additional tests for tenantSync.ts covering uncovered lines:
 * - buildConflictResult (lines 262-290)
 * - processTenantSync (lines 341-391)
 */

import { describe, it, expect, vi } from "vitest";
import { buildConflictResult, processTenantSync } from "../tenantSync";

// ── buildConflictResult ────────────────────────────────────────────────

describe("buildConflictResult", () => {
  it("returns slug_and_admin conflict when both exist", () => {
    const result = buildConflictResult(
      { slug: "my-tenant", name: "My Tenant" },
      { tenantId: "t-1" },
    );
    expect(result.error).toBe("conflict");
    expect(result.conflictType).toBe("slug_and_admin");
    expect(result.existingTenantName).toBe("My Tenant");
    expect(result.existingSlug).toBe("my-tenant");
  });

  it("returns slug_only conflict when only slug exists", () => {
    const result = buildConflictResult({ slug: "taken-slug", name: "Taken Tenant" }, undefined);
    expect(result.error).toBe("conflict");
    expect(result.conflictType).toBe("slug_only");
    expect(result.existingTenantName).toBe("Taken Tenant");
    expect(result.existingSlug).toBe("taken-slug");
  });

  it("returns admin_only conflict when only admin exists", () => {
    const result = buildConflictResult(
      undefined,
      { tenantId: "t-1" },
      { slug: "admin-tenant", name: "Admin Tenant" },
    );
    expect(result.error).toBe("conflict");
    expect(result.conflictType).toBe("admin_only");
    expect(result.existingTenantName).toBe("Admin Tenant");
    expect(result.existingSlug).toBe("admin-tenant");
  });

  it("returns admin_only with Unknown defaults when conflictTenant is undefined", () => {
    const result = buildConflictResult(undefined, { tenantId: "t-1" }, undefined);
    expect(result.conflictType).toBe("admin_only");
    expect(result.existingTenantName).toBe("Unknown");
    expect(result.existingSlug).toBe("");
  });
});

// ── processTenantSync ──────────────────────────────────────────────────

// Mock the database module
vi.mock("#/infrastructure/persistence/drizzle", () => {
  let mockGetResult: unknown = undefined;
  let mockBatchThrow: string | null = null;

  const mockDb = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn().mockImplementation(() => Promise.resolve(mockGetResult)),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnThis(),
    })),
    batch: vi.fn().mockImplementation(() => {
      if (mockBatchThrow) {
        return Promise.reject(new Error(mockBatchThrow));
      }
      return Promise.resolve([]);
    }),
    __setGetResult: (val: unknown) => {
      mockGetResult = val;
    },
    __setBatchThrow: (msg: string | null) => {
      mockBatchThrow = msg;
    },
  };

  return {
    getDb: vi.fn(() => mockDb),
    __mockDb: mockDb,
  };
});

import { getDb } from "#/infrastructure/persistence/drizzle";

function getInternalMockDb() {
  return (
    getDb as unknown as () => ReturnType<typeof getDb> & {
      __setGetResult: (val: unknown) => void;
      __setBatchThrow: (msg: string | null) => void;
    }
  )();
}

const validRequest = {
  slug: "my-tenant",
  name: "My Tenant",
  timezone: "Asia/Jakarta",
  adminUsername: "admin",
  adminPasswordHash: `100000:${"a".repeat(32)}:${"b".repeat(64)}`,
};

describe("processTenantSync", () => {
  it("returns success response when no conflicts exist", async () => {
    const db = getInternalMockDb();
    db.__setGetResult(undefined);
    db.__setBatchThrow(null);

    const result = await processTenantSync(validRequest);

    expect("synced" in result).toBe(true);
    if ("synced" in result) {
      expect(result.synced).toBe(true);
      expect(result.slug).toBe("my-tenant");
      expect(result.name).toBe("My Tenant");
      expect(result.tenantId).toBeDefined();
    }
  });

  it("returns slug conflict when slug already exists", async () => {
    const db = getInternalMockDb();
    // First call (slug check) returns existing tenant
    let callCount = 0;
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve({ tenantId: "existing", slug: "my-tenant", name: "Existing" });
            }
            return Promise.resolve(undefined);
          }),
        })),
      })),
    }));

    const result = await processTenantSync(validRequest);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("conflict");
      expect(result.conflictType).toBe("slug_only");
    }
  });

  it("returns admin conflict when admin username already exists", async () => {
    const db = getInternalMockDb();
    let callCount = 0;
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve(undefined); // no slug conflict
            if (callCount === 2)
              return Promise.resolve({ accountId: "a1", tenantId: "t1", username: "admin" }); // admin conflict
            if (callCount === 3)
              return Promise.resolve({ tenantId: "t1", slug: "other-slug", name: "Other Tenant" }); // conflict tenant lookup
            return Promise.resolve(undefined);
          }),
        })),
      })),
    }));

    const result = await processTenantSync(validRequest);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("conflict");
      expect(result.conflictType).toBe("admin_only");
    }
  });

  it("handles UNIQUE constraint error during batch insert (race condition)", async () => {
    const db = getInternalMockDb();
    // No conflicts on pre-check
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    }));
    db.__setBatchThrow("UNIQUE constraint failed");

    const result = await processTenantSync(validRequest);

    // Should return a conflict response (fallback)
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("conflict");
    }
  });

  it("rethrows non-constraint errors", async () => {
    const db = getInternalMockDb();
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    }));
    db.__setBatchThrow("Database connection lost");

    await expect(processTenantSync(validRequest)).rejects.toThrow("Database connection lost");
  });
});
