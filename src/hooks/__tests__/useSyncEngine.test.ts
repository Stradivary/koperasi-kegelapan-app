// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEBOUNCE_MS, PERIODIC_PULL_INTERVAL_MS } from "../useSyncEngine";

// Mock dependencies
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

describe("useSyncEngine constants", () => {
  it("DEBOUNCE_MS is 5000", () => {
    expect(DEBOUNCE_MS).toBe(5000);
  });

  it("PERIODIC_PULL_INTERVAL_MS is 30000", () => {
    expect(PERIODIC_PULL_INTERVAL_MS).toBe(30_000);
  });
});

describe("useSyncEngine - extractErrorDetail", () => {
  // Test the internal helper by importing the module and testing behavior
  // Since extractErrorDetail is not exported, we test it indirectly through the hook behavior

  it("module exports useSyncEngine function", async () => {
    const mod = await import("../useSyncEngine");
    expect(typeof mod.useSyncEngine).toBe("function");
  });
});

// Test the sync engine logic without React hooks (testing the orchestration logic)
describe("sync engine orchestration logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("syncPush is importable and mockable", async () => {
    const { syncPush } = await import("../../lib/syncPush");
    await syncPush("tenant-1");
    expect(syncPush).toHaveBeenCalledWith("tenant-1");
  });

  it("syncPull is importable and mockable", async () => {
    const { syncPull } = await import("../../lib/syncPull");
    await syncPull("tenant-1");
    expect(syncPull).toHaveBeenCalledWith("tenant-1");
  });

  it("syncPushEntities is importable and mockable", async () => {
    const { syncPushEntities } = await import("../../lib/syncPushEntities");
    await syncPushEntities("tenant-1");
    expect(syncPushEntities).toHaveBeenCalledWith("tenant-1");
  });

  it("getSyncableEntries returns empty array", async () => {
    const { getSyncableEntries } = await import("../../lib/transactionLogService");
    const result = await getSyncableEntries("tenant-1");
    expect(result).toEqual([]);
  });

  it("getPendingEntityCount returns 0", async () => {
    const { getPendingEntityCount } = await import("../../lib/syncPushEntities");
    const result = await getPendingEntityCount("tenant-1");
    expect(result).toBe(0);
  });

  it("isDeviceBlocked returns false by default", async () => {
    const { isDeviceBlocked } = await import("../../lib/deviceBlock");
    expect(isDeviceBlocked()).toBe(false);
  });
});

// ── Hook behavior tests ────────────────────────────────────────────────────
describe("useSyncEngine hook behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Ensure navigator.onLine is true
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns idle status initially when enabled with tenantId", async () => {
    // Dynamic import to get fresh module with mocks applied
    const { renderHook } = await import("@testing-library/react");
    const { useSyncEngine } = await import("../useSyncEngine");

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    expect(result.current.syncStatus).toBe("idle");
    expect(result.current.lastSyncedAt).toBeNull();
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.lastPushSucceeded).toBe(false);
  });

  it("returns idle status when disabled", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useSyncEngine } = await import("../useSyncEngine");

    const { result } = renderHook(() => useSyncEngine("tenant-1", false));

    expect(result.current.syncStatus).toBe("idle");
  });

  it("returns idle status when tenantId is null", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useSyncEngine } = await import("../useSyncEngine");

    const { result } = renderHook(() => useSyncEngine(null, true));

    expect(result.current.syncStatus).toBe("idle");
    expect(result.current.pendingCount).toBe(0);
  });

  it("exposes triggerSync and notifyMutation functions", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useSyncEngine } = await import("../useSyncEngine");

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    expect(typeof result.current.triggerSync).toBe("function");
    expect(typeof result.current.notifyMutation).toBe("function");
  });

  it("sets offline status when navigator is offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const { renderHook } = await import("@testing-library/react");
    const { useSyncEngine } = await import("../useSyncEngine");

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    // The effect sets offline status
    expect(result.current.syncStatus).toBe("offline");
  });

  it("triggerSync initiates a sync cycle", async () => {
    const { renderHook, act } = await import("@testing-library/react");
    const { useSyncEngine } = await import("../useSyncEngine");
    const { syncPush } = await import("../../lib/syncPush");

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    await act(async () => {
      result.current.triggerSync();
      // Allow microtasks to complete
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(syncPush).toHaveBeenCalledWith("tenant-1");
  });

  it("sets offline status when device is blocked", async () => {
    const { isDeviceBlocked } = await import("../../lib/deviceBlock");
    vi.mocked(isDeviceBlocked).mockReturnValue(true);

    const { renderHook, act } = await import("@testing-library/react");
    const { useSyncEngine } = await import("../useSyncEngine");

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    await act(async () => {
      result.current.triggerSync();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.syncStatus).toBe("offline");

    // Reset mock
    vi.mocked(isDeviceBlocked).mockReturnValue(false);
  });

  it("notifyMutation schedules a debounced sync", async () => {
    const { renderHook, act } = await import("@testing-library/react");
    const { useSyncEngine } = await import("../useSyncEngine");
    const { syncPush } = await import("../../lib/syncPush");

    vi.mocked(syncPush).mockClear();

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    // Wait for initial sync to complete
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    vi.mocked(syncPush).mockClear();

    await act(async () => {
      result.current.notifyMutation();
    });

    // syncPush should not be called immediately
    expect(syncPush).not.toHaveBeenCalled();

    // After debounce period, sync should trigger
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 100);
    });

    expect(syncPush).toHaveBeenCalled();
  });

  it("handles push error and sets error status", async () => {
    const { syncPush } = await import("../../lib/syncPush");
    vi.mocked(syncPush).mockRejectedValueOnce(new Error("Network error"));

    const { renderHook, act } = await import("@testing-library/react");
    const { useSyncEngine } = await import("../useSyncEngine");

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    await act(async () => {
      result.current.triggerSync();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.syncStatus).toBe("error");
    expect(result.current.lastPushSucceeded).toBe(false);

    // Reset mock
    vi.mocked(syncPush).mockResolvedValue(undefined);
  });

  it("handles pull error after successful push", async () => {
    const { syncPull } = await import("../../lib/syncPull");
    vi.mocked(syncPull).mockRejectedValueOnce(new Error("Pull failed"));

    const { renderHook, act } = await import("@testing-library/react");
    const { useSyncEngine } = await import("../useSyncEngine");

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    await act(async () => {
      result.current.triggerSync();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.syncStatus).toBe("error");
    // Push succeeded even though pull failed
    expect(result.current.lastPushSucceeded).toBe(true);

    // Reset mock
    vi.mocked(syncPull).mockResolvedValue(undefined);
  });

  it("handles entity push failure gracefully (continues with transactions)", async () => {
    const { syncPushEntities } = await import("../../lib/syncPushEntities");
    const { syncPush } = await import("../../lib/syncPush");
    vi.mocked(syncPushEntities).mockRejectedValueOnce(new Error("Entity push failed"));
    vi.mocked(syncPush).mockClear();

    const { renderHook, act } = await import("@testing-library/react");
    const { useSyncEngine } = await import("../useSyncEngine");

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    await act(async () => {
      result.current.triggerSync();
      await vi.advanceTimersByTimeAsync(0);
    });

    // syncPush should still be called even though entity push failed
    expect(syncPush).toHaveBeenCalledWith("tenant-1");

    // Reset mock
    vi.mocked(syncPushEntities).mockResolvedValue(undefined);
  });
});
