// @vitest-environment jsdom
/**
 * Tests for src/hooks/useDeviceBlock.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockNavigate = vi.fn();
const mockSubscribeToDeviceBlock = vi.fn();
const mockGetDeviceBlockState = vi.fn();
const mockIsDeviceBlocked = vi.fn();
const mockOnDeviceUnblock = vi.fn();
const mockFormatBlockedUntil = vi.fn();
const mockSetupBlockVisibilityHandler = vi.fn();
const mockToastError = vi.fn();
const mockToastInfo = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

vi.mock("#/infrastructure/api/deviceBlock", () => ({
  getDeviceBlockState: () => mockGetDeviceBlockState(),
  subscribeToDeviceBlock: (...args: unknown[]) => mockSubscribeToDeviceBlock(...args),
  isDeviceBlocked: () => mockIsDeviceBlocked(),
  onDeviceUnblock: (...args: unknown[]) => mockOnDeviceUnblock(...args),
  formatBlockedUntil: (...args: unknown[]) => mockFormatBlockedUntil(...args),
  setupBlockVisibilityHandler: () => mockSetupBlockVisibilityHandler(),
}));

describe("useDeviceBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDeviceBlockState.mockReturnValue({ blocked: false, blockedUntil: null });
    mockSubscribeToDeviceBlock.mockReturnValue(() => {});
    mockSetupBlockVisibilityHandler.mockReturnValue(() => {});
    mockOnDeviceUnblock.mockReturnValue(undefined);
    mockIsDeviceBlocked.mockReturnValue(false);
    mockFormatBlockedUntil.mockReturnValue("12:00");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns initial unblocked state", async () => {
    const { useDeviceBlock } = await import("../useDeviceBlock");
    const { result } = renderHook(() => useDeviceBlock());

    expect(result.current.blocked).toBe(false);
    expect(result.current.blockedUntil).toBeNull();
    expect(result.current.blockedUntilFormatted).toBeNull();
  });

  it("subscribes to device block state changes on mount", async () => {
    const { useDeviceBlock } = await import("../useDeviceBlock");
    renderHook(() => useDeviceBlock());

    expect(mockSubscribeToDeviceBlock).toHaveBeenCalledOnce();
  });

  it("sets up visibility handler on mount", async () => {
    const { useDeviceBlock } = await import("../useDeviceBlock");
    renderHook(() => useDeviceBlock());

    expect(mockSetupBlockVisibilityHandler).toHaveBeenCalledOnce();
  });

  it("registers unblock callback on mount", async () => {
    const { useDeviceBlock } = await import("../useDeviceBlock");
    renderHook(() => useDeviceBlock());

    expect(mockOnDeviceUnblock).toHaveBeenCalledOnce();
  });

  it("updates blocked state when subscription fires", async () => {
    const { useDeviceBlock } = await import("../useDeviceBlock");
    let subscriptionCallback:
      | ((state: { blocked: boolean; blockedUntil: number | null }) => void)
      | null = null;
    mockSubscribeToDeviceBlock.mockImplementation((cb: typeof subscriptionCallback) => {
      subscriptionCallback = cb;
      return () => {};
    });

    const { result } = renderHook(() => useDeviceBlock());

    expect(result.current.blocked).toBe(false);

    act(() => {
      subscriptionCallback?.({ blocked: true, blockedUntil: 9999999999 });
    });

    expect(result.current.blocked).toBe(true);
    expect(result.current.blockedUntil).toBe(9999999999);
  });

  it("shows toast when device becomes blocked", async () => {
    const { useDeviceBlock } = await import("../useDeviceBlock");
    let subscriptionCallback:
      | ((state: { blocked: boolean; blockedUntil: number | null }) => void)
      | null = null;
    mockSubscribeToDeviceBlock.mockImplementation((cb: typeof subscriptionCallback) => {
      subscriptionCallback = cb;
      return () => {};
    });
    mockFormatBlockedUntil.mockReturnValue("2026-01-01 12:00");

    renderHook(() => useDeviceBlock());

    act(() => {
      subscriptionCallback?.({ blocked: true, blockedUntil: 9999999999 });
    });

    expect(mockToastError).toHaveBeenCalledOnce();
    expect(mockToastError.mock.calls[0][0]).toContain("2026-01-01 12:00");
  });

  it("checkBlocked delegates to isDeviceBlocked", async () => {
    const { useDeviceBlock } = await import("../useDeviceBlock");
    mockIsDeviceBlocked.mockReturnValue(true);

    const { result } = renderHook(() => useDeviceBlock());
    expect(result.current.checkBlocked()).toBe(true);
  });

  it("formats blockedUntil when blocked", async () => {
    const { useDeviceBlock } = await import("../useDeviceBlock");
    mockGetDeviceBlockState.mockReturnValue({ blocked: true, blockedUntil: 9999999999 });
    mockFormatBlockedUntil.mockReturnValue("Jan 1, 2286");

    const { result } = renderHook(() => useDeviceBlock());
    expect(result.current.blockedUntilFormatted).toBe("Jan 1, 2286");
  });

  it("unsubscribes on unmount", async () => {
    const { useDeviceBlock } = await import("../useDeviceBlock");
    const unsubscribe = vi.fn();
    mockSubscribeToDeviceBlock.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useDeviceBlock());
    unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
