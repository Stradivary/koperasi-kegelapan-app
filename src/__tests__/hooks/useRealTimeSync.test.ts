// @vitest-environment jsdom
/**
 * Tests for src/hooks/useRealTimeSync.ts
 * Covers: fullSyncOnLogin → connect flow, disconnect on unmount,
 *         disabled/no tenantId passthrough, error handling
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFullSyncOnLogin = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockOnEvent = vi.fn();
const mockIsConnected = vi.fn();
const mockGetCurrentDeviceId = vi.fn();

vi.mock("#/infrastructure/api/realTimeSync", () => ({
  fullSyncOnLogin: (...args: unknown[]) => mockFullSyncOnLogin(...args),
  connect: (...args: unknown[]) => mockConnect(...args),
  disconnect: (...args: unknown[]) => mockDisconnect(...args),
  onEvent: (...args: unknown[]) => mockOnEvent(...args),
  isConnected: () => mockIsConnected(),
}));

vi.mock("#/infrastructure/api/apiClient", () => ({
  API_BASE_URL: "http://localhost:8787",
  getCurrentDeviceId: () => mockGetCurrentDeviceId(),
}));

import { useRealTimeSync } from "#/presentation/hooks/useRealTimeSync";

describe("useRealTimeSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFullSyncOnLogin.mockResolvedValue(undefined);
    mockConnect.mockReturnValue(undefined);
    mockDisconnect.mockReturnValue(undefined);
    mockOnEvent.mockReturnValue(() => {});
    mockIsConnected.mockReturnValue(false);
    mockGetCurrentDeviceId.mockReturnValue("device-123");
  });

  it("does nothing when tenantId is null", async () => {
    renderHook(() => useRealTimeSync({ tenantId: null }));
    await waitFor(() => {
      expect(mockFullSyncOnLogin).not.toHaveBeenCalled();
      expect(mockConnect).not.toHaveBeenCalled();
    });
  });

  it("does nothing when enabled is false", async () => {
    renderHook(() => useRealTimeSync({ tenantId: "t-1", enabled: false }));
    await waitFor(() => {
      expect(mockFullSyncOnLogin).not.toHaveBeenCalled();
      expect(mockConnect).not.toHaveBeenCalled();
    });
  });

  it("calls fullSyncOnLogin with tenantId when enabled", async () => {
    renderHook(() => useRealTimeSync({ tenantId: "t-1", enabled: true }));
    await waitFor(() => {
      expect(mockFullSyncOnLogin).toHaveBeenCalledWith("t-1");
    });
  });

  it("calls connect after fullSyncOnLogin succeeds", async () => {
    renderHook(() => useRealTimeSync({ tenantId: "t-1", enabled: true }));
    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "t-1",
          deviceId: "device-123",
          sseUrl: "http://localhost:8787/api/sync/sse",
        }),
      );
    });
  });

  it("registers card_status_change event handler", async () => {
    renderHook(() => useRealTimeSync({ tenantId: "t-1", enabled: true }));
    await waitFor(() => {
      expect(mockOnEvent).toHaveBeenCalledWith("card_status_change", expect.any(Function));
    });
  });

  it("calls disconnect on unmount", async () => {
    const { unmount } = renderHook(() => useRealTimeSync({ tenantId: "t-1", enabled: true }));
    await waitFor(() => expect(mockConnect).toHaveBeenCalled());
    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("calls unsubscribe on unmount", async () => {
    const unsubscribe = vi.fn();
    mockOnEvent.mockReturnValue(unsubscribe);
    const { unmount } = renderHook(() => useRealTimeSync({ tenantId: "t-1", enabled: true }));
    await waitFor(() => expect(mockOnEvent).toHaveBeenCalled());
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("does not call connect when fullSyncOnLogin fails", async () => {
    mockFullSyncOnLogin.mockRejectedValue(new Error("sync failed"));
    renderHook(() => useRealTimeSync({ tenantId: "t-1", enabled: true }));
    await waitFor(() => expect(mockFullSyncOnLogin).toHaveBeenCalled());
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("disconnects when enabled changes to false after being connected", async () => {
    let enabled = true;
    const { rerender } = renderHook(() => useRealTimeSync({ tenantId: "t-1", enabled }));
    await waitFor(() => expect(mockConnect).toHaveBeenCalled());

    enabled = false;
    act(() => {
      rerender();
    });
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("uses unknown as deviceId when getCurrentDeviceId returns null", async () => {
    mockGetCurrentDeviceId.mockReturnValue(null);
    renderHook(() => useRealTimeSync({ tenantId: "t-1", enabled: true }));
    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({ deviceId: "unknown" }));
    });
  });

  it("skips re-initialization when already connected", async () => {
    mockIsConnected.mockReturnValue(true);
    const { rerender } = renderHook(() => useRealTimeSync({ tenantId: "t-1", enabled: true }));
    await waitFor(() => expect(mockFullSyncOnLogin).toHaveBeenCalledTimes(1));
    rerender();
    // Should not call fullSyncOnLogin again
    expect(mockFullSyncOnLogin).toHaveBeenCalledTimes(1);
  });
});
