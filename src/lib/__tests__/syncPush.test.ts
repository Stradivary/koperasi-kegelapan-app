// @vitest-environment jsdom
import type { TransactionLog } from "#/infrastructure/persistence/dexie/localDb";
import { describe, expect, it } from "vitest";
import {
  batchEntries,
  calculateBackoff,
  generateIdempotencyKey,
  INITIAL_BACKOFF_MS,
  isValidPushEntry,
  MAX_BACKOFF_MS,
  MAX_BATCH_SIZE,
  MAX_RETRY_ATTEMPTS,
  partitionEntries,
} from "../syncPush";

function makeEntry(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    id: 1,
    tenantId: "tenant-1",
    cardId: "aabbccdd",
    counter: 5,
    type: "debit",
    amount: 10000,
    balanceAfter: 40000,
    timestamp: 1700000000,
    hash: "deadbeef",
    syncStatus: "pending",
    userId: null,
    terminalId: 1,
    deviceId: "device-1",
    cardName: null,
    createdAt: 1700000000,
    ...overrides,
  } as TransactionLog;
}

describe("generateIdempotencyKey", () => {
  it("generates key in format tenantId:cardId:counter", () => {
    const entry = makeEntry({ tenantId: "t-1", cardId: "aabb", counter: 3 });
    expect(generateIdempotencyKey(entry)).toBe("t-1:aabb:3");
  });

  it("uses counter 0 correctly", () => {
    const entry = makeEntry({ counter: 0 });
    expect(generateIdempotencyKey(entry)).toBe("tenant-1:aabbccdd:0");
  });
});

describe("batchEntries", () => {
  it("returns single batch when entries <= batchSize", () => {
    const entries = [1, 2, 3];
    expect(batchEntries(entries, 5)).toEqual([[1, 2, 3]]);
  });

  it("splits into multiple batches", () => {
    const entries = [1, 2, 3, 4, 5];
    expect(batchEntries(entries, 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns empty array for empty input", () => {
    expect(batchEntries([], 10)).toEqual([]);
  });

  it("returns one batch per item when batchSize is 1", () => {
    expect(batchEntries([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it("respects MAX_BATCH_SIZE constant (500)", () => {
    expect(MAX_BATCH_SIZE).toBe(500);
  });
});

describe("calculateBackoff", () => {
  it("returns INITIAL_BACKOFF_MS for attempt 0", () => {
    expect(calculateBackoff(0)).toBe(INITIAL_BACKOFF_MS);
  });

  it("doubles each attempt", () => {
    expect(calculateBackoff(1)).toBe(INITIAL_BACKOFF_MS * 2);
    expect(calculateBackoff(2)).toBe(INITIAL_BACKOFF_MS * 4);
  });

  it("caps at MAX_BACKOFF_MS", () => {
    expect(calculateBackoff(100)).toBe(MAX_BACKOFF_MS);
  });

  it("MAX_BACKOFF_MS is 60000", () => {
    expect(MAX_BACKOFF_MS).toBe(60_000);
  });

  it("MAX_RETRY_ATTEMPTS is 10", () => {
    expect(MAX_RETRY_ATTEMPTS).toBe(10);
  });
});

describe("isValidPushEntry", () => {
  it("returns true for a valid entry", () => {
    expect(isValidPushEntry(makeEntry())).toBe(true);
  });

  it("returns false when cardId is empty string", () => {
    expect(isValidPushEntry(makeEntry({ cardId: "" }))).toBe(false);
  });

  it("returns false when cardId is null", () => {
    expect(isValidPushEntry(makeEntry({ cardId: null as unknown as string }))).toBe(false);
  });

  it("returns false when counter is NaN", () => {
    expect(isValidPushEntry(makeEntry({ counter: NaN }))).toBe(false);
  });

  it("returns false when counter is Infinity", () => {
    expect(isValidPushEntry(makeEntry({ counter: Infinity }))).toBe(false);
  });

  it("returns false when type is empty string", () => {
    expect(isValidPushEntry(makeEntry({ type: "" as TransactionLog["type"] }))).toBe(false);
  });

  it("returns false when type is null", () => {
    expect(isValidPushEntry(makeEntry({ type: null as unknown as TransactionLog["type"] }))).toBe(
      false,
    );
  });

  it("returns false when amount is NaN", () => {
    expect(isValidPushEntry(makeEntry({ amount: NaN }))).toBe(false);
  });

  it("returns false when hash is empty string", () => {
    expect(isValidPushEntry(makeEntry({ hash: "" }))).toBe(false);
  });

  it("returns false when hash is null", () => {
    expect(isValidPushEntry(makeEntry({ hash: null as unknown as string }))).toBe(false);
  });

  it("accepts amount = 0 as valid", () => {
    expect(isValidPushEntry(makeEntry({ amount: 0 }))).toBe(true);
  });

  it("accepts counter = 0 as valid", () => {
    expect(isValidPushEntry(makeEntry({ counter: 0 }))).toBe(true);
  });
});

describe("partitionEntries", () => {
  it("puts valid entries in valid array", () => {
    const entries = [makeEntry(), makeEntry({ counter: 2 })];
    const { valid, corrupt } = partitionEntries(entries);
    expect(valid).toHaveLength(2);
    expect(corrupt).toHaveLength(0);
  });

  it("puts corrupt entries in corrupt array", () => {
    const entries = [makeEntry(), makeEntry({ cardId: "" }), makeEntry({ hash: "" })];
    const { valid, corrupt } = partitionEntries(entries);
    expect(valid).toHaveLength(1);
    expect(corrupt).toHaveLength(2);
  });

  it("handles empty input", () => {
    const { valid, corrupt } = partitionEntries([]);
    expect(valid).toHaveLength(0);
    expect(corrupt).toHaveLength(0);
  });

  it("all corrupt when all entries are invalid", () => {
    const entries = [makeEntry({ cardId: "" }), makeEntry({ hash: "" })];
    const { valid, corrupt } = partitionEntries(entries);
    expect(valid).toHaveLength(0);
    expect(corrupt).toHaveLength(2);
  });
});
