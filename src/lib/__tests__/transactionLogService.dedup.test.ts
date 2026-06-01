/**
 * Additional coverage for transactionLogService.ts:
 * - Deduplication logic in getTransactions
 * - Pagination offset (page 2+)
 * - DuplicateTransactionError message format
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TransactionLog } from "#/db/local-db";

vi.mock("#/db/local-db", () => {
  const transactionLog = {
    where: vi.fn((_index: string) => ({
      equals: vi.fn(),
      between: vi.fn(),
    })),
    add: vi.fn(),
    update: vi.fn(),
  };
  return {
    localDb: {
      transactionLog,
      transaction: vi.fn((_mode: string, _tables: unknown, callback: () => Promise<unknown>) =>
        callback(),
      ),
    },
  };
});

import { getTransactions, DuplicateTransactionError } from "../transactionLogService";
import { localDb } from "#/db/local-db";

function getMockedTable() {
  return localDb.transactionLog as unknown as {
    where: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

function makeEntry(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    id: 1,
    tenantId: "t-1",
    cardId: "aabbccdd",
    userId: null,
    cardName: null,
    counter: 1,
    type: "debit",
    amount: 5000,
    balanceAfter: 45000,
    timestamp: 1700000000,
    hash: "abc123",
    terminalId: null,
    deviceId: null,
    syncStatus: "pending",
    syncedAt: null,
    createdAt: 1700000000000,
    ...overrides,
  };
}

describe("getTransactions - deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the entry with higher syncPriority when duplicates exist", async () => {
    const table = getMockedTable();
    // Two entries with same cardId+counter but different syncStatus
    const entries: TransactionLog[] = [
      makeEntry({ id: 1, counter: 1, syncStatus: "pending", timestamp: 1000 }),
      makeEntry({ id: 2, counter: 1, syncStatus: "synced", timestamp: 1000 }),
    ];
    table.where.mockReturnValue({
      equals: vi.fn(),
      between: vi.fn().mockReturnValue({
        filter: (fn: (tx: TransactionLog) => boolean) => ({
          toArray: () => Promise.resolve(entries.filter(fn)),
        }),
      }),
    });

    const result = await getTransactions({ tenantId: "t-1", page: 1, pageSize: 20 });

    // Should deduplicate to 1 entry, keeping the "synced" one (higher priority)
    expect(result.total).toBe(1);
    expect(result.entries[0].syncStatus).toBe("synced");
  });

  it("keeps 'conflict' over 'failed' (conflict has higher priority)", async () => {
    const table = getMockedTable();
    const entries: TransactionLog[] = [
      makeEntry({ id: 1, counter: 2, syncStatus: "failed" as any, timestamp: 2000 }),
      makeEntry({ id: 2, counter: 2, syncStatus: "conflict", timestamp: 2000 }),
    ];
    table.where.mockReturnValue({
      equals: vi.fn(),
      between: vi.fn().mockReturnValue({
        filter: (fn: (tx: TransactionLog) => boolean) => ({
          toArray: () => Promise.resolve(entries.filter(fn)),
        }),
      }),
    });

    const result = await getTransactions({ tenantId: "t-1", page: 1, pageSize: 20 });
    expect(result.total).toBe(1);
    expect(result.entries[0].syncStatus).toBe("conflict");
  });

  it("keeps 'synced' over 'pending' (synced has highest priority)", async () => {
    const table = getMockedTable();
    const entries: TransactionLog[] = [
      makeEntry({ id: 1, counter: 3, syncStatus: "synced", timestamp: 3000 }),
      makeEntry({ id: 2, counter: 3, syncStatus: "pending", timestamp: 3000 }),
      makeEntry({ id: 3, counter: 3, syncStatus: "conflict", timestamp: 3000 }),
    ];
    table.where.mockReturnValue({
      equals: vi.fn(),
      between: vi.fn().mockReturnValue({
        filter: (fn: (tx: TransactionLog) => boolean) => ({
          toArray: () => Promise.resolve(entries.filter(fn)),
        }),
      }),
    });

    const result = await getTransactions({ tenantId: "t-1", page: 1, pageSize: 20 });
    expect(result.total).toBe(1);
    expect(result.entries[0].syncStatus).toBe("synced");
  });

  it("does not deduplicate entries with different counters", async () => {
    const table = getMockedTable();
    const entries: TransactionLog[] = [
      makeEntry({ id: 1, counter: 1, syncStatus: "pending", timestamp: 1000 }),
      makeEntry({ id: 2, counter: 2, syncStatus: "pending", timestamp: 2000 }),
    ];
    table.where.mockReturnValue({
      equals: vi.fn(),
      between: vi.fn().mockReturnValue({
        filter: (fn: (tx: TransactionLog) => boolean) => ({
          toArray: () => Promise.resolve(entries.filter(fn)),
        }),
      }),
    });

    const result = await getTransactions({ tenantId: "t-1", page: 1, pageSize: 20 });
    expect(result.total).toBe(2);
  });
});

describe("getTransactions - pagination offset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct slice for page 2", async () => {
    const table = getMockedTable();
    const entries: TransactionLog[] = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ id: i + 1, counter: i + 1, timestamp: 5000 - i * 1000 }),
    );
    table.where.mockReturnValue({
      equals: vi.fn(),
      between: vi.fn().mockReturnValue({
        filter: (fn: (tx: TransactionLog) => boolean) => ({
          toArray: () => Promise.resolve(entries.filter(fn)),
        }),
      }),
    });

    const result = await getTransactions({ tenantId: "t-1", page: 2, pageSize: 2 });

    expect(result.total).toBe(5);
    expect(result.entries).toHaveLength(2);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(2);
    // Page 2 = offset 2, so entries at index 2 and 3 (sorted desc by timestamp)
    // Sorted desc: timestamps 5000, 4000, 3000, 2000, 1000
    // Page 2 (offset=2, size=2): timestamps 3000, 2000
    expect(result.entries[0].timestamp).toBe(3000);
    expect(result.entries[1].timestamp).toBe(2000);
  });

  it("returns empty array for page beyond total", async () => {
    const table = getMockedTable();
    const entries: TransactionLog[] = [makeEntry({ id: 1, counter: 1 })];
    table.where.mockReturnValue({
      equals: vi.fn(),
      between: vi.fn().mockReturnValue({
        filter: (fn: (tx: TransactionLog) => boolean) => ({
          toArray: () => Promise.resolve(entries.filter(fn)),
        }),
      }),
    });

    const result = await getTransactions({ tenantId: "t-1", page: 5, pageSize: 10 });
    expect(result.entries).toHaveLength(0);
    expect(result.total).toBe(1);
  });

  it("returns all entries when pageSize exceeds total", async () => {
    const table = getMockedTable();
    const entries: TransactionLog[] = [
      makeEntry({ id: 1, counter: 1 }),
      makeEntry({ id: 2, counter: 2 }),
    ];
    table.where.mockReturnValue({
      equals: vi.fn(),
      between: vi.fn().mockReturnValue({
        filter: (fn: (tx: TransactionLog) => boolean) => ({
          toArray: () => Promise.resolve(entries.filter(fn)),
        }),
      }),
    });

    const result = await getTransactions({ tenantId: "t-1", page: 1, pageSize: 100 });
    expect(result.entries).toHaveLength(2);
  });
});

describe("DuplicateTransactionError", () => {
  it("has correct name", () => {
    const err = new DuplicateTransactionError("t-1", "aabb", 5);
    expect(err.name).toBe("DuplicateTransactionError");
  });

  it("includes tenantId, cardId, and counter in message", () => {
    const err = new DuplicateTransactionError("tenant-x", "card-y", 42);
    expect(err.message).toContain("tenant-x");
    expect(err.message).toContain("card-y");
    expect(err.message).toContain("42");
  });

  it("is an instance of Error", () => {
    const err = new DuplicateTransactionError("t", "c", 1);
    expect(err instanceof Error).toBe(true);
  });
});
