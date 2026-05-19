import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  syncPush,
  batchEntries,
  calculateBackoff,
  generateIdempotencyKey,
  MAX_RETRY_ATTEMPTS,
  INITIAL_BACKOFF_MS,
  MAX_BACKOFF_MS,
  SyncPushError,
} from "../syncPush";
import { DeviceBlockedError } from "../api";
import type { TransactionLog } from "../../db/local-db";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("../deviceBlock", () => ({
  isDeviceBlocked: vi.fn().mockReturnValue(false),
  checkDeviceBlockResponse: vi.fn().mockResolvedValue(false),
}));

vi.mock("../indexeddb", () => ({
  tenantContextStore: {
    getAll: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../transactionLogService", () => ({
  getSyncableEntries: vi.fn().mockResolvedValue([]),
  updateSyncStatus: vi.fn().mockResolvedValue(undefined),
}));

import { isDeviceBlocked } from "../deviceBlock";
import { getSyncableEntries, updateSyncStatus } from "../transactionLogService";

// ── Helpers ────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    id: 1,
    tenantId: "t-1",
    cardId: "aabbccddee01",
    userId: null,
    counter: 1,
    type: "debit",
    amount: 100,
    balanceAfter: 900,
    timestamp: 1700000000,
    hash: "abcdef123456",
    terminalId: null,
    deviceId: null,
    syncStatus: "pending",
    syncedAt: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

function mockFetchResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("syncPush", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(isDeviceBlocked).mockReturnValue(false);
    vi.mocked(getSyncableEntries).mockResolvedValue([]);
    vi.mocked(updateSyncStatus).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns empty result when no pending entries exist", async () => {
    vi.mocked(getSyncableEntries).mockResolvedValue([]);

    const result = await syncPush("t-1");

    expect(result).toEqual({
      totalAccepted: 0,
      totalRejected: 0,
      pullNeeded: false,
      conflictCount: 0,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws DeviceBlockedError when device is blocked before starting", async () => {
    vi.mocked(isDeviceBlocked).mockReturnValue(true);

    await expect(syncPush("t-1")).rejects.toThrow(DeviceBlockedError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends pending entries to the push endpoint and marks accepted as synced", async () => {
    const entries = [makeEntry({ id: 1, counter: 1 }), makeEntry({ id: 2, counter: 2 })];
    vi.mocked(getSyncableEntries).mockResolvedValue(entries);
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ accepted: 2, rejected: [], serverCursor: "1700000001" }),
    );

    const result = await syncPush("t-1");

    expect(result.totalAccepted).toBe(2);
    expect(result.totalRejected).toBe(0);
    expect(result.pullNeeded).toBe(false);
    expect(result.conflictCount).toBe(0);

    // Both entries should be marked as synced
    expect(updateSyncStatus).toHaveBeenCalledWith(1, "synced");
    expect(updateSyncStatus).toHaveBeenCalledWith(2, "synced");
  });

  it("marks stale_counter rejections as conflict and sets pullNeeded", async () => {
    const entries = [
      makeEntry({ id: 1, counter: 1 }),
      makeEntry({ id: 2, counter: 2 }),
    ];
    vi.mocked(getSyncableEntries).mockResolvedValue(entries);
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({
        accepted: 1,
        rejected: [{ key: "t-1:aabbccddee01:1", reason: "stale_counter" }],
        serverCursor: "1700000001",
      }),
    );

    const result = await syncPush("t-1");

    expect(result.totalAccepted).toBe(1);
    expect(result.totalRejected).toBe(1);
    expect(result.pullNeeded).toBe(true);
    expect(result.conflictCount).toBe(1);

    // Entry 1 should be marked as conflict, entry 2 as synced
    expect(updateSyncStatus).toHaveBeenCalledWith(1, "conflict");
    expect(updateSyncStatus).toHaveBeenCalledWith(2, "synced");
  });

  it("includes idempotency_key in the push payload", async () => {
    const entry = makeEntry({ id: 1, tenantId: "t-1", cardId: "aabbccddee01", counter: 5 });
    vi.mocked(getSyncableEntries).mockResolvedValue([entry]);
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ accepted: 1, rejected: [], serverCursor: "1700000001" }),
    );

    await syncPush("t-1");

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.transactions[0].idempotencyKey).toBe("t-1:aabbccddee01:5");
  });

  it("batches entries into groups of max 500", async () => {
    // Create 750 entries — should result in 2 batches (500 + 250)
    const entries = Array.from({ length: 750 }, (_, i) =>
      makeEntry({ id: i + 1, counter: i + 1 }),
    );
    vi.mocked(getSyncableEntries).mockResolvedValue(entries);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockFetchResponse({ accepted: 500, rejected: [], serverCursor: "1700000001" }),
      )
      .mockResolvedValueOnce(
        mockFetchResponse({ accepted: 250, rejected: [], serverCursor: "1700000002" }),
      );

    const result = await syncPush("t-1");

    // Should have made 2 fetch calls
    expect(fetch).toHaveBeenCalledTimes(2);

    // First batch should have 500 entries
    const firstBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(firstBody.transactions.length).toBe(500);

    // Second batch should have 250 entries
    const secondBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string);
    expect(secondBody.transactions.length).toBe(250);

    expect(result.totalAccepted).toBe(750);
  }, 15000);

  it("retries on 5xx errors with exponential backoff", async () => {
    const entries = [makeEntry({ id: 1, counter: 1 })];
    vi.mocked(getSyncableEntries).mockResolvedValue(entries);

    // First 2 calls fail with 500, third succeeds
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockFetchResponse({ error: "internal" }, 500))
      .mockResolvedValueOnce(mockFetchResponse({ error: "internal" }, 500))
      .mockResolvedValueOnce(
        mockFetchResponse({ accepted: 1, rejected: [], serverCursor: "1700000001" }),
      );

    const promise = syncPush("t-1");

    // Advance past first backoff (1s)
    await vi.advanceTimersByTimeAsync(INITIAL_BACKOFF_MS);
    // Advance past second backoff (2s)
    await vi.advanceTimersByTimeAsync(INITIAL_BACKOFF_MS * 2);

    const result = await promise;

    expect(result.totalAccepted).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("throws SyncPushError after exhausting all retry attempts", async () => {
    const entries = [makeEntry({ id: 1, counter: 1 })];
    vi.mocked(getSyncableEntries).mockResolvedValue(entries);

    // All calls fail with 500
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ error: "internal" }, 500));

    const promise = syncPush("t-1");

    // Attach a catch handler immediately to prevent unhandled rejection warning
    let caughtError: unknown;
    const handled = promise.catch((e) => { caughtError = e; });

    // Advance through all backoff timers
    for (let i = 0; i < MAX_RETRY_ATTEMPTS; i++) {
      await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    }

    await handled;
    expect(caughtError).toBeInstanceOf(SyncPushError);
  });

  it("aborts if device becomes blocked between batches", async () => {
    const entries = Array.from({ length: 600 }, (_, i) =>
      makeEntry({ id: i + 1, counter: i + 1 }),
    );
    vi.mocked(getSyncableEntries).mockResolvedValue(entries);
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ accepted: 500, rejected: [], serverCursor: "1700000001" }),
    );

    // isDeviceBlocked is called:
    // 1. At start of syncPush (false)
    // 2. Before first batch in loop (false)
    // 3. Inside pushBatchWithRetry before fetch (false)
    // 4. Inside apiFetch before calling fetch (false)
    // 5. Before second batch in loop (true — blocked!)
    vi.mocked(isDeviceBlocked)
      .mockReturnValueOnce(false) // syncPush initial check
      .mockReturnValueOnce(false) // first batch loop check
      .mockReturnValueOnce(false) // pushBatchWithRetry check for first batch
      .mockReturnValueOnce(false) // apiFetch internal check for first batch
      .mockReturnValueOnce(true); // second batch loop check — blocked

    await expect(syncPush("t-1")).rejects.toThrow(DeviceBlockedError);
    // Only one batch should have been sent
    expect(fetch).toHaveBeenCalledTimes(1);
  }, 15000);

  it("handles 429 rate limiting with Retry-After header", async () => {
    const entries = [makeEntry({ id: 1, counter: 1 })];
    vi.mocked(getSyncableEntries).mockResolvedValue(entries);

    // First call returns 429, second succeeds
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockFetchResponse({ error: "rate_limited" }, 429, { "Retry-After": "3" }),
      )
      .mockResolvedValueOnce(
        mockFetchResponse({ accepted: 1, rejected: [], serverCursor: "1700000001" }),
      );

    const promise = syncPush("t-1");

    // Advance past the Retry-After period (3s)
    await vi.advanceTimersByTimeAsync(3000);

    const result = await promise;
    expect(result.totalAccepted).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("marks other rejection reasons as conflict", async () => {
    const entries = [makeEntry({ id: 1, counter: 1 })];
    vi.mocked(getSyncableEntries).mockResolvedValue(entries);
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({
        accepted: 0,
        rejected: [{ key: "t-1:aabbccddee01:1", reason: "tenant_mismatch" }],
        serverCursor: "1700000001",
      }),
    );

    const result = await syncPush("t-1");

    expect(result.conflictCount).toBe(1);
    expect(updateSyncStatus).toHaveBeenCalledWith(1, "conflict");
  });
});

