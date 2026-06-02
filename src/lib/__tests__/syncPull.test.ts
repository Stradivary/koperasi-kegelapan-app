/**
 * Tests for src/lib/syncPull.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks must use inline factories (no top-level variable references) ────────

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
import {
  calculateBackoff,
  getSyncCursors,
  INITIAL_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_PULL_RETRY_ATTEMPTS,
  syncPull,
  SyncPullAuthError,
  SyncPullError,
} from "../syncPull";

const mockApiFetch = vi.mocked(apiFetch);
const mockGetAccessToken = vi.mocked(getAccessToken);
const mockIsDeviceBlocked = vi.mocked(isDeviceBlocked);

function makePullResponse(
  overrides: Partial<{
    membersHasMore: boolean;
    cardsHasMore: boolean;
    txHasMore: boolean;
    members: unknown[];
  }> = {},
) {
  return {
    members: {
      data: overrides.members ?? [],
      cursor: "cursor-members-1",
      hasMore: overrides.membersHasMore ?? false,
    },
    cards: {
      data: [],
      cursor: "cursor-cards-1",
      hasMore: overrides.cardsHasMore ?? false,
    },
    transactions: {
      data: [],
      cursor: "cursor-tx-1",
      hasMore: overrides.txHasMore ?? false,
    },
  };
}

describe("calculateBackoff", () => {
  it("starts at INITIAL_BACKOFF_MS for attempt 0", () => {
    expect(calculateBackoff(0)).toBe(INITIAL_BACKOFF_MS);
  });

  it("doubles each attempt", () => {
    expect(calculateBackoff(1)).toBe(INITIAL_BACKOFF_MS * 2);
    expect(calculateBackoff(2)).toBe(INITIAL_BACKOFF_MS * 4);
  });

  it("caps at MAX_BACKOFF_MS", () => {
    expect(calculateBackoff(100)).toBe(MAX_BACKOFF_MS);
  });
});

describe("getSyncCursors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (localDb.syncCursors.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("returns default cursors when none exist", async () => {
    const cursors = await getSyncCursors("t-1");
    expect(cursors).toEqual({ members: "0", cards: "0", transactions: "0" });
  });

  it("returns stored cursors when they exist", async () => {
    (localDb.syncCursors.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([
      { entityType: "members", lastCursor: "cursor-100" },
      { entityType: "cards", lastCursor: "cursor-200" },
      { entityType: "transactions", lastCursor: "cursor-300" },
    ]);

    const cursors = await getSyncCursors("t-1");
    expect(cursors).toEqual({
      members: "cursor-100",
      cards: "cursor-200",
      transactions: "cursor-300",
    });
  });
});

describe("syncPull", () => {
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

  it("returns empty result when no access token", async () => {
    mockGetAccessToken.mockReturnValue(null);

    const result = await syncPull("t-1");
    expect(result).toEqual({
      membersPulled: 0,
      cardsPulled: 0,
      transactionsPulled: 0,
      authRequired: false,
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("throws DeviceBlockedError when device is blocked before starting", async () => {
    mockIsDeviceBlocked.mockReturnValue(true);

    await expect(syncPull("t-1")).rejects.toThrow("Device is blocked");
  });

  it("completes a single-page pull successfully", async () => {
    const response = makePullResponse();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    const result = await syncPull("t-1");
    expect(result.authRequired).toBe(false);
    expect(mockApiFetch).toHaveBeenCalledOnce();
  });

  it("paginates when hasMore is true", async () => {
    const page1 = makePullResponse({ membersHasMore: true });
    const page2 = makePullResponse({ membersHasMore: false });

    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: async () => page1 } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => page2 } as Response);

    await syncPull("t-1");
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it("throws SyncPullAuthError on 401 response", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 401 } as Response);

    await expect(syncPull("t-1")).rejects.toThrow(SyncPullAuthError);
  });

  it("throws SyncPullError on non-retryable 4xx (not 401)", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 403 } as Response);

    // Speed up by mocking setTimeout
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn) => {
      (fn as () => void)();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    // 403 throws SyncPullError (after retries exhaust)
    await expect(syncPull("t-1")).rejects.toThrow(SyncPullError);

    vi.restoreAllMocks();
  });

  it("updates sync cursors after successful pull", async () => {
    const response = makePullResponse();
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => response } as Response);

    await syncPull("t-1");

    expect(localDb.syncCursors.bulkPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "members", lastCursor: "cursor-members-1" }),
        expect.objectContaining({ entityType: "cards", lastCursor: "cursor-cards-1" }),
        expect.objectContaining({ entityType: "transactions", lastCursor: "cursor-tx-1" }),
      ]),
    );
  });

  it("merges pulled members into users table", async () => {
    const response = {
      ...makePullResponse(),
      members: {
        data: [
          {
            tenantId: "t-1",
            userId: "u-1",
            name: "Alice",
            status: "active",
            createdAt: 1000,
            updatedAt: 2000,
          },
        ],
        cursor: "c-1",
        hasMore: false,
      },
    };
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => response } as Response);
    (localDb.users.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await syncPull("t-1");

    expect(localDb.users.bulkPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ userId: "u-1", name: "Alice", syncStatus: "synced" }),
      ]),
    );
  });

  it("skips pending members during merge", async () => {
    const response = {
      ...makePullResponse(),
      members: {
        data: [
          {
            tenantId: "t-1",
            userId: "u-pending",
            name: "Pending User",
            status: "active",
            createdAt: 1000,
            updatedAt: 2000,
          },
        ],
        cursor: "c-1",
        hasMore: false,
      },
    };
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => response } as Response);
    // Simulate pending member
    (localDb.users.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([
      { tenantId: "t-1", userId: "u-pending" },
    ]);

    await syncPull("t-1");

    // bulkPut should not be called with the pending member
    const calls = (localDb.users.bulkPut as ReturnType<typeof vi.fn>).mock.calls;
    if (calls.length > 0) {
      const putArgs = calls[0][0] as { userId: string }[];
      expect(putArgs.find((u) => u.userId === "u-pending")).toBeUndefined();
    }
  });

  it("throws SyncPullError after max retries on 5xx", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

    // Speed up by mocking setTimeout
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn) => {
      (fn as () => void)();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    await expect(syncPull("t-1")).rejects.toThrow(SyncPullError);
    expect(mockApiFetch).toHaveBeenCalledTimes(MAX_PULL_RETRY_ATTEMPTS);

    vi.restoreAllMocks();
  });
});
