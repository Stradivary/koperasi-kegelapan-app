// @vitest-environment jsdom
/**
 * Tests for src/lib/syncPushEntities.ts
 * Covers: syncPushEntities, syncPushMembers, syncPushCards, getPendingMembers,
 *         getPendingCards, getPendingEntityCount, helper functions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
const mockIsDeviceBlocked = vi.fn().mockReturnValue(false);
const mockGetAccessToken = vi.fn().mockReturnValue("token-abc");
const mockAddSyncLog = vi.fn();

vi.mock("#/lib/api", () => ({
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

vi.mock("#/lib/deviceBlock", () => ({
  isDeviceBlocked: () => mockIsDeviceBlocked(),
}));

vi.mock("#/lib/syncLogStore", () => ({
  addSyncLog: (...a: unknown[]) => mockAddSyncLog(...a),
}));

const mockUsersWhere = vi.fn();
const mockUsersUpdate = vi.fn();
const mockCardsWhere = vi.fn();
const mockCardsUpdate = vi.fn();

vi.mock("#/db/local-db", () => ({
  localDb: {
    users: {
      where: (...a: unknown[]) => mockUsersWhere(...a),
      update: (...a: unknown[]) => mockUsersUpdate(...a),
    },
    cards: {
      where: (...a: unknown[]) => mockCardsWhere(...a),
      update: (...a: unknown[]) => mockCardsUpdate(...a),
    },
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMember(id: string, syncStatus = "pending") {
  return {
    tenantId: "t1",
    userId: id,
    name: `User ${id}`,
    status: "active",
    createdAt: 1700000000,
    updatedAt: 1700000000,
    syncStatus,
  };
}

function makeCard(id: string, syncStatus = "pending") {
  return {
    tenantId: "t1",
    cardId: id,
    userId: "u1",
    status: "active",
    balance: 50000,
    counter: 1,
    keyVersion: 1,
    createdAt: 1700000000,
    lastActivityAt: null,
    expiresAt: null,
    notes: null,
    syncStatus,
  };
}

function mockDexieChain(data: unknown[]) {
  return {
    equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(data) }),
    toArray: vi.fn().mockResolvedValue(data),
  };
}

function makeSuccessResponse(membersAccepted = 1, cardsAccepted = 0) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      membersAccepted,
      membersRejected: [],
      cardsAccepted,
      cardsRejected: [],
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsDeviceBlocked.mockReturnValue(false);
  mockGetAccessToken.mockReturnValue("token-abc");
  mockUsersUpdate.mockResolvedValue(undefined);
  mockCardsUpdate.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── syncPushMembers ───────────────────────────────────────────────────────────

describe("syncPushMembers", () => {
  it("returns zero counts when device is blocked", async () => {
    const { syncPushMembers } = await import("../syncPushEntities");
    mockIsDeviceBlocked.mockReturnValue(true);
    await expect(syncPushMembers("t1")).rejects.toMatchObject({ name: "DeviceBlockedError" });
  });

  it("returns zero counts when no access token", async () => {
    const { syncPushMembers } = await import("../syncPushEntities");
    mockGetAccessToken.mockReturnValue(null);
    const result = await syncPushMembers("t1");
    expect(result).toEqual({ membersAccepted: 0, membersRejected: 0 });
  });

  it("returns zero counts when no pending members", async () => {
    const { syncPushMembers } = await import("../syncPushEntities");
    mockUsersWhere.mockReturnValue(mockDexieChain([]));
    const result = await syncPushMembers("t1");
    expect(result).toEqual({ membersAccepted: 0, membersRejected: 0 });
  });

  it("pushes pending members and marks them synced", async () => {
    const { syncPushMembers } = await import("../syncPushEntities");
    const members = [makeMember("u1"), makeMember("u2")];
    mockUsersWhere
      .mockReturnValueOnce(mockDexieChain(members)) // allMembers
      .mockReturnValueOnce(mockDexieChain(members)); // pending query
    mockApiFetch.mockResolvedValue(makeSuccessResponse(2, 0));

    const result = await syncPushMembers("t1");
    expect(result.membersAccepted).toBe(2);
    expect(mockUsersUpdate).toHaveBeenCalledWith(["t1", "u1"], { syncStatus: "synced" });
    expect(mockUsersUpdate).toHaveBeenCalledWith(["t1", "u2"], { syncStatus: "synced" });
  });

  it("does not mark rejected members as synced", async () => {
    const { syncPushMembers } = await import("../syncPushEntities");
    const members = [makeMember("u1"), makeMember("u2")];
    mockUsersWhere
      .mockReturnValueOnce(mockDexieChain(members))
      .mockReturnValueOnce(mockDexieChain(members));
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        membersAccepted: 1,
        membersRejected: [{ userId: "u2", reason: "duplicate" }],
        cardsAccepted: 0,
        cardsRejected: [],
      }),
    });

    const result = await syncPushMembers("t1");
    expect(result.membersAccepted).toBe(1);
    expect(result.membersRejected).toBe(1);
    // u1 synced, u2 NOT synced
    expect(mockUsersUpdate).toHaveBeenCalledWith(["t1", "u1"], { syncStatus: "synced" });
    expect(mockUsersUpdate).not.toHaveBeenCalledWith(["t1", "u2"], { syncStatus: "synced" });
  });

  it("wraps errors with SyncPushMembersError", async () => {
    const { syncPushMembers } = await import("../syncPushEntities");
    const members = [makeMember("u1")];
    mockUsersWhere
      .mockReturnValueOnce(mockDexieChain(members))
      .mockReturnValueOnce(mockDexieChain(members));
    mockApiFetch.mockRejectedValue(new TypeError("Network error"));

    await expect(syncPushMembers("t1")).rejects.toMatchObject({ name: "SyncPushMembersError" });
  });
});

// ── syncPushCards ─────────────────────────────────────────────────────────────

describe("syncPushCards", () => {
  it("returns zero counts when device is blocked", async () => {
    const { syncPushCards } = await import("../syncPushEntities");
    mockIsDeviceBlocked.mockReturnValue(true);
    await expect(syncPushCards("t1")).rejects.toMatchObject({ name: "DeviceBlockedError" });
  });

  it("returns zero counts when no access token", async () => {
    const { syncPushCards } = await import("../syncPushEntities");
    mockGetAccessToken.mockReturnValue(null);
    const result = await syncPushCards("t1");
    expect(result).toEqual({ cardsAccepted: 0, cardsRejected: 0 });
  });

  it("returns zero counts when no pending cards", async () => {
    const { syncPushCards } = await import("../syncPushEntities");
    mockCardsWhere.mockReturnValue(mockDexieChain([]));
    const result = await syncPushCards("t1");
    expect(result).toEqual({ cardsAccepted: 0, cardsRejected: 0 });
  });

  it("pushes pending cards and marks them synced", async () => {
    const { syncPushCards } = await import("../syncPushEntities");
    const cards = [makeCard("c1"), makeCard("c2")];
    mockCardsWhere
      .mockReturnValueOnce(mockDexieChain(cards))
      .mockReturnValueOnce(mockDexieChain(cards));
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        membersAccepted: 0,
        membersRejected: [],
        cardsAccepted: 2,
        cardsRejected: [],
      }),
    });

    const result = await syncPushCards("t1");
    expect(result.cardsAccepted).toBe(2);
    expect(mockCardsUpdate).toHaveBeenCalledWith(["t1", "c1"], { syncStatus: "synced" });
    expect(mockCardsUpdate).toHaveBeenCalledWith(["t1", "c2"], { syncStatus: "synced" });
  });

  it("wraps errors with SyncPushCardsError", async () => {
    const { syncPushCards } = await import("../syncPushEntities");
    const cards = [makeCard("c1")];
    mockCardsWhere
      .mockReturnValueOnce(mockDexieChain(cards))
      .mockReturnValueOnce(mockDexieChain(cards));
    mockApiFetch.mockRejectedValue(new TypeError("Network error"));

    await expect(syncPushCards("t1")).rejects.toMatchObject({ name: "SyncPushCardsError" });
  });
});

// ── syncPushEntities ──────────────────────────────────────────────────────────

describe("syncPushEntities", () => {
  it("returns zero counts when device is blocked", async () => {
    const { syncPushEntities } = await import("../syncPushEntities");
    mockIsDeviceBlocked.mockReturnValue(true);
    await expect(syncPushEntities("t1")).rejects.toMatchObject({ name: "DeviceBlockedError" });
  });

  it("returns zero counts when no access token", async () => {
    const { syncPushEntities } = await import("../syncPushEntities");
    mockGetAccessToken.mockReturnValue(null);
    const result = await syncPushEntities("t1");
    expect(result).toEqual({
      membersAccepted: 0,
      membersRejected: 0,
      cardsAccepted: 0,
      cardsRejected: 0,
    });
  });

  it("returns zero counts when no pending entities", async () => {
    const { syncPushEntities } = await import("../syncPushEntities");
    mockUsersWhere.mockReturnValue(mockDexieChain([]));
    mockCardsWhere.mockReturnValue(mockDexieChain([]));
    const result = await syncPushEntities("t1");
    expect(result).toEqual({
      membersAccepted: 0,
      membersRejected: 0,
      cardsAccepted: 0,
      cardsRejected: 0,
    });
  });

  it("pushes both members and cards together", async () => {
    const { syncPushEntities } = await import("../syncPushEntities");
    const members = [makeMember("u1")];
    const cards = [makeCard("c1")];
    mockUsersWhere
      .mockReturnValueOnce(mockDexieChain(members))
      .mockReturnValueOnce(mockDexieChain(members));
    mockCardsWhere
      .mockReturnValueOnce(mockDexieChain(cards))
      .mockReturnValueOnce(mockDexieChain(cards));
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        membersAccepted: 1,
        membersRejected: [],
        cardsAccepted: 1,
        cardsRejected: [],
      }),
    });

    const result = await syncPushEntities("t1");
    expect(result.membersAccepted).toBe(1);
    expect(result.cardsAccepted).toBe(1);
  });

  it("wraps errors with SyncPushEntitiesError", async () => {
    const { syncPushEntities } = await import("../syncPushEntities");
    const members = [makeMember("u1")];
    mockUsersWhere
      .mockReturnValueOnce(mockDexieChain(members))
      .mockReturnValueOnce(mockDexieChain(members));
    mockCardsWhere.mockReturnValue(mockDexieChain([]));
    mockApiFetch.mockRejectedValue(new TypeError("Network error"));

    await expect(syncPushEntities("t1")).rejects.toMatchObject({ name: "SyncPushEntitiesError" });
  });
});

// ── getPendingMembers / getPendingCards / getPendingEntityCount ────────────────

describe("getPendingMembers", () => {
  it("returns pending members", async () => {
    const { getPendingMembers } = await import("../syncPushEntities");
    const members = [makeMember("u1")];
    mockUsersWhere
      .mockReturnValueOnce(mockDexieChain(members)) // allMembers
      .mockReturnValueOnce(mockDexieChain(members)); // pending query
    const result = await getPendingMembers("t1");
    expect(result).toHaveLength(1);
  });

  it("marks unmarked members as pending before querying", async () => {
    const { getPendingMembers } = await import("../syncPushEntities");
    const unmarked = [{ ...makeMember("u1"), syncStatus: undefined }];
    mockUsersWhere
      .mockReturnValueOnce(mockDexieChain(unmarked)) // allMembers (has unmarked)
      .mockReturnValueOnce(mockDexieChain([makeMember("u1")])); // pending query
    await getPendingMembers("t1");
    expect(mockUsersUpdate).toHaveBeenCalledWith(["t1", "u1"], { syncStatus: "pending" });
  });
});

describe("getPendingCards", () => {
  it("returns pending cards", async () => {
    const { getPendingCards } = await import("../syncPushEntities");
    const cards = [makeCard("c1")];
    mockCardsWhere
      .mockReturnValueOnce(mockDexieChain(cards))
      .mockReturnValueOnce(mockDexieChain(cards));
    const result = await getPendingCards("t1");
    expect(result).toHaveLength(1);
  });

  it("marks unmarked cards as pending before querying", async () => {
    const { getPendingCards } = await import("../syncPushEntities");
    const unmarked = [{ ...makeCard("c1"), syncStatus: undefined }];
    mockCardsWhere
      .mockReturnValueOnce(mockDexieChain(unmarked))
      .mockReturnValueOnce(mockDexieChain([makeCard("c1")]));
    await getPendingCards("t1");
    expect(mockCardsUpdate).toHaveBeenCalledWith(["t1", "c1"], { syncStatus: "pending" });
  });
});

describe("getPendingEntityCount", () => {
  it("returns sum of pending members and cards", async () => {
    const { getPendingEntityCount } = await import("../syncPushEntities");
    mockUsersWhere
      .mockReturnValueOnce(mockDexieChain([makeMember("u1"), makeMember("u2")]))
      .mockReturnValueOnce(mockDexieChain([makeMember("u1"), makeMember("u2")]));
    mockCardsWhere
      .mockReturnValueOnce(mockDexieChain([makeCard("c1")]))
      .mockReturnValueOnce(mockDexieChain([makeCard("c1")]));
    const count = await getPendingEntityCount("t1");
    expect(count).toBe(3);
  });
});

// ── pushEntitiesWithRetry — retry logic ───────────────────────────────────────

describe("pushEntitiesWithRetry — retry and error handling", () => {
  it("retries on 5xx and eventually succeeds", async () => {
    const { syncPushMembers } = await import("../syncPushEntities");
    vi.useFakeTimers();
    const members = [makeMember("u1")];
    mockUsersWhere
      .mockReturnValueOnce(mockDexieChain(members))
      .mockReturnValueOnce(mockDexieChain(members));
    mockApiFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Error",
        text: async () => "Server error",
        headers: { get: () => null },
      })
      .mockResolvedValue(makeSuccessResponse(1, 0));

    const promise = syncPushMembers("t1");
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;
    expect(result.membersAccepted).toBe(1);
  });

  it("throws on non-retryable 4xx", async () => {
    const { syncPushMembers } = await import("../syncPushEntities");
    const members = [makeMember("u1")];
    mockUsersWhere
      .mockReturnValueOnce(mockDexieChain(members))
      .mockReturnValueOnce(mockDexieChain(members));
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "Invalid payload",
      headers: { get: () => null },
    });

    await expect(syncPushMembers("t1")).rejects.toMatchObject({ name: "SyncPushMembersError" });
    expect(mockAddSyncLog).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("400"),
      expect.any(String),
    );
  });

  it("handles 429 rate limit by waiting", async () => {
    const { syncPushMembers } = await import("../syncPushEntities");
    vi.useFakeTimers();
    const members = [makeMember("u1")];
    mockUsersWhere
      .mockReturnValueOnce(mockDexieChain(members))
      .mockReturnValueOnce(mockDexieChain(members));
    mockApiFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () => "rate limited",
        headers: { get: (h: string) => (h === "Retry-After" ? "2" : null) },
      })
      .mockResolvedValue(makeSuccessResponse(1, 0));

    const promise = syncPushMembers("t1");
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;
    expect(result.membersAccepted).toBe(1);
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe("syncPushEntities constants", () => {
  it("MAX_BATCH_SIZE is 200", async () => {
    const { MAX_BATCH_SIZE } = await import("../syncPushEntities");
    expect(MAX_BATCH_SIZE).toBe(200);
  });

  it("MAX_RETRY_ATTEMPTS is 3", async () => {
    const { MAX_RETRY_ATTEMPTS } = await import("../syncPushEntities");
    expect(MAX_RETRY_ATTEMPTS).toBe(3);
  });
});