// ── Helper function tests ──────────────────────────────────────────────

describe("batchEntries", () => {
  it("returns empty array for empty input", () => {
    expect(batchEntries([], 500)).toEqual([]);
  });

  it("returns single batch when entries fit within batch size", () => {
    const items = [1, 2, 3];
    const result = batchEntries(items, 500);
    expect(result).toEqual([[1, 2, 3]]);
  });

  it("splits entries into correct batch sizes", () => {
    const items = Array.from({ length: 1200 }, (_, i) => i);
    const result = batchEntries(items, 500);
    expect(result.length).toBe(3);
    expect(result[0].length).toBe(500);
    expect(result[1].length).toBe(500);
    expect(result[2].length).toBe(200);
  });
});

describe("calculateBackoff", () => {
  it("returns 1s for first attempt", () => {
    expect(calculateBackoff(0)).toBe(1000);
  });

  it("doubles each attempt", () => {
    expect(calculateBackoff(0)).toBe(1000);
    expect(calculateBackoff(1)).toBe(2000);
    expect(calculateBackoff(2)).toBe(4000);
    expect(calculateBackoff(3)).toBe(8000);
  });

  it("caps at MAX_BACKOFF_MS", () => {
    expect(calculateBackoff(10)).toBe(MAX_BACKOFF_MS);
    expect(calculateBackoff(20)).toBe(MAX_BACKOFF_MS);
  });
});

describe("generateIdempotencyKey", () => {
  it("generates key in format tenantId:cardId:counter", () => {
    const entry = makeEntry({ tenantId: "t-1", cardId: "aabbccddee01", counter: 42 });
    expect(generateIdempotencyKey(entry)).toBe("t-1:aabbccddee01:42");
  });
});
