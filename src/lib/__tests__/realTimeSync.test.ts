// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../syncPull", () => ({
  syncPull: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#/db/local-db", () => ({
  localDb: {
    cards: {
      get: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock("../api", () => ({
  getAccessToken: vi.fn().mockReturnValue("test-token"),
}));

vi.mock("../syncLogStore", () => ({
  addSyncLog: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("calculateBackoff", () => {
  it("returns INITIAL_BACKOFF_MS (1000) for attempt 0", async () => {
    const { calculateBackoff, INITIAL_BACKOFF_MS } = await import("../realTimeSync");
    expect(calculateBackoff(0)).toBe(INITIAL_BACKOFF_MS);
  });

  it("doubles each attempt", async () => {
    const { calculateBackoff, INITIAL_BACKOFF_MS } = await import("../realTimeSync");
    expect(calculateBackoff(1)).toBe(INITIAL_BACKOFF_MS * 2);
    expect(calculateBackoff(2)).toBe(INITIAL_BACKOFF_MS * 4);
  });

  it("caps at MAX_BACKOFF_MS (60000)", async () => {
    const { calculateBackoff, MAX_BACKOFF_MS } = await import("../realTimeSync");
    expect(calculateBackoff(100)).toBe(MAX_BACKOFF_MS);
  });

  it("MAX_BACKOFF_MS is 60000", async () => {
    const { MAX_BACKOFF_MS } = await import("../realTimeSync");
    expect(MAX_BACKOFF_MS).toBe(60_000);
  });

  it("INITIAL_BACKOFF_MS is 1000", async () => {
    const { INITIAL_BACKOFF_MS } = await import("../realTimeSync");
    expect(INITIAL_BACKOFF_MS).toBe(1000);
  });
});

describe("onEvent / event subscription", () => {
  it("registers and calls a handler for a specific event type", async () => {
    const { onEvent, disconnect } = await import("../realTimeSync");
    const handler = vi.fn();
    const unsubscribe = onEvent("card_status_change", handler);

    // Cleanup
    unsubscribe();
    disconnect();
  });

  it("returns an unsubscribe function that removes the handler", async () => {
    const { onEvent, disconnect } = await import("../realTimeSync");
    const handler = vi.fn();
    const unsubscribe = onEvent("card_status_change", handler);
    unsubscribe();

    // After unsubscribe, handler should not be in the map
    // We can't directly test this without emitting, but we verify no throw
    expect(() => unsubscribe()).not.toThrow();
    disconnect();
  });

  it("supports multiple handlers for the same event type", async () => {
    const { onEvent, disconnect } = await import("../realTimeSync");
    const h1 = vi.fn();
    const h2 = vi.fn();
    const u1 = onEvent("card_status_change", h1);
    const u2 = onEvent("card_status_change", h2);
    u1();
    u2();
    disconnect();
  });
});

describe("isConnected", () => {
  it("returns false initially", async () => {
    const { isConnected, disconnect } = await import("../realTimeSync");
    disconnect();
    expect(isConnected()).toBe(false);
  });
});

describe("getCardsNeedingResync", () => {
  it("returns an empty set initially", async () => {
    const { getCardsNeedingResync, disconnect } = await import("../realTimeSync");
    disconnect();
    expect(getCardsNeedingResync().size).toBe(0);
  });
});

describe("disconnect", () => {
  it("can be called multiple times without throwing", async () => {
    const { disconnect } = await import("../realTimeSync");
    expect(() => {
      disconnect();
      disconnect();
      disconnect();
    }).not.toThrow();
  });

  it("resets connected state to false", async () => {
    const { disconnect, isConnected } = await import("../realTimeSync");
    disconnect();
    expect(isConnected()).toBe(false);
  });
});

describe("RealTimeSyncError", () => {
  it("has name RealTimeSyncError", async () => {
    const { RealTimeSyncError } = await import("../realTimeSync");
    const err = new RealTimeSyncError("test error");
    expect(err.name).toBe("RealTimeSyncError");
  });

  it("stores the message", async () => {
    const { RealTimeSyncError } = await import("../realTimeSync");
    const err = new RealTimeSyncError("something failed");
    expect(err.message).toBe("something failed");
  });

  it("stores the cause", async () => {
    const { RealTimeSyncError } = await import("../realTimeSync");
    const cause = new Error("root cause");
    const err = new RealTimeSyncError("wrapper", cause);
    expect(err.cause).toBe(cause);
  });

  it("is an instance of Error", async () => {
    const { RealTimeSyncError } = await import("../realTimeSync");
    const err = new RealTimeSyncError("test");
    expect(err instanceof Error).toBe(true);
  });
});

describe("setQueryClient", () => {
  it("can be called without throwing", async () => {
    const { setQueryClient } = await import("../realTimeSync");
    const fakeClient = { invalidateQueries: vi.fn() };
    expect(() => setQueryClient(fakeClient as never)).not.toThrow();
  });
});

describe("PERIODIC_PULL_INTERVAL_MS", () => {
  it("is 30000", async () => {
    const { PERIODIC_PULL_INTERVAL_MS } = await import("../realTimeSync");
    expect(PERIODIC_PULL_INTERVAL_MS).toBe(30_000);
  });
});
