// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnlineStatus } from "../useOnlineStatus";

describe("useOnlineStatus", () => {
  afterEach(() => {
    // Reset navigator.onLine to default (true)
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });

  it("returns isOnline: true when navigator.onLine is true", () => {
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it("returns isOnline: false when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(false);
  });

  it("updates to false when offline event fires", () => {
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);

    act(() => {
      globalThis.dispatchEvent(new Event("offline"));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it("updates to true when online event fires", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(false);

    act(() => {
      globalThis.dispatchEvent(new Event("online"));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it("cleans up event listeners on unmount", () => {
    const { unmount } = renderHook(() => useOnlineStatus());

    // Unmount should not throw
    unmount();

    // After unmount, dispatching events should not cause errors
    expect(() => {
      globalThis.dispatchEvent(new Event("online"));
      globalThis.dispatchEvent(new Event("offline"));
    }).not.toThrow();
  });
});
