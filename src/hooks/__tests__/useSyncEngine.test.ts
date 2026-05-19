// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSyncEngine } from "../useSyncEngine";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("../../lib/syncPush", () => ({
  syncPush: vi.fn(),
}));

vi.mock("../../lib/syncPull", () => ({
  syncPull: vi.fn(),
}));

vi.mock("../../lib/deviceBlock", () => ({
  isDeviceBlocked: vi.fn(),
}));

vi.mock("../../lib/transactionLogService", () => ({
  getSyncableEntries: vi.fn(),
}));

import { syncPush } from "../../lib/syncPush";
import { syncPull } from "../../lib/syncPull";
import { isDeviceBlocked } from "../../lib/deviceBlock";
import { getSyncableEntries } from "../../lib/transactionLogService";

const mockSyncPush = vi.mocked(syncPush);
const mockSyncPull = vi.mocked(syncPull);
const mockIsDeviceBlocked = vi.mocked(isDeviceBlocked);
const mockGetSyncableEntries = vi.mocked(getSyncableEntries);

describe("useSyncEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockSyncPush.mockResolvedValue({
      totalAccepted: 0,
      totalRejected: 0,
      pullNeeded: false,
      conflictCount: 0,
    });
    mockSyncPull.mockResolvedValue({
      membersPulled: 0,
      cardsPulled: 0,
      transactionsPulled: 0,
      authRequired: false,
    });
    mockIsDeviceBlocked.mockReturnValue(false);
    mockGetSyncableEntries.mockResolvedValue([]);
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with idle status and null lastSyncedAt", () => {
    const { result } = renderHook(() => useSyncEngine("tenant-1", true));
    expect(result.current.syncStatus).toBe("idle");
    expect(result.current.lastSyncedAt).toBeNull();
    expect(result.current.pendingCount).toBe(0);
  });

  it("reports offline status when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    const { result } = renderHook(() => useSyncEngine("tenant-1", true));
    expect(result.current.syncStatus).toBe("offline");
  });

  it("transitions through pushing → pulling → idle on triggerSync", async () => {
    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    await act(async () => {
      result.current.triggerSync();
    });

    expect(result.current.syncStatus).toBe("idle");
    expect(result.current.lastSyncedAt).not.toBeNull();
    expect(mockSyncPush).toHaveBeenCalledWith("tenant-1");
    expect(mockSyncPull).toHaveBeenCalledWith("tenant-1");
  });

  it("sets error status when syncPush throws", async () => {
    mockSyncPush.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    await act(async () => {
      result.current.triggerSync();
    });

    expect(result.current.syncStatus).toBe("error");
    expect(result.current.lastSyncedAt).toBeNull();
  });

  it("debounces sync on notifyMutation — waits 5 seconds", async () => {
    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    act(() => {
      result.current.notifyMutation();
    });

    // Should not have called syncPush yet
    expect(mockSyncPush).not.toHaveBeenCalled();

    // Advance 4 seconds — still not called
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(mockSyncPush).not.toHaveBeenCalled();

    // Advance past 5 seconds — should trigger
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(mockSyncPush).toHaveBeenCalledTimes(1);
  });

  it("resets debounce timer on subsequent mutations within window", async () => {
    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    act(() => {
      result.current.notifyMutation();
    });

    // Advance 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Another mutation — should reset the timer
    act(() => {
      result.current.notifyMutation();
    });

    // Advance 3 more seconds (6s total from first, 3s from second)
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(mockSyncPush).not.toHaveBeenCalled();

    // Advance 2 more seconds (5s from second mutation)
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(mockSyncPush).toHaveBeenCalledTimes(1);
  });

  it("queues sync request if cycle already in progress", async () => {
    let pushResolve: () => void;
    const pushPromise = new Promise<void>((resolve) => { pushResolve = resolve; });

    mockSyncPush.mockImplementationOnce(async () => {
      await pushPromise;
      return { totalAccepted: 0, totalRejected: 0, pullNeeded: false, conflictCount: 0 };
    });

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    // Start first sync
    act(() => {
      result.current.triggerSync();
    });

    expect(result.current.syncStatus).toBe("pushing");

    // Trigger another sync while first is in progress
    act(() => {
      result.current.triggerSync();
    });

    // Resolve the first push
    await act(async () => {
      pushResolve!();
    });

    // Allow the queued sync setTimeout(100ms) to fire
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // The queued sync should have been executed (second call)
    expect(mockSyncPush).toHaveBeenCalledTimes(2);
  });

  it("does not sync when device is blocked", async () => {
    mockIsDeviceBlocked.mockReturnValue(true);

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    await act(async () => {
      result.current.triggerSync();
    });

    expect(result.current.syncStatus).toBe("offline");
    expect(mockSyncPush).not.toHaveBeenCalled();
  });

  it("does not sync when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });

    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    await act(async () => {
      result.current.triggerSync();
    });

    expect(result.current.syncStatus).toBe("offline");
    expect(mockSyncPush).not.toHaveBeenCalled();
  });

  it("triggers immediate sync on online event", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    const { result } = renderHook(() => useSyncEngine("tenant-1", true));

    expect(result.current.syncStatus).toBe("offline");

    // Clear mocks before the action we want to test
    mockSyncPush.mockClear();

    // Simulate coming back online
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(mockSyncPush).toHaveBeenCalledWith("tenant-1");
  });

  it("triggers immediate sync on visibility change to visible", async () => {
    // Start with hidden state so the visibility change triggers
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    renderHook(() => useSyncEngine("tenant-1", true));

    // Clear mocks before the action we want to test
    mockSyncPush.mockClear();

    // Now change to visible
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(mockSyncPush).toHaveBeenCalledWith("tenant-1");
  });

  it("does not trigger sync on visibility change to hidden", async () => {
    renderHook(() => useSyncEngine("tenant-1", true));

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(mockSyncPush).not.toHaveBeenCalled();
  });

  it("does not sync when tenantId is null", async () => {
    const { result } = renderHook(() => useSyncEngine(null, true));

    await act(async () => {
      result.current.triggerSync();
    });

    expect(mockSyncPush).not.toHaveBeenCalled();
  });

  it("does not sync when enabled is false", async () => {
    const { result } = renderHook(() => useSyncEngine("tenant-1", false));

    await act(async () => {
      result.current.triggerSync();
    });

    expect(mockSyncPush).not.toHaveBeenCalled();
  });

  it("exposes pending count from getSyncableEntries", async () => {
    mockGetSyncableEntries.mockResolvedValue([
      { id: 1, tenantId: "t1", cardId: "abc", counter: 1, type: "debit", amount: 100, balanceAfter: 900, timestamp: 1000, hash: "aaa", terminalId: null, deviceId: null, syncStatus: "pending", syncedAt: null, createdAt: 1000, userId: null },
      { id: 2, tenantId: "t1", cardId: "abc", counter: 2, type: "debit", amount: 50, balanceAfter: 850, timestamp: 1001, hash: "bbb", terminalId: null, deviceId: null, syncStatus: "pending", syncedAt: null, createdAt: 1001, userId: null },
    ] as any);

    const { result } = renderHook(() => useSyncEngine("t1", true));

    // Wait for the async pending count refresh
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.pendingCount).toBe(2);
  });

  it("cleans up timers on unmount", () => {
    const { result, unmount } = renderHook(() => useSyncEngine("tenant-1", true));

    act(() => {
      result.current.notifyMutation();
    });

    // Unmount should not throw
    unmount();

    // Advancing timers after unmount should not cause errors
    expect(() => {
      vi.advanceTimersByTime(10000);
    }).not.toThrow();
  });
});
