// @vitest-environment jsdom
/**
 * Additional coverage for syncPush.ts
 * Targets: lines 114-145 (syncPush main flow), 203-506 (pushBatchWithRetry,
 *          processBatchResponse, processSingleBatch, syncPush full cycle)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TransactionLog } from "#/infrastructure/persistence/dexie/localDb";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
const mockIsDeviceBlocked = vi.fn().mockReturnValue(false);
const mockGetSyncableEntries = vi.fn();
const mockUpdateSyncStatus = vi.fn();
const mockGetAccessToken = vi.fn().mockReturnValue("token-abc");

vi.mock("#/infrastructure/api/apiClient", () => ({
  apiFetch: (...a: unknown[]) => mockApiFetch(...a),
  API_BASE_URL: "https://api.test",
  DeviceBlockedError: class DeviceBlockedError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "DeviceBlockedError";
    }
  },
  getAccessToken: () => mockGetAccessToken(),
}));

vi.mock("#/infrastructure/api/deviceBlock", () => ({
  isDeviceBlocked: () => mockIsDeviceBlocked(),
}));

vi.mock("#/infrastructure/persistence/dexie/transactionLogService", () => ({
  getSyncableEntries: (...a: unknown[]) => mockGetSyncableEntries(...a),
  updateSyncStatus: (...a: unknown[]) => mockUpdateSyncStatus(...a),
}));

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

function makeServerResponse(
  overrides: Partial<{
    accepted: number;
    rejected: { key: string; reason: string }[];
    serverCursor: string;
  }> = {},
) {
  return {
    ok: true,
    json: async () => ({
      accepted: 1,
      rejected: [],
      serverCursor: "1700000001",
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsDeviceBlocked.mockReturnValue(false);
  mockGetAccessToken.mockReturnValue("token-abc");
  mockUpdateSyncStatus.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── syncPush - early exits ────────────────────────────────────────────────────

describe("syncPush - early exits", () => {
  it("throws DeviceBlockedError when device is blocked at start", async () => {
    const { syncPush } = await import("../syncPush");
    mockIsDeviceBlocked.mockReturnValue(true);
    await expect(syncPush("tenant-1")).rejects.toMatchObject({ name: "DeviceBlockedError" });
  });

  it("throws DeviceBlockedError mid-batch when device becomes blocked", async () => {
    const { syncPush } = await import("../syncPush");
    // First call (start check) passes, second call (batch loop check) blocks
    mockIsDeviceBlocked.mockReturnValueOnce(false).mockReturnValue(true);
    mockGetSyncableEntries.mockResolvedValue([makeEntry({ id: 1 })]);
    await expect(syncPush("tenant-1")).rejects.toMatchObject({ name: "DeviceBlockedError" });
  });

  it("returns zero counts when no access token", async () => {
    const { syncPush } = await import("../syncPush");
    mockGetAccessToken.mockReturnValue(null);
    const result = await syncPush("tenant-1");
    expect(result).toEqual({
      totalAccepted: 0,
      totalRejected: 0,
      pullNeeded: false,
      conflictCount: 0,
      failedCount: 0,
    });
    expect(mockGetSyncableEntries).not.toHaveBeenCalled();
  });

  it("returns zero counts when no pending entries", async () => {
    const { syncPush } = await import("../syncPush");
    mockGetSyncableEntries.mockResolvedValue([]);
    const result = await syncPush("tenant-1");
    expect(result).toEqual({
      totalAccepted: 0,
      totalRejected: 0,
      pullNeeded: false,
      conflictCount: 0,
      failedCount: 0,
    });
  });

  it("marks corrupt entries as failed and returns early when all corrupt", async () => {
    const { syncPush } = await import("../syncPush");
    mockGetSyncableEntries.mockResolvedValue([makeEntry({ cardId: "" }), makeEntry({ hash: "" })]);
    const result = await syncPush("tenant-1");
    expect(result.failedCount).toBe(2);
    expect(result.totalAccepted).toBe(0);
    expect(mockUpdateSyncStatus).toHaveBeenCalledWith(1, "failed");
  });
});

// ── syncPush - successful push ────────────────────────────────────────────────

describe("syncPush - successful push", () => {
  it("marks accepted entries as synced", async () => {
    const { syncPush } = await import("../syncPush");
    mockGetSyncableEntries.mockResolvedValue([makeEntry({ id: 10 })]);
    mockApiFetch.mockResolvedValue(makeServerResponse({ accepted: 1, rejected: [] }));

    const result = await syncPush("tenant-1");
    expect(result.totalAccepted).toBe(1);
    expect(result.totalRejected).toBe(0);
    expect(mockUpdateSyncStatus).toHaveBeenCalledWith(10, "synced");
  });

  it("marks stale_counter entries as conflict and sets pullNeeded", async () => {
    const { syncPush } = await import("../syncPush");
    const entry = makeEntry({ id: 20, counter: 5 });
    mockGetSyncableEntries.mockResolvedValue([entry]);
    mockApiFetch.mockResolvedValue(
      makeServerResponse({
        accepted: 0,
        rejected: [{ key: "tenant-1:aabbccdd:5", reason: "stale_counter" }],
      }),
    );

    const result = await syncPush("tenant-1");
    expect(result.pullNeeded).toBe(true);
    expect(result.conflictCount).toBe(1);
    expect(mockUpdateSyncStatus).toHaveBeenCalledWith(20, "conflict");
  });

  it("marks non-stale rejected entries as failed", async () => {
    const { syncPush } = await import("../syncPush");
    const entry = makeEntry({ id: 30, counter: 5 });
    mockGetSyncableEntries.mockResolvedValue([entry]);
    mockApiFetch.mockResolvedValue(
      makeServerResponse({
        accepted: 0,
        rejected: [{ key: "tenant-1:aabbccdd:5", reason: "invalid_type" }],
      }),
    );

    const result = await syncPush("tenant-1");
    expect(result.failedCount).toBe(1);
    expect(mockUpdateSyncStatus).toHaveBeenCalledWith(30, "failed");
  });

  it("skips entries without id in processBatchResponse", async () => {
    const { syncPush } = await import("../syncPush");
    const entry = makeEntry({ id: undefined as unknown as number, counter: 5 });
    mockGetSyncableEntries.mockResolvedValue([entry]);
    mockApiFetch.mockResolvedValue(makeServerResponse({ accepted: 1, rejected: [] }));

    // Should not throw even with missing id
    await expect(syncPush("tenant-1")).resolves.toBeDefined();
  });
});

// ── pushBatchWithRetry - retry logic ─────────────────────────────────────────

describe("pushBatchWithRetry - retry and error handling", () => {
  it("retries on 5xx and eventually succeeds", async () => {
    const { syncPush } = await import("../syncPush");
    vi.useFakeTimers();
    mockGetSyncableEntries.mockResolvedValue([makeEntry({ id: 1 })]);
    // First call: 500, second call: 200
    mockApiFetch
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValue(makeServerResponse({ accepted: 1, rejected: [] }));

    const promise = syncPush("tenant-1");
    // Advance past backoff
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;
    expect(result.totalAccepted).toBe(1);
  });

  it("throws SyncPushError after max retries on persistent 5xx", async () => {
    const { syncPush, SyncPushError } = await import("../syncPush");
    vi.useFakeTimers();
    mockGetSyncableEntries.mockResolvedValue([makeEntry({ id: 1 })]);
    mockApiFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    let caught: unknown;
    const promise = syncPush("tenant-1").catch((e: unknown) => {
      caught = e;
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(caught).toBeInstanceOf(SyncPushError);
  });

  it("handles 429 rate limit by waiting Retry-After", async () => {
    const { syncPush } = await import("../syncPush");
    vi.useFakeTimers();
    mockGetSyncableEntries.mockResolvedValue([makeEntry({ id: 1 })]);
    mockApiFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (h: string) => (h === "Retry-After" ? "2" : null) },
        json: async () => ({}),
      })
      .mockResolvedValue(makeServerResponse({ accepted: 1, rejected: [] }));

    const promise = syncPush("tenant-1");
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;
    expect(result.totalAccepted).toBe(1);
  });

  it("marks batch as failed on non-retryable 4xx (400)", async () => {
    const { syncPush } = await import("../syncPush");
    mockGetSyncableEntries.mockResolvedValue([makeEntry({ id: 1 })]);
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ accepted: 0, rejected: [], serverCursor: "0" }),
    });

    const result = await syncPush("tenant-1");
    expect(result.failedCount).toBe(1);
    expect(mockUpdateSyncStatus).toHaveBeenCalledWith(1, "failed");
  });

  it("retries on network TypeError", async () => {
    const { syncPush } = await import("../syncPush");
    vi.useFakeTimers();
    mockGetSyncableEntries.mockResolvedValue([makeEntry({ id: 1 })]);
    mockApiFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(makeServerResponse({ accepted: 1, rejected: [] }));

    const promise = syncPush("tenant-1");
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;
    expect(result.totalAccepted).toBe(1);
  });

  it("re-throws DeviceBlockedError immediately without retry", async () => {
    const { syncPush } = await import("../syncPush");
    mockGetSyncableEntries.mockResolvedValue([makeEntry({ id: 1 })]);
    const { DeviceBlockedError } = await import("../api");
    mockApiFetch.mockRejectedValue(new DeviceBlockedError("blocked"));

    await expect(syncPush("tenant-1")).rejects.toMatchObject({ name: "DeviceBlockedError" });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});

// ── SyncPushError / NonRetryableServerError ───────────────────────────────────

describe("SyncPushError and NonRetryableServerError", () => {
  it("SyncPushError has correct name and stores cause", async () => {
    const { SyncPushError } = await import("../syncPush");
    const cause = new Error("root");
    const err = new SyncPushError("push failed", cause);
    expect(err.name).toBe("SyncPushError");
    expect(err.cause).toBe(cause);
    expect(err instanceof Error).toBe(true);
  });

  it("NonRetryableServerError stores statusCode and responseBody", async () => {
    const { NonRetryableServerError } = await import("../syncPush");
    const body = { accepted: 0, rejected: [], serverCursor: "0" };
    const err = new NonRetryableServerError("rejected", 400, body);
    expect(err.name).toBe("NonRetryableServerError");
    expect(err.statusCode).toBe(400);
    expect(err.responseBody).toBe(body);
  });
});
