/**
 * Additional coverage for syncPull.ts:
 * - 429 rate-limit response
 * - Card merge (pulling cards, skipping pending)
 * - Transaction merge (new, existing synced, existing unsynced, pending outbox skip)
 * - DeviceBlockedError mid-pagination
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/infrastructure/api/apiClient", () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: "https://api.test",
  DeviceBlockedError: class DeviceBlockedError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "DeviceBlockedError";
    }
  },
  getAccessToken: vi.fn(),
}));

vi.mock("#/infrastructure/api/deviceBlock", () => ({
  isDeviceBlocked: vi.fn(),
}));

vi.mock("#/infrastructure/persistence/dexie/localDb", () => {
  const syncCursors = {
    where: vi.fn().mockReturnThis(),
    between: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
    bulkPut: vi.fn().mockResolvedValue(undefined),
  };
  const users = {
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
    bulkPut: vi.fn().mockResolvedValue(undefined),
  };
  const cards = {
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
    bulkPut: vi.fn().mockResolvedValue(undefined),
  };
  const transactionLog = {
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
    bulkPut: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    first: vi.fn().mockResolvedValue(undefined),
  };
  return {
    localDb: {
      syncCursors,
      users,
      cards,
      transactionLog,
      transaction: vi
        .fn()
        .mockImplementation(async (_mode: unknown, _stores: unknown, fn: () => Promise<unknown>) =>
          fn(),
        ),
    },
  };
});

import { localDb } from "#/infrastructure/persistence/dexie/localDb";
import { apiFetch, getAccessToken } from "../api";
import { isDeviceBlocked } from "../deviceBlock";
import { syncPull } from "../syncPull";

const mockApiFetch = vi.mocked(apiFetch);
const mockGetAccessToken = vi.mocked(getAccessToken);
const mockIsDeviceBlocked = vi.mocked(isDeviceBlocked);

function makePullResponse(
  overrides: Partial<{
    cards: unknown[];
    cardsHasMore: boolean;
    transactions: unknown[];
    txHasMore: boolean;
    members: unknown[];
    membersHasMore: boolean;
  }> = {},
) {
  return {
    members: {
      data: overrides.members ?? [],
      cursor: "cursor-members-1",
      hasMore: overrides.membersHasMore ?? false,
    },
    cards: {
      data: overrides.cards ?? [],
      cursor: "cursor-cards-1",
      hasMore: overrides.cardsHasMore ?? false,
    },
    transactions: {
      data: overrides.transactions ?? [],
      cursor: "cursor-tx-1",
      hasMore: overrides.txHasMore ?? false,
    },
  };
}

function makeCardEntry(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "t-1",
    cardId: "aabbccdd",
    userId: null,
    status: "active",
    balance: 50000,
    counter: 1,
    keyVersion: 1,
    createdAt: 1000,
    lastActivityAt: null,
    expiresAt: null,
    notes: null,
    updatedAt: 2000,
    ...overrides,
  };
}

function makeTxEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tenantId: "t-1",
    cardId: "aabbccdd",
    userId: null,
    counter: 1,
    type: "debit",
    amount: 5000,
    balanceAfter: 45000,
    timestamp: 1700000000,
    hash: "abc123",
    terminalId: null,
    deviceId: null,
    idempotencyKey: "key-1",
    flagged: 0,
    createdAt: 1700000000000,
    ...overrides,
  };
}

describe("syncPull - additional coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDeviceBlocked.mockReturnValue(false);
    mockGetAccessToken.mockReturnValue("valid-token");
    (localDb.syncCursors.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (localDb.syncCursors.bulkPut as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (localDb.users.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (localDb.users.bulkPut as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (localDb.cards.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (localDb.cards.bulkPut as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (localDb.transactionLog.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (localDb.transactionLog.bulkPut as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    ((localDb.transactionLog as any).first as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
  });

  // ── 429 rate-limit ──────────────────────────────────────────────────────────

  it("retries after 429 with Retry-After header", async () => {
    const successResponse = makePullResponse();
    // First call: 429, second call: success
    mockApiFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (h: string) => (h === "Retry-After" ? "1" : null) },
      } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => successResponse } as Response);

    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn) => {
      (fn as () => void)();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    const result = await syncPull("t-1");
    expect(result.authRequired).toBe(false);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);

    vi.restoreAllMocks();
  });

  it("uses default 5s when Retry-After header is missing", async () => {
    const successResponse = makePullResponse();
    mockApiFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null },
      } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => successResponse } as Response);

    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn) => {
      (fn as () => void)();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    await syncPull("t-1");
    expect(mockApiFetch).toHaveBeenCalledTimes(2);

    vi.restoreAllMocks();
  });

  // ── Card merge ──────────────────────────────────────────────────────────────

  it("merges pulled cards into cards table", async () => {
    const response = makePullResponse({
      cards: [makeCardEntry({ cardId: "card-1" })],
    });
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => response } as Response);
    (localDb.cards.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await syncPull("t-1");

    expect(localDb.cards.bulkPut).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ cardId: "card-1", syncStatus: "synced" })]),
    );
  });

  it("skips pending cards during merge", async () => {
    const response = makePullResponse({
      cards: [makeCardEntry({ cardId: "pending-card" })],
    });
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => response } as Response);
    // Simulate pending card in local DB
    (localDb.cards.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([
      { tenantId: "t-1", cardId: "pending-card", syncStatus: "pending" },
    ]);

    await syncPull("t-1");

    const calls = (localDb.cards.bulkPut as ReturnType<typeof vi.fn>).mock.calls;
    if (calls.length > 0) {
      const putArgs = calls[0][0] as { cardId: string }[];
      expect(putArgs.find((c) => c.cardId === "pending-card")).toBeUndefined();
    }
  });

  // ── Transaction merge ───────────────────────────────────────────────────────

  it("merges new transactions into transactionLog table", async () => {
    const response = makePullResponse({
      transactions: [makeTxEntry({ cardId: "card-1", counter: 5 })],
    });
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => response } as Response);
    // No existing transaction
    ((localDb.transactionLog as any).first as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    // No pending outbox entries
    (localDb.transactionLog.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await syncPull("t-1");

    expect(localDb.transactionLog.bulkPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "card-1", counter: 5, syncStatus: "synced" }),
      ]),
    );
  });

  it("updates syncStatus when existing transaction is not yet synced", async () => {
    const response = makePullResponse({
      transactions: [makeTxEntry({ cardId: "card-1", counter: 3 })],
    });
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => response } as Response);
    // Existing transaction with pending status
    ((localDb.transactionLog as any).first as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 99,
      tenantId: "t-1",
      cardId: "card-1",
      counter: 3,
      syncStatus: "pending",
    });
    (localDb.transactionLog.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await syncPull("t-1");

    expect(localDb.transactionLog.update).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ syncStatus: "synced" }),
    );
  });

  it("does not update existing transaction that is already synced", async () => {
    const response = makePullResponse({
      transactions: [makeTxEntry({ cardId: "card-1", counter: 3 })],
    });
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => response } as Response);
    // Existing transaction already synced
    ((localDb.transactionLog as any).first as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 99,
      tenantId: "t-1",
      cardId: "card-1",
      counter: 3,
      syncStatus: "synced",
    });
    (localDb.transactionLog.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await syncPull("t-1");

    expect(localDb.transactionLog.update).not.toHaveBeenCalled();
  });

  it("skips transactions with pending outbox keys", async () => {
    const response = makePullResponse({
      transactions: [makeTxEntry({ cardId: "card-pending", counter: 7 })],
    });
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => response } as Response);
    // Pending outbox entry for this card+counter
    (localDb.transactionLog.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([
      { tenantId: "t-1", cardId: "card-pending", counter: 7, syncStatus: "pending" },
    ]);
    ((localDb.transactionLog as any).first as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );

    await syncPull("t-1");

    // bulkPut should not be called with the pending outbox entry
    const calls = (localDb.transactionLog.bulkPut as ReturnType<typeof vi.fn>).mock.calls;
    if (calls.length > 0) {
      const putArgs = calls[0][0] as { cardId: string; counter: number }[];
      expect(putArgs.find((t) => t.cardId === "card-pending" && t.counter === 7)).toBeUndefined();
    }
  });

  // ── DeviceBlockedError mid-pagination ───────────────────────────────────────

  it("throws DeviceBlockedError when device becomes blocked mid-pagination", async () => {
    const page1 = makePullResponse({ membersHasMore: true });

    mockApiFetch.mockResolvedValueOnce({ ok: true, json: async () => page1 } as Response);

    // Device becomes blocked after first page
    mockIsDeviceBlocked
      .mockReturnValueOnce(false) // initial check
      .mockReturnValueOnce(false) // first page check
      .mockReturnValueOnce(true); // second page check (mid-pagination)

    await expect(syncPull("t-1")).rejects.toThrow("Device is blocked");
  });

  // ── Result counts ───────────────────────────────────────────────────────────

  it("returns correct cardsPulled count", async () => {
    const response = makePullResponse({
      cards: [makeCardEntry({ cardId: "c1" }), makeCardEntry({ cardId: "c2" })],
    });
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => response } as Response);
    (localDb.cards.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await syncPull("t-1");
    expect(result.cardsPulled).toBe(2);
  });

  it("returns correct transactionsPulled count for new transactions", async () => {
    const response = makePullResponse({
      transactions: [
        makeTxEntry({ counter: 1 }),
        makeTxEntry({ counter: 2 }),
        makeTxEntry({ counter: 3 }),
      ],
    });
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => response } as Response);
    ((localDb.transactionLog as any).first as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    (localDb.transactionLog.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await syncPull("t-1");
    expect(result.transactionsPulled).toBe(3);
  });
});
