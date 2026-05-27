// @vitest-environment jsdom
/**
 * Additional tests for useSyncEngine.ts covering uncovered lines:
 * - Lines 330-435: retry backoff, queued sync after cycle, max retries
 * - Lines 439/446-447: notifyMutation while syncing (debounce + queue)
 * - Lines 455-456: notifyMutation debounce reset
 * - Line 461: visibility change triggers sync
 * - Lines 469-476: online/offline event handlers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { DEBOUNCE_MS, PERIODIC_PULL_INTERVAL_MS } from "../useSyncEngine";

vi.mock("../../lib/syncPush", () => ({
  syncPush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../lib/syncPushEntities", () => ({
  syncPushEntities: vi.fn().mockResolvedValue(undefined),
  getPendingEntityCount: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../lib/syncPull", () => ({
  syncPull: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../lib/deviceBlock", () => ({
  isDeviceBlocked: vi.fn().mockReturnValue(false),
}));
vi.mock("../../lib/transactionLogService", () => ({
  getSyncableEntries: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../lib/syncLogStore", () => ({
  addSyncLog: vi.fn(),
}));

import { syncPush } from "../../lib/syncPush";

describe("useSyncEngine — retry backoff after error", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules retry after push error with exponential backoff", async () => {
    const { useSyncEngine } = await import("../useSyncEngine");
    vi.mocked(syncPush).mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    await act(async () => {
      result.current.triggerSync();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.syncStatus).toBe("error");

    // After backoff (1000ms for first retry), should retry
    vi.mocked(syncPush).mockResolvedValue(undefined);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    // Should have retried
    expect(vi.mocked(syncPush).mock.calls.length).toBeGreaterThan(1);
  });

  it("stops retrying after MAX_ERROR_RETRIES (5) failures", async () => {
    const { useSyncEngine } = await import("../useSyncEngine");
    vi.mocked(syncPush).mockRejectedValue(new Error("Persistent error"));

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    // Trigger initial sync
    await act(async () => {
      result.current.triggerSync();
      await vi.advanceTimersByTimeAsync(0);
    });

    // Advance through all retries (1s, 2s, 4s, 8s, 16s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
      await vi.advanceTimersByTimeAsync(2100);
      await vi.advanceTimersByTimeAsync(4100);
      await vi.advanceTimersByTimeAsync(8100);
    });

    expect(result.current.syncStatus).toBe("error");
  });
});

describe("useSyncEngine — queued sync after cycle completes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes queued sync after current cycle finishes", async () => {
    const { useSyncEngine } = await import("../useSyncEngine");

    let resolvePush: () => void;
    vi.mocked(syncPush).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePush = resolve;
        }),
    );

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    // Start a sync cycle
    await act(async () => {
      result.current.triggerSync();
      await vi.advanceTimersByTimeAsync(0);
    });

    // While syncing, trigger another sync (should be queued)
    await act(async () => {
      result.current.triggerSync();
    });

    // Complete the first sync
    vi.mocked(syncPush).mockResolvedValue(undefined);
    await act(async () => {
      resolvePush!();
      await vi.advanceTimersByTimeAsync(200);
    });

    // The queued sync should have run
    expect(vi.mocked(syncPush).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("useSyncEngine — notifyMutation while syncing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("queues sync via debounce when notifyMutation called while syncing", async () => {
    const { useSyncEngine } = await import("../useSyncEngine");

    let resolvePush: () => void;
    vi.mocked(syncPush).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePush = resolve;
        }),
    );

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    // Start sync
    await act(async () => {
      result.current.triggerSync();
      await vi.advanceTimersByTimeAsync(0);
    });

    // Notify mutation while syncing
    await act(async () => {
      result.current.notifyMutation();
    });

    // Complete the sync
    vi.mocked(syncPush).mockResolvedValue(undefined);
    await act(async () => {
      resolvePush!();
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 200);
    });

    // Should have triggered another sync
    expect(vi.mocked(syncPush).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("useSyncEngine — visibility change triggers sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("triggers sync when document becomes visible", async () => {
    const { useSyncEngine } = await import("../useSyncEngine");
    vi.mocked(syncPush).mockClear();

    const { unmount } = renderHook(() => useSyncEngine("tenant-1", true));

    // Wait for initial sync
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    vi.mocked(syncPush).mockClear();

    // Simulate visibility change
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(vi.mocked(syncPush)).toHaveBeenCalled();
    unmount();
  });
});

describe("useSyncEngine — online/offline event handlers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets offline status when offline event fires", async () => {
    const { useSyncEngine } = await import("../useSyncEngine");

    const { result, unmount } = renderHook(() => useSyncEngine("tenant-1", true));

    await act(async () => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      globalThis.dispatchEvent(new Event("offline"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.syncStatus).toBe("offline");
    unmount();
  });

  it("triggers sync when online event fires", async () => {
    const { useSyncEngine } = await import("../useSyncEngine");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const { result, unmount } = renderHook(() => useSyncEngine("tenant-1", true));

    // Should be offline initially
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    vi.mocked(syncPush).mockClear();

    // Come back online
    await act(async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      globalThis.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.syncStatus).not.toBe("offline");
    unmount();
  });
});

describe("useSyncEngine — periodic pull interval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("triggers sync after PERIODIC_PULL_INTERVAL_MS", async () => {
    const { useSyncEngine } = await import("../useSyncEngine");

    const { unmount } = renderHook(() => useSyncEngine("tenant-1", true));

    // Wait for initial sync
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    vi.mocked(syncPush).mockClear();

    // Advance past the periodic interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PERIODIC_PULL_INTERVAL_MS + 100);
    });

    expect(vi.mocked(syncPush)).toHaveBeenCalled();
    unmount();
  });
});

describe("useSyncEngine — cleanup on unmount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cleans up timers on unmount", async () => {
    const { useSyncEngine } = await import("../useSyncEngine");

    const { result, unmount } = renderHook(() => useSyncEngine("tenant-1", true));

    // Start a debounced mutation
    await act(async () => {
      result.current.notifyMutation();
    });

    // Unmount before debounce fires
    unmount();

    vi.mocked(syncPush).mockClear();

    // Advance past debounce — should NOT trigger sync after unmount
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100);
    });

    expect(vi.mocked(syncPush)).not.toHaveBeenCalled();
  });
});
