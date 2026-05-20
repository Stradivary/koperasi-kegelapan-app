import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  syncPull,
  getSyncCursors,
  calculateBackoff,
  MAX_PULL_RETRY_ATTEMPTS,
  INITIAL_BACKOFF_MS,
  MAX_BACKOFF_MS,
  SyncPullError,
  SyncPullAuthError,
} from "../syncPull";
import { DeviceBlockedError } from "../api";

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

// Mock Dexie localDb
vi.mock("../../db/local-db", () => ({
  localDb: {
    users: {
      bulkPut: vi.fn().mockResolvedValue(undefined),
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
    cards: {
      bulkPut: vi.fn().mockResolvedValue(undefined),
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
    transactionLog: {
      bulkPut: vi.fn().mockResolvedValue(undefined),
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
    syncCursors: {
      where: vi.fn().mockReturnValue({
        between: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
    transaction: vi.fn().mockImplementation(
      async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => {
        await fn();
      },
    ),
  },
}));

import { isDeviceBlocked } from "../deviceBlock";
import { localDb } from "../../db/local-db";

// ── Helpers ────────────────────────────────────────────────────────────

function makePullResponse(overrides: {
  membersData?: unknown[];
  cardsData?: unknown[];
  txData?: unknown[];
  membersCursor?: string;
  cardsCursor?: string;
  txCursor?: string;
  membersHasMore?: boolean;
  cardsHasMore?: boolean;
  txHasMore?: boolean;
} = {}) {
  return {
    members: {
      data: overrides.membersData ?? [],
      cursor: overrides.membersCursor ?? "0",
      hasMore: overrides.membersHasMore ?? false,
    },
    cards: {
      data: overrides.cardsData ?? [],
      cursor: overrides.cardsCursor ?? "0",
      hasMore: overrides.cardsHasMore ?? false,
    },
    transactions: {
      data: overrides.txData ?? [],
      cursor: overrides.txCursor ?? "0",
      hasMore: overrides.txHasMore ?? false,
    },
  };
}

function mockFetchResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "t-1",
    userId: 1,
    name: "Test User",
    status: "active",
    createdAt: 1700000000,
    updatedAt: 1700000100,
    ...overrides,
  };
}

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "t-1",
    cardId: "aabbccddee01",
    userId: 1,
    status: "active",
    balance: 1000,
    counter: 5,
    keyVersion: 1,
    createdAt: 1700000000,
    lastActivityAt: 1700000050,
    expiresAt: null,
    notes: null,
    updatedAt: 1700000100,
    ...overrides,
  };
}

function makeTransaction(overrides: Record<string, unknown> = {}) {
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
    idempotencyKey: "t-1:aabbccddee01:1",
    flagged: 0,
    createdAt: 1700000000,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("syncPull", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(isDeviceBlocked).mockReturnValue(false);

    // Reset localDb mocks
    vi.mocked(localDb.syncCursors.where).mockReturnValue({
      between: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    } as any);
    vi.mocked(localDb.syncCursors.bulkPut).mockResolvedValue(undefined as any);
    vi.mocked(localDb.users.bulkPut).mockResolvedValue(undefined as any);
    vi.mocked(localDb.users.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    } as any);
    vi.mocked(localDb.cards.bulkPut).mockResolvedValue(undefined as any);
    vi.mocked(localDb.cards.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    } as any);
    vi.mocked(localDb.transactionLog.bulkPut).mockResolvedValue(undefined as any);
    vi.mocked(localDb.transactionLog.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    } as any);
    vi.mocked(localDb.transaction).mockImplementation(
      (async (_mode: any, _tables: any, fn: any) => {
        await fn();
      }) as any,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns zero counts when server returns empty data", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse(makePullResponse()),
    );

    const result = await syncPull("t-1");

    expect(result).toEqual({
      membersPulled: 0,
      cardsPulled: 0,
      transactionsPulled: 0,
      authRequired: false,
    });
  });

  it("throws DeviceBlockedError when device is blocked", async () => {
    vi.mocked(isDeviceBlocked).mockReturnValue(true);

    await expect(syncPull("t-1")).rejects.toThrow(DeviceBlockedError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("merges members into users table", async () => {
    const members = [makeMember({ userId: 1 }), makeMember({ userId: 2, name: "User 2" })];
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse(makePullResponse({ membersData: members, membersCursor: "1700000100" })),
    );

    const result = await syncPull("t-1");

    expect(result.membersPulled).toBe(2);
    expect(localDb.users.bulkPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ tenantId: "t-1", userId: 1, name: "Test User" }),
        expect.objectContaining({ tenantId: "t-1", userId: 2, name: "User 2" }),
      ]),
    );
  });

  it("merges cards into cards table", async () => {
    const cards = [makeCard({ cardId: "aabbccddee01" })];
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse(makePullResponse({ cardsData: cards, cardsCursor: "1700000100" })),
    );

    const result = await syncPull("t-1");

    expect(result.cardsPulled).toBe(1);
    expect(localDb.cards.bulkPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ tenantId: "t-1", cardId: "aabbccddee01", balance: 1000 }),
      ]),
    );
  });

  it("merges transactions into transactionLog table", async () => {
    const txs = [makeTransaction({ counter: 1 }), makeTransaction({ counter: 2, id: 2 })];
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse(makePullResponse({ txData: txs, txCursor: "1700000000" })),
    );

    const result = await syncPull("t-1");

    expect(result.transactionsPulled).toBe(2);
    expect(localDb.transactionLog.bulkPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "aabbccddee01", counter: 1, syncStatus: "synced" }),
        expect.objectContaining({ cardId: "aabbccddee01", counter: 2, syncStatus: "synced" }),
      ]),
    );
  });

  it("skips transactions with pending outbox entries", async () => {
    // Set up pending outbox entries for cardId:counter = "aabbccddee01:1"
    vi.mocked(localDb.transactionLog.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { cardId: "aabbccddee01", counter: 1, syncStatus: "pending" },
        ]),
      }),
    } as any);

    const txs = [
      makeTransaction({ counter: 1 }), // should be skipped
      makeTransaction({ counter: 2, id: 2 }), // should be merged
    ];
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse(makePullResponse({ txData: txs, txCursor: "1700000000" })),
    );

    const result = await syncPull("t-1");

    expect(result.transactionsPulled).toBe(1);
    expect(localDb.transactionLog.bulkPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ counter: 2, syncStatus: "synced" }),
      ]),
    );
  });

  it("paginates when hasMore is true", async () => {
    // First response: members hasMore=true
    const firstResponse = makePullResponse({
      membersData: [makeMember({ userId: 1 })],
      membersCursor: "1700000100",
      membersHasMore: true,
    });
    // Second response: all complete
    const secondResponse = makePullResponse({
      membersData: [makeMember({ userId: 2, updatedAt: 1700000200 })],
      membersCursor: "1700000200",
      membersHasMore: false,
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(mockFetchResponse(firstResponse))
      .mockResolvedValueOnce(mockFetchResponse(secondResponse));

    const result = await syncPull("t-1");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.membersPulled).toBe(2);
  });

  it("updates sync cursors after successful pull", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse(makePullResponse({
        membersCursor: "1700000100",
        cardsCursor: "1700000200",
        txCursor: "1700000300",
      })),
    );

    await syncPull("t-1");

    expect(localDb.syncCursors.bulkPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ tenantId: "t-1", entityType: "members", lastCursor: "1700000100" }),
        expect.objectContaining({ tenantId: "t-1", entityType: "cards", lastCursor: "1700000200" }),
        expect.objectContaining({ tenantId: "t-1", entityType: "transactions", lastCursor: "1700000300" }),
      ]),
    );
  });

  it("throws SyncPullAuthError on 401 response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ error: "Authentication required" }, 401),
    );

    await expect(syncPull("t-1")).rejects.toThrow(SyncPullAuthError);
  });

  it("retries on 5xx errors with exponential backoff", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockFetchResponse({ error: "internal" }, 500))
      .mockResolvedValueOnce(mockFetchResponse(makePullResponse()));

    const promise = syncPull("t-1");

    // Advance past first backoff (1s)
    await vi.advanceTimersByTimeAsync(INITIAL_BACKOFF_MS);

    const result = await promise;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.membersPulled).toBe(0);
  });

  it("throws SyncPullError after exhausting all retry attempts", async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ error: "internal" }, 500));

    const promise = syncPull("t-1");

    // Attach a catch handler immediately to prevent unhandled rejection warning
    let caughtError: unknown;
    const handled = promise.catch((e) => { caughtError = e; });

    // Advance through all backoff periods
    for (let i = 0; i < MAX_PULL_RETRY_ATTEMPTS; i++) {
      await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    }

    await handled;
    expect(caughtError).toBeInstanceOf(SyncPullError);
  });

  it("handles 429 rate limiting with Retry-After header", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockFetchResponse({ error: "rate_limited" }, 429, { "Retry-After": "3" }),
      )
      .mockResolvedValueOnce(mockFetchResponse(makePullResponse()));

    const promise = syncPull("t-1");

    // Advance past the Retry-After period (3s)
    await vi.advanceTimersByTimeAsync(3000);

    const result = await promise;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.membersPulled).toBe(0);
  });

  it("reads existing sync cursors from IndexedDB", async () => {
    vi.mocked(localDb.syncCursors.where).mockReturnValue({
      between: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { tenantId: "t-1", entityType: "members", lastCursor: "100", updatedAt: 1700000000 },
          { tenantId: "t-1", entityType: "cards", lastCursor: "200", updatedAt: 1700000000 },
          { tenantId: "t-1", entityType: "transactions", lastCursor: "300", updatedAt: 1700000000 },
        ]),
      }),
    } as any);

    vi.mocked(fetch).mockResolvedValue(mockFetchResponse(makePullResponse()));

    await syncPull("t-1");

    // Verify the fetch URL includes the cursor values
    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const url = fetchCall[0] as string;
    expect(url).toContain("membersCursor=100");
    expect(url).toContain("cardsCursor=200");
    expect(url).toContain("txCursor=300");
  });

  it("aborts mid-pagination if device becomes blocked", async () => {
    const firstResponse = makePullResponse({
      membersData: [makeMember({ userId: 1 })],
      membersCursor: "1700000100",
      membersHasMore: true,
    });

    vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse(firstResponse));

    // Device becomes blocked after first page
    // Call sequence:
    // 1. syncPull initial check → false
    // 2. while loop check (page 1) → false
    // 3. pullWithRetry check (page 1) → false
    // 4. apiFetch check (page 1) → false
    // 5. while loop check (page 2) → true (blocked!)
    vi.mocked(isDeviceBlocked)
      .mockReturnValueOnce(false) // syncPull initial check
      .mockReturnValueOnce(false) // while loop check (page 1)
      .mockReturnValueOnce(false) // pullWithRetry check (page 1)
      .mockReturnValueOnce(false) // apiFetch check (page 1)
      .mockReturnValueOnce(true); // while loop check (page 2) — blocked

    await expect(syncPull("t-1")).rejects.toThrow(DeviceBlockedError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("calculateBackoff", () => {
  it("returns INITIAL_BACKOFF_MS for attempt 0", () => {
    expect(calculateBackoff(0)).toBe(INITIAL_BACKOFF_MS);
  });

  it("doubles each attempt", () => {
    expect(calculateBackoff(1)).toBe(INITIAL_BACKOFF_MS * 2);
    expect(calculateBackoff(2)).toBe(INITIAL_BACKOFF_MS * 4);
    expect(calculateBackoff(3)).toBe(INITIAL_BACKOFF_MS * 8);
  });

  it("caps at MAX_BACKOFF_MS", () => {
    expect(calculateBackoff(20)).toBe(MAX_BACKOFF_MS);
  });
});

describe("getSyncCursors", () => {
  beforeEach(() => {
    vi.mocked(localDb.syncCursors.where).mockReturnValue({
      between: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    } as any);
  });

  it("returns '0' for all cursors when none exist", async () => {
    const cursors = await getSyncCursors("t-1");
    expect(cursors).toEqual({
      members: "0",
      cards: "0",
      transactions: "0",
    });
  });

  it("returns stored cursor values", async () => {
    vi.mocked(localDb.syncCursors.where).mockReturnValue({
      between: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { tenantId: "t-1", entityType: "members", lastCursor: "500", updatedAt: 1700000000 },
          { tenantId: "t-1", entityType: "cards", lastCursor: "600", updatedAt: 1700000000 },
        ]),
      }),
    } as any);

    const cursors = await getSyncCursors("t-1");
    expect(cursors).toEqual({
      members: "500",
      cards: "600",
      transactions: "0",
    });
  });
});
