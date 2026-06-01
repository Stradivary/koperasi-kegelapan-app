// @vitest-environment jsdom
/**
 * Additional tests for useOnlineStatus.ts covering line 13:
 * Initial state when navigator.onLine is false
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnlineStatus } from "../useOnlineStatus";

describe("useOnlineStatus - initial offline state (line 13)", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("initializes as offline when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(false);
  });

  it("updates to online when online event fires", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(false);

    act(() => {
      globalThis.dispatchEvent(new Event("online"));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it("updates to offline when offline event fires", () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);

    act(() => {
      globalThis.dispatchEvent(new Event("offline"));
    });

    expect(result.current.isOnline).toBe(false);
  });
});
