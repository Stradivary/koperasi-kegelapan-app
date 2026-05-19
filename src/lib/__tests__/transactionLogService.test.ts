import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TransactionLog } from "../../db/local-db";

// Mock the local-db module — factory must not reference outer variables
vi.mock("../../db/local-db", () => {
  const mockAdd = vi.fn();
  const mockUpdate = vi.fn();

  return {
    localDb: {
      transactionLog: {
        where: vi.fn((index: string) => {
          return {
            equals: vi.fn(),
            between: vi.fn(),
          };
        }),
        add: mockAdd,
        update: mockUpdate,
      },
    },
  };
});

// Import after mock setup
import {
  recordTransaction,
  getTransactions,
  getTransactionsByCard,
  getSyncableEntries,
  updateSyncStatus,
  DuplicateTransactionError,
  TransactionWriteError,
  type TransactionInput,
} from "../transactionLogService";
import { localDb } from "../../db/local-db";

function makeEntry(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    tenantId: "tenant-1",
    cardId: "aabbccddee01",
    userId: null,
    counter: 1,
    type: "debit",
    amount: 5000,
    balanceAfter: 15000,
    timestamp: 1700000000000,
    hash: "abc123def456",
    terminalId: null,
    deviceId: null,
    ...overrides,
  };
}

