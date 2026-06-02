import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();

vi.mock("#/infrastructure/persistence/dexie/localDb", () => ({
  localDb: {
    users: {
      get: (...args: unknown[]) => mockGet(...args),
    },
  },
}));

import { DexieUserRepository } from "#/infrastructure/persistence/dexie/repositories/DexieUserRepository";

function makeDexieUser(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-1",
    userId: "user-1",
    name: "Alice",
    status: "active",
    createdAt: 1700000000,
    updatedAt: 1700001000,
    syncStatus: "synced",
    ...overrides,
  };
}

describe("DexieUserRepository", () => {
  let repo: DexieUserRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new DexieUserRepository();
  });

  describe("getByTenantAndUserId", () => {
    it("delegates to localDb.users.get with compound key", async () => {
      mockGet.mockResolvedValue(makeDexieUser());
      await repo.getByTenantAndUserId("tenant-1", "user-1");
      expect(mockGet).toHaveBeenCalledWith(["tenant-1", "user-1"]);
    });

    it("maps Dexie user to UserRecord (only domain fields)", async () => {
      mockGet.mockResolvedValue(makeDexieUser());
      const result = await repo.getByTenantAndUserId("tenant-1", "user-1");
      expect(result).toEqual({
        tenantId: "tenant-1",
        userId: "user-1",
        name: "Alice",
        status: "active",
      });
      expect(result).not.toHaveProperty("syncStatus");
      expect(result).not.toHaveProperty("createdAt");
      expect(result).not.toHaveProperty("updatedAt");
    });

    it("returns undefined when user is not found", async () => {
      mockGet.mockResolvedValue(undefined);
      const result = await repo.getByTenantAndUserId("tenant-1", "nonexistent");
      expect(result).toBeUndefined();
    });

    it("maps all UserRecord fields correctly for different statuses", async () => {
      mockGet.mockResolvedValue(
        makeDexieUser({ status: "suspended", name: "Bob", userId: "user-2" }),
      );
      const result = await repo.getByTenantAndUserId("tenant-1", "user-2");
      expect(result).toEqual({
        tenantId: "tenant-1",
        userId: "user-2",
        name: "Bob",
        status: "suspended",
      });
    });

    it("handles deleted status", async () => {
      mockGet.mockResolvedValue(makeDexieUser({ status: "deleted" }));
      const result = await repo.getByTenantAndUserId("tenant-1", "user-1");
      expect(result?.status).toBe("deleted");
    });
  });
});
