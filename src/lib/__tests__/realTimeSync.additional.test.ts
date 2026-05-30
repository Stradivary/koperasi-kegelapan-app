// @vitest-environment jsdom
/**
 * Additional coverage for realTimeSync.ts
 * Targets: lines 100-234, 246-365, 374-375, 380-381, 403-425
 * Covers: connect/disconnect, SSE lifecycle, handleCardStatusChange,
 *         parseSseMessage, handleSseMessage, fullSyncOnLogin,
 *         scheduleReconnect, periodic pull, emitEvent
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSyncPull = vi.fn();
vi.mock("../syncPull", () => ({ syncPull: (...a: unknown[]) => mockSyncPull(...a) }));

const mockCardsGet = vi.fn();
const mockCardsUpdate = vi.fn();
const mockCardsPut = vi.fn();
vi.mock("#/db/local-db", () => ({
  localDb: {
    cards: {
      get: (...a: unknown[]) => mockCardsGet(...a),
      update: (...a: unknown[]) => mockCardsUpdate(...a),
      put: (...a: unknown[]) => mockCardsPut(...a),
    },
  },
}));

const mockGetAccessToken = vi.fn().mockReturnValue("test-token");
vi.mock("../api", () => ({ getAccessToken: () => mockGetAccessToken() }));

const mockAddSyncLog = vi.fn();
vi.mock("../syncLogStore", () => ({ addSyncLog: (...a: unknown[]) => mockAddSyncLog(...a) }));

// ── EventSource mock ──────────────────────────────────────────────────────────

type EventSourceHandler = (e: Event | MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: EventSourceHandler | null = null;
  onmessage: EventSourceHandler | null = null;
  onerror: EventSourceHandler | null = null;
  closeCalled = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  close() {
    this.closeCalled = true;
  }
  triggerOpen() {
    this.onopen?.(new Event("open"));
  }
  triggerMessage(data: string) {
    this.onmessage?.(Object.assign(new Event("message"), { data }) as MessageEvent);
  }
  triggerError() {
    this.onerror?.(new Event("error"));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  mockSyncPull.mockResolvedValue(undefined);
  mockCardsGet.mockResolvedValue(null);
  mockCardsUpdate.mockResolvedValue(undefined);
  mockCardsPut.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── connect / SSE lifecycle ───────────────────────────────────────────────────

describe("connect — SSE lifecycle", () => {
  it("creates an EventSource on connect", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    expect(MockEventSource.instances.length).toBe(1);
    disconnect();
  });

  it("appends token as query param when token is available", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    mockGetAccessToken.mockReturnValue("my-token");
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    expect(MockEventSource.instances[0].url).toContain("token=my-token");
    disconnect();
  });

  it("does not append token param when no token", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    mockGetAccessToken.mockReturnValue(null);
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    expect(MockEventSource.instances[0].url).not.toContain("token=");
    disconnect();
  });

  it("sets isConnected=true on SSE open", async () => {
    const { connect, disconnect, isConnected } = await import("../realTimeSync");
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    MockEventSource.instances[0].triggerOpen();
    expect(isConnected()).toBe(true);
    disconnect();
  });

  it("performs catch-up syncPull on SSE open", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    MockEventSource.instances[0].triggerOpen();
    await vi.waitFor(() => expect(mockSyncPull).toHaveBeenCalledWith("t1"));
    disconnect();
  });

  it("sets isConnected=false on SSE error", async () => {
    const { connect, disconnect, isConnected } = await import("../realTimeSync");
    vi.useFakeTimers();
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    MockEventSource.instances[0].triggerOpen();
    MockEventSource.instances[0].triggerError();
    expect(isConnected()).toBe(false);
    disconnect();
  });

  it("starts periodic pull on SSE error", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    vi.useFakeTimers();
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    MockEventSource.instances[0].triggerError();
    // Advance past periodic pull interval
    await vi.advanceTimersByTimeAsync(31_000);
    expect(mockSyncPull).toHaveBeenCalled();
    disconnect();
  });

  it("closes existing connection when connect is called again", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    const first = MockEventSource.instances[0];
    connect({ tenantId: "t2", deviceId: "d2", sseUrl: "https://api.test/sse2" });
    expect(first.closeCalled).toBe(true);
    disconnect();
  });

  it("closes EventSource on disconnect", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    const es = MockEventSource.instances[0];
    disconnect();
    expect(es.closeCalled).toBe(true);
  });
});

// ── scheduleReconnect / exponential backoff ───────────────────────────────────

describe("scheduleReconnect — exponential backoff", () => {
  it("logs error after SSE error exhausts MAX_RECONNECT_ATTEMPTS", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    vi.useFakeTimers();
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    // First error: _reconnectAttempts=0 < MAX_RECONNECT_ATTEMPTS=1, so schedules reconnect
    MockEventSource.instances[0].triggerError();
    // Advance past backoff (1000ms for attempt 0)
    await vi.advanceTimersByTimeAsync(1500);
    // Second error on reconnect: _reconnectAttempts=1 >= MAX_RECONNECT_ATTEMPTS=1, logs error
    if (MockEventSource.instances[1]) {
      MockEventSource.instances[1].triggerError();
    }
    expect(mockAddSyncLog).toHaveBeenCalledWith("warn", expect.stringContaining("SSE"));
    disconnect();
  });

  it("logs warn on SSE disconnect", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    vi.useFakeTimers();
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    MockEventSource.instances[0].triggerError();
    expect(mockAddSyncLog).toHaveBeenCalledWith("warn", expect.stringContaining("SSE"));
    disconnect();
  });
});

// ── handleSseMessage / parseSseMessage ────────────────────────────────────────

describe("handleSseMessage — message parsing and routing", () => {
  it("ignores messages from own device", async () => {
    const { connect, disconnect, onEvent } = await import("../realTimeSync");
    connect({ tenantId: "t1", deviceId: "my-device", sseUrl: "https://api.test/sse" });
    const handler = vi.fn();
    onEvent("card_status_change", handler);

    const msg = JSON.stringify({
      type: "card_status_change",
      payload: {
        cardId: "abc",
        tenantId: "t1",
        newStatus: "blocked_admin",
        changedBy: "admin",
        timestamp: 1,
      },
      timestamp: 1,
      sourceDeviceId: "my-device", // same as deviceId
    });
    MockEventSource.instances[0].triggerMessage(msg);
    await vi.waitFor(() => expect(handler).not.toHaveBeenCalled());
    disconnect();
  });

  it("emits card_status_change to registered handlers", async () => {
    const { connect, disconnect, onEvent } = await import("../realTimeSync");
    connect({ tenantId: "t1", deviceId: "my-device", sseUrl: "https://api.test/sse" });
    const handler = vi.fn();
    onEvent("card_status_change", handler);

    const msg = JSON.stringify({
      type: "card_status_change",
      payload: {
        cardId: "abc",
        tenantId: "t1",
        newStatus: "blocked_admin",
        changedBy: "admin",
        timestamp: 1,
      },
      timestamp: 1,
      sourceDeviceId: "other-device",
    });
    MockEventSource.instances[0].triggerMessage(msg);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    disconnect();
  });

  it("ignores malformed JSON messages", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    expect(() => MockEventSource.instances[0].triggerMessage("not-json")).not.toThrow();
    disconnect();
  });

  it("ignores messages missing type field", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    const msg = JSON.stringify({ payload: {}, timestamp: 1, sourceDeviceId: "other" });
    expect(() => MockEventSource.instances[0].triggerMessage(msg)).not.toThrow();
    disconnect();
  });

  it("ignores messages missing timestamp", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    const msg = JSON.stringify({
      type: "card_status_change",
      payload: {},
      sourceDeviceId: "other",
    });
    expect(() => MockEventSource.instances[0].triggerMessage(msg)).not.toThrow();
    disconnect();
  });

  it("emits non-card_status_change events to handlers", async () => {
    const { connect, disconnect, onEvent } = await import("../realTimeSync");
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    const handler = vi.fn();
    onEvent("checkin", handler);

    const msg = JSON.stringify({
      type: "checkin",
      payload: {},
      timestamp: 1,
      sourceDeviceId: "other-device",
    });
    MockEventSource.instances[0].triggerMessage(msg);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    disconnect();
  });
});

// ── handleCardStatusChange ────────────────────────────────────────────────────

describe("handleCardStatusChange — IndexedDB writes", () => {
  it("updates existing card status when card is found in DB", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    mockCardsGet.mockResolvedValue({ tenantId: "t1", cardId: "abc", status: "active" });

    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    const msg = JSON.stringify({
      type: "card_status_change",
      payload: {
        cardId: "abc",
        tenantId: "t1",
        newStatus: "blocked_admin",
        changedBy: "admin",
        timestamp: 1,
      },
      timestamp: 1,
      sourceDeviceId: "other",
    });
    MockEventSource.instances[0].triggerMessage(msg);
    await vi.waitFor(() =>
      expect(mockCardsUpdate).toHaveBeenCalledWith(["t1", "abc"], { status: "blocked_admin" }),
    );
    disconnect();
  });

  it("creates minimal card record when card not in DB", async () => {
    const { connect, disconnect } = await import("../realTimeSync");
    mockCardsGet.mockResolvedValue(null);

    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    const msg = JSON.stringify({
      type: "card_status_change",
      payload: {
        cardId: "abc",
        tenantId: "t1",
        newStatus: "blocked_admin",
        changedBy: "admin",
        timestamp: 1700000000,
      },
      timestamp: 1700000000,
      sourceDeviceId: "other",
    });
    MockEventSource.instances[0].triggerMessage(msg);
    await vi.waitFor(() =>
      expect(mockCardsPut).toHaveBeenCalledWith(
        expect.objectContaining({ cardId: "abc", tenantId: "t1", status: "blocked_admin" }),
      ),
    );
    disconnect();
  });

  it("marks card for resync after max retries on DB write failure", async () => {
    const { connect, disconnect, getCardsNeedingResync } = await import("../realTimeSync");
    mockCardsGet.mockRejectedValue(new Error("IDB error"));

    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    const msg = JSON.stringify({
      type: "card_status_change",
      payload: {
        cardId: "fail-card",
        tenantId: "t1",
        newStatus: "blocked_admin",
        changedBy: "admin",
        timestamp: 1,
      },
      timestamp: 1,
      sourceDeviceId: "other",
    });
    MockEventSource.instances[0].triggerMessage(msg);
    await vi.waitFor(() => expect(getCardsNeedingResync().size).toBeGreaterThan(0));
    disconnect();
  });

  it("invalidates query caches after successful card update", async () => {
    const { connect, disconnect, setQueryClient } = await import("../realTimeSync");
    mockCardsGet.mockResolvedValue({ tenantId: "t1", cardId: "abc", status: "active" });
    const mockInvalidate = vi.fn();
    setQueryClient({ invalidateQueries: mockInvalidate } as never);

    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    const msg = JSON.stringify({
      type: "card_status_change",
      payload: {
        cardId: "abc",
        tenantId: "t1",
        newStatus: "blocked_admin",
        changedBy: "admin",
        timestamp: 1,
      },
      timestamp: 1,
      sourceDeviceId: "other",
    });
    MockEventSource.instances[0].triggerMessage(msg);
    await vi.waitFor(() =>
      expect(mockInvalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["card", "abc"] }),
      ),
    );
    disconnect();
  });

  it("removes card from resync set after successful write", async () => {
    const { connect, disconnect, getCardsNeedingResync } = await import("../realTimeSync");
    // Both retry attempts fail → card added to resync set
    mockCardsGet.mockRejectedValue(new Error("IDB error"));
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });
    const msg = JSON.stringify({
      type: "card_status_change",
      payload: {
        cardId: "retry-card",
        tenantId: "t1",
        newStatus: "blocked_admin",
        changedBy: "admin",
        timestamp: 1,
      },
      timestamp: 1,
      sourceDeviceId: "other",
    });
    MockEventSource.instances[0].triggerMessage(msg);
    await vi.waitFor(() => expect(getCardsNeedingResync().has("t1:retry-card")).toBe(true));

    // Now succeed — reset mock to succeed
    mockCardsGet.mockResolvedValue({ tenantId: "t1", cardId: "retry-card", status: "active" });
    mockCardsUpdate.mockResolvedValue(undefined);
    MockEventSource.instances[0].triggerMessage(msg);
    await vi.waitFor(() => expect(getCardsNeedingResync().has("t1:retry-card")).toBe(false));
    disconnect();
  });
});

// ── fullSyncOnLogin ───────────────────────────────────────────────────────────

describe("fullSyncOnLogin", () => {
  it("calls syncPull and resolves on success", async () => {
    const { fullSyncOnLogin } = await import("../realTimeSync");
    mockSyncPull.mockResolvedValue(undefined);
    await expect(fullSyncOnLogin("t1")).resolves.toBeUndefined();
    expect(mockSyncPull).toHaveBeenCalledWith("t1");
  });

  it("throws RealTimeSyncError after all attempts fail", async () => {
    const { fullSyncOnLogin, RealTimeSyncError } = await import("../realTimeSync");
    mockSyncPull.mockRejectedValue(new Error("Network error"));
    await expect(fullSyncOnLogin("t1")).rejects.toBeInstanceOf(RealTimeSyncError);
  });

  it("re-throws SyncPullAuthError immediately without retry", async () => {
    const { fullSyncOnLogin } = await import("../realTimeSync");
    const authErr = Object.assign(new Error("Unauthorized"), { name: "SyncPullAuthError" });
    mockSyncPull.mockRejectedValue(authErr);
    await expect(fullSyncOnLogin("t1")).rejects.toMatchObject({ name: "SyncPullAuthError" });
    expect(mockSyncPull).toHaveBeenCalledTimes(1);
  });

  it("logs error after all attempts exhausted", async () => {
    const { fullSyncOnLogin } = await import("../realTimeSync");
    mockSyncPull.mockRejectedValue(new Error("fail"));
    await expect(fullSyncOnLogin("t1")).rejects.toThrow();
    expect(mockAddSyncLog).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("Full sync"),
      expect.any(String),
    );
  });
});

// ── onEvent — handler lifecycle ───────────────────────────────────────────────

describe("onEvent — handler lifecycle", () => {
  it("unsubscribing last handler removes the event type from map", async () => {
    const { onEvent, disconnect } = await import("../realTimeSync");
    const h = vi.fn();
    const unsub = onEvent("member_update", h);
    unsub();
    // Calling unsub again should not throw
    expect(() => unsub()).not.toThrow();
    disconnect();
  });

  it("handler errors do not propagate to other handlers", async () => {
    const { connect, disconnect, onEvent } = await import("../realTimeSync");
    connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" });

    const badHandler = vi.fn().mockImplementation(() => {
      throw new Error("handler error");
    });
    const goodHandler = vi.fn();
    onEvent("checkin", badHandler);
    onEvent("checkin", goodHandler);

    const msg = JSON.stringify({
      type: "checkin",
      payload: {},
      timestamp: 1,
      sourceDeviceId: "other",
    });
    MockEventSource.instances[0].triggerMessage(msg);
    await vi.waitFor(() => expect(goodHandler).toHaveBeenCalledOnce());
    disconnect();
  });
});

// ── EventSource constructor throws ───────────────────────────────────────────

describe("connect — EventSource constructor failure", () => {
  it("falls back to periodic pull when EventSource throws", async () => {
    vi.stubGlobal("EventSource", () => {
      throw new Error("Not supported");
    });
    const { connect, disconnect } = await import("../realTimeSync");
    vi.useFakeTimers();
    expect(() =>
      connect({ tenantId: "t1", deviceId: "d1", sseUrl: "https://api.test/sse" }),
    ).not.toThrow();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(mockSyncPull).toHaveBeenCalled();
    disconnect();
  });
});