// Helper to get the mocked table
function getMockedTable() {
  return localDb.transactionLog as unknown as {
    where: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

describe("transactionLogService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordTransaction", () => {
    it("persists a transaction with syncStatus pending, syncedAt null, and createdAt set", async () => {
      const table = getMockedTable();
      const mockFirst = vi.fn().mockResolvedValue(undefined);
      table.where.mockReturnValue({
        equals: vi.fn().mockReturnValue({ first: mockFirst }),
        between: vi.fn(),
      });
      table.add.mockResolvedValue(42);

      const entry = makeEntry();
      const now = 1700000000000;
      vi.setSystemTime(now);

      const result = await recordTransaction(entry);

      expect(result.syncStatus).toBe("pending");
      expect(result.syncedAt).toBeNull();
      expect(result.createdAt).toBe(now);
      expect(result.id).toBe(42);
      expect(table.add).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("rejects duplicate composite key [tenantId, cardId, counter]", async () => {
      const table = getMockedTable();
      const mockFirst = vi.fn().mockResolvedValue({ id: 1, tenantId: "tenant-1", cardId: "aabbccddee01", counter: 1 });
      table.where.mockReturnValue({
        equals: vi.fn().mockReturnValue({ first: mockFirst }),
        between: vi.fn(),
      });

      const entry = makeEntry();

      await expect(recordTransaction(entry)).rejects.toThrow(DuplicateTransactionError);
      expect(table.add).not.toHaveBeenCalled();
    });

    it("retries once on IndexedDB write failure", async () => {
      const table = getMockedTable();
      const mockFirst = vi.fn().mockResolvedValue(undefined);
      table.where.mockReturnValue({
        equals: vi.fn().mockReturnValue({ first: mockFirst }),
        between: vi.fn(),
      });
      table.add
        .mockRejectedValueOnce(new Error("QuotaExceededError"))
        .mockResolvedValueOnce(7);

      const entry = makeEntry();
      const result = await recordTransaction(entry);

      expect(table.add).toHaveBeenCalledTimes(2);
      expect(result.id).toBe(7);
    });

    it("throws TransactionWriteError after retry also fails", async () => {
      const table = getMockedTable();
      const mockFirst = vi.fn().mockResolvedValue(undefined);
      table.where.mockReturnValue({
        equals: vi.fn().mockReturnValue({ first: mockFirst }),
        between: vi.fn(),
      });
      table.add
        .mockRejectedValueOnce(new Error("QuotaExceededError"))
        .mockRejectedValueOnce(new Error("QuotaExceededError"));

      const entry = makeEntry();

      await expect(recordTransaction(entry)).rejects.toThrow(TransactionWriteError);
      expect(table.add).toHaveBeenCalledTimes(2);
    });

    it("throws DuplicateTransactionError immediately on ConstraintError (no retry)", async () => {
      const table = getMockedTable();
      const mockFirst = vi.fn().mockResolvedValue(undefined);
      table.where.mockReturnValue({
        equals: vi.fn().mockReturnValue({ first: mockFirst }),
        between: vi.fn(),
      });
      const constraintErr = new Error("ConstraintError");
      constraintErr.name = "ConstraintError";
      table.add.mockRejectedValueOnce(constraintErr);

      const entry = makeEntry();

      await expect(recordTransaction(entry)).rejects.toThrow(DuplicateTransactionError);
      expect(table.add).toHaveBeenCalledTimes(1);
    });
  });

  describe("getTransactions", () => {
    it("returns paginated results sorted by timestamp descending", async () => {
      const table = getMockedTable();
      const entries: TransactionLog[] = [
        { ...makeEntry({ timestamp: 1000 }), id: 1, syncStatus: "pending", syncedAt: null, createdAt: 1700000000000 },
        { ...makeEntry({ counter: 2, timestamp: 3000 }), id: 2, syncStatus: "pending", syncedAt: null, createdAt: 1700000001000 },
        { ...makeEntry({ counter: 3, timestamp: 2000 }), id: 3, syncStatus: "pending", syncedAt: null, createdAt: 1700000002000 },
      ];

      table.where.mockReturnValue({
        equals: vi.fn(),
        between: vi.fn().mockReturnValue({
          filter: (fn: (tx: TransactionLog) => boolean) => ({
            toArray: () => Promise.resolve(entries.filter(fn)),
          }),
        }),
      });

      const result = await getTransactions({
        tenantId: "tenant-1",
        page: 1,
        pageSize: 2,
      });

      expect(result.total).toBe(3);
      expect(result.entries).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
      // Sorted descending by timestamp
      expect(result.entries[0].timestamp).toBe(3000);
      expect(result.entries[1].timestamp).toBe(2000);
    });

    it("filters by cardId (case-insensitive)", async () => {
      const table = getMockedTable();
      const entries: TransactionLog[] = [
        { ...makeEntry({ cardId: "AABBCCDDEE01" }), id: 1, syncStatus: "pending", syncedAt: null, createdAt: 1700000000000 },
        { ...makeEntry({ cardId: "112233445566", counter: 2 }), id: 2, syncStatus: "pending", syncedAt: null, createdAt: 1700000001000 },
      ];

      table.where.mockReturnValue({
        equals: vi.fn(),
        between: vi.fn().mockReturnValue({
          filter: (fn: (tx: TransactionLog) => boolean) => ({
            toArray: () => Promise.resolve(entries.filter(fn)),
          }),
        }),
      });

      const result = await getTransactions({
        tenantId: "tenant-1",
        cardId: "aabbccddee01",
        page: 1,
        pageSize: 20,
      });

      expect(result.total).toBe(1);
      expect(result.entries[0].cardId).toBe("AABBCCDDEE01");
    });

    it("filters by type", async () => {
      const table = getMockedTable();
      const entries: TransactionLog[] = [
        { ...makeEntry({ type: "debit" }), id: 1, syncStatus: "pending", syncedAt: null, createdAt: 1700000000000 },
        { ...makeEntry({ type: "credit", counter: 2 }), id: 2, syncStatus: "pending", syncedAt: null, createdAt: 1700000001000 },
      ];

      table.where.mockReturnValue({
        equals: vi.fn(),
        between: vi.fn().mockReturnValue({
          filter: (fn: (tx: TransactionLog) => boolean) => ({
            toArray: () => Promise.resolve(entries.filter(fn)),
          }),
        }),
      });

      const result = await getTransactions({
        tenantId: "tenant-1",
        type: "credit",
        page: 1,
        pageSize: 20,
      });

      expect(result.total).toBe(1);
      expect(result.entries[0].type).toBe("credit");
    });

    it("filters by date range (inclusive on both bounds)", async () => {
      const table = getMockedTable();
      const entries: TransactionLog[] = [
        { ...makeEntry({ timestamp: 1000 }), id: 1, syncStatus: "pending", syncedAt: null, createdAt: 1700000000000 },
        { ...makeEntry({ timestamp: 2000, counter: 2 }), id: 2, syncStatus: "pending", syncedAt: null, createdAt: 1700000001000 },
        { ...makeEntry({ timestamp: 3000, counter: 3 }), id: 3, syncStatus: "pending", syncedAt: null, createdAt: 1700000002000 },
      ];

      table.where.mockReturnValue({
        equals: vi.fn(),
        between: vi.fn().mockReturnValue({
          filter: (fn: (tx: TransactionLog) => boolean) => ({
            toArray: () => Promise.resolve(entries.filter(fn)),
          }),
        }),
      });

      const result = await getTransactions({
        tenantId: "tenant-1",
        dateFrom: 1000,
        dateTo: 2000,
        page: 1,
        pageSize: 20,
      });

      expect(result.total).toBe(2);
      expect(result.entries.every((e) => e.timestamp >= 1000 && e.timestamp <= 2000)).toBe(true);
    });

    it("applies multiple filters as logical AND", async () => {
      const table = getMockedTable();
      const entries: TransactionLog[] = [
        { ...makeEntry({ cardId: "aabbccddee01", type: "debit", timestamp: 1500 }), id: 1, syncStatus: "pending", syncedAt: null, createdAt: 1700000000000 },
        { ...makeEntry({ cardId: "aabbccddee01", type: "credit", timestamp: 1500, counter: 2 }), id: 2, syncStatus: "pending", syncedAt: null, createdAt: 1700000001000 },
        { ...makeEntry({ cardId: "112233445566", type: "debit", timestamp: 1500, counter: 3 }), id: 3, syncStatus: "pending", syncedAt: null, createdAt: 1700000002000 },
      ];

      table.where.mockReturnValue({
        equals: vi.fn(),
        between: vi.fn().mockReturnValue({
          filter: (fn: (tx: TransactionLog) => boolean) => ({
            toArray: () => Promise.resolve(entries.filter(fn)),
          }),
        }),
      });

      const result = await getTransactions({
        tenantId: "tenant-1",
        cardId: "aabbccddee01",
        type: "debit",
        dateFrom: 1000,
        dateTo: 2000,
        page: 1,
        pageSize: 20,
      });

      expect(result.total).toBe(1);
      expect(result.entries[0].id).toBe(1);
    });

    it("filters by syncStatus", async () => {
      const table = getMockedTable();
      const entries: TransactionLog[] = [
        { ...makeEntry(), id: 1, syncStatus: "pending", syncedAt: null, createdAt: 1700000000000 },
        { ...makeEntry({ counter: 2 }), id: 2, syncStatus: "synced", syncedAt: 1700000005000, createdAt: 1700000001000 },
      ];

      table.where.mockReturnValue({
        equals: vi.fn(),
        between: vi.fn().mockReturnValue({
          filter: (fn: (tx: TransactionLog) => boolean) => ({
            toArray: () => Promise.resolve(entries.filter(fn)),
          }),
        }),
      });

      const result = await getTransactions({
        tenantId: "tenant-1",
        syncStatus: "synced",
        page: 1,
        pageSize: 20,
      });

      expect(result.total).toBe(1);
      expect(result.entries[0].syncStatus).toBe("synced");
    });
  });

  describe("getTransactionsByCard", () => {
    it("queries by tenantId + cardId using compound index", async () => {
      const table = getMockedTable();
      const entries: TransactionLog[] = [
        { ...makeEntry(), id: 1, syncStatus: "pending", syncedAt: null, createdAt: 1700000000000 },
      ];

      table.where.mockReturnValue({
        equals: vi.fn(),
        between: vi.fn().mockReturnValue({ toArray: () => Promise.resolve(entries) }),
      });

      const result = await getTransactionsByCard("tenant-1", "aabbccddee01");

      expect(result).toHaveLength(1);
      expect(table.where).toHaveBeenCalledWith("[tenantId+cardId+counter]");
    });
  });

  describe("getSyncableEntries", () => {
    it("queries by tenantId + syncStatus pending", async () => {
      const table = getMockedTable();
      const entries: TransactionLog[] = [
        { ...makeEntry(), id: 1, syncStatus: "pending", syncedAt: null, createdAt: 1700000000000 },
      ];

      const mockToArray = vi.fn().mockResolvedValue(entries);
      table.where.mockReturnValue({
        equals: vi.fn().mockReturnValue({ toArray: mockToArray }),
        between: vi.fn(),
      });

      const result = await getSyncableEntries("tenant-1");

      expect(result).toHaveLength(1);
      expect(table.where).toHaveBeenCalledWith("[tenantId+syncStatus]");
    });
  });

  describe("updateSyncStatus", () => {
    it("updates syncStatus to synced with syncedAt timestamp", async () => {
      const table = getMockedTable();
      table.update.mockResolvedValue(1);
      const now = 1700000000000;
      vi.setSystemTime(now);

      await updateSyncStatus(42, "synced");

      expect(table.update).toHaveBeenCalledWith(42, { syncStatus: "synced", syncedAt: now });

      vi.useRealTimers();
    });

    it("updates syncStatus to conflict without setting syncedAt", async () => {
      const table = getMockedTable();
      table.update.mockResolvedValue(1);

      await updateSyncStatus(42, "conflict");

      expect(table.update).toHaveBeenCalledWith(42, { syncStatus: "conflict" });
    });

    it("updates syncStatus to pending without setting syncedAt", async () => {
      const table = getMockedTable();
      table.update.mockResolvedValue(1);

      await updateSyncStatus(42, "pending");

      expect(table.update).toHaveBeenCalledWith(42, { syncStatus: "pending" });
    });
  });
});
