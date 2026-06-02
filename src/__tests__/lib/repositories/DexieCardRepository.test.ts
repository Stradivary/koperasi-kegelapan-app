import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockFilter = vi.fn();
const mockToArray = vi.fn();
const mockUpdate = vi.fn();
const mockPut = vi.fn();

vi.mock("#/infrastructure/persistence/dexie/localDb", () => ({
  localDb: {
    cards: {
      get: (...args: unknown[]) => mockGet(...args),
      filter: (...args: unknown[]) => mockFilter(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      put: (...args: unknown[]) => mockPut(...args),
    },
  },
}));

import { DexieCardRepository } from "#/infrastructure/persistence/dexie/repositories/DexieCardRepository";

function makeDexieCard(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-1",
    cardId: "aabbccdd",
    userId: "user-1",
    status: "active",
    balance: 50000,
    counter: 5,
    keyVersion: 1,
    createdAt: 1700000000,
    lastActivityAt: 1700001000,
    expiresAt: null,
    notes: "test note",
    syncStatus: "synced",
    ...overrides,
  };
}

describe("DexieCardRepository", () => {
  let repo: DexieCardRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new DexieCardRepository();
    mockFilter.mockReturnValue({ toArray: mockToArray });
  });

  describe("getByTenantAndCardId", () => {
    it("delegates to localDb.cards.get with compound key", async () => {
      mockGet.mockResolvedValue(makeDexieCard());
      await repo.getByTenantAndCardId("tenant-1", "aabbccdd");
      expect(mockGet).toHaveBeenCalledWith(["tenant-1", "aabbccdd"]);
    });

    it("maps Dexie card to CardRecord (strips syncStatus)", async () => {
      mockGet.mockResolvedValue(makeDexieCard());
      const result = await repo.getByTenantAndCardId("tenant-1", "aabbccdd");
      expect(result).toEqual({
        tenantId: "tenant-1",
        cardId: "aabbccdd",
        userId: "user-1",
        status: "active",
        balance: 50000,
        counter: 5,
        keyVersion: 1,
        createdAt: 1700000000,
        lastActivityAt: 1700001000,
        expiresAt: null,
        notes: "test note",
      });
      expect(result).not.toHaveProperty("syncStatus");
    });

    it("returns undefined when card is not found", async () => {
      mockGet.mockResolvedValue(undefined);
      const result = await repo.getByTenantAndCardId("tenant-1", "nonexistent");
      expect(result).toBeUndefined();
    });

    it("maps all CardRecord fields correctly", async () => {
      const card = makeDexieCard({
        userId: null,
        status: "blocked_admin",
        balance: 0,
        lastActivityAt: null,
        expiresAt: 1800000000,
        notes: null,
      });
      mockGet.mockResolvedValue(card);
      const result = await repo.getByTenantAndCardId("tenant-1", "aabbccdd");
      expect(result).toEqual({
        tenantId: "tenant-1",
        cardId: "aabbccdd",
        userId: null,
        status: "blocked_admin",
        balance: 0,
        counter: 5,
        keyVersion: 1,
        createdAt: 1700000000,
        lastActivityAt: null,
        expiresAt: 1800000000,
        notes: null,
      });
    });
  });

  describe("filterByCardIdExcludingDeleted", () => {
    it("delegates to localDb.cards.filter and toArray", async () => {
      mockToArray.mockResolvedValue([]);
      await repo.filterByCardIdExcludingDeleted("aabbccdd");
      expect(mockFilter).toHaveBeenCalledWith(expect.any(Function));
    });

    it("filter function matches cardId and excludes deleted", async () => {
      mockToArray.mockResolvedValue([]);
      await repo.filterByCardIdExcludingDeleted("aabbccdd");

      const filterFn = mockFilter.mock.calls[0][0];
      expect(filterFn({ cardId: "aabbccdd", status: "active" })).toBe(true);
      expect(filterFn({ cardId: "aabbccdd", status: "deleted" })).toBe(false);
      expect(filterFn({ cardId: "other", status: "active" })).toBe(false);
    });

    it("maps results to CardRecord array (strips syncStatus)", async () => {
      mockToArray.mockResolvedValue([
        makeDexieCard({ cardId: "aabbccdd", tenantId: "t1" }),
        makeDexieCard({ cardId: "aabbccdd", tenantId: "t2" }),
      ]);
      const result = await repo.filterByCardIdExcludingDeleted("aabbccdd");
      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty("syncStatus");
      expect(result[1]).not.toHaveProperty("syncStatus");
      expect(result[0].tenantId).toBe("t1");
      expect(result[1].tenantId).toBe("t2");
    });

    it("returns empty array when no matches", async () => {
      mockToArray.mockResolvedValue([]);
      const result = await repo.filterByCardIdExcludingDeleted("nonexistent");
      expect(result).toEqual([]);
    });
  });

  describe("updateStatus", () => {
    it("delegates to localDb.cards.update with compound key and status", async () => {
      mockUpdate.mockResolvedValue(1);
      await repo.updateStatus("tenant-1", "aabbccdd", "blocked_admin");
      expect(mockUpdate).toHaveBeenCalledWith(["tenant-1", "aabbccdd"], {
        status: "blocked_admin",
      });
    });
  });

  describe("put", () => {
    it("delegates to localDb.cards.put with syncStatus added", async () => {
      mockPut.mockResolvedValue(undefined);
      const cardRecord = {
        tenantId: "tenant-1",
        cardId: "aabbccdd",
        userId: "user-1",
        status: "active" as const,
        balance: 50000,
        counter: 5,
        keyVersion: 1,
        createdAt: 1700000000,
        lastActivityAt: 1700001000,
        expiresAt: null,
        notes: null,
      };
      await repo.put(cardRecord);
      expect(mockPut).toHaveBeenCalledWith({
        ...cardRecord,
        syncStatus: "pending",
      });
    });

    it("adds syncStatus: 'pending' when writing", async () => {
      mockPut.mockResolvedValue(undefined);
      const cardRecord = {
        tenantId: "tenant-1",
        cardId: "newcard",
        userId: null,
        status: "blocked_admin" as const,
        balance: 0,
        counter: 0,
        keyVersion: 1,
        createdAt: 1700000000,
        lastActivityAt: null,
        expiresAt: null,
        notes: null,
      };
      await repo.put(cardRecord);
      const putArg = mockPut.mock.calls[0][0];
      expect(putArg.syncStatus).toBe("pending");
    });
  });
});
