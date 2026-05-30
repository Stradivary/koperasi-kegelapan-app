// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("useIsMobile", () => {
  let changeHandler: (() => void) | null = null;

  function setupMatchMedia(innerWidth: number) {
    Object.defineProperty(globalThis, "innerWidth", {
      value: innerWidth,
      writable: true,
      configurable: true,
    });
    const mql = {
      matches: false,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "change") changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(globalThis, "matchMedia", {
      value: vi.fn().mockReturnValue(mql),
      writable: true,
      configurable: true,
    });
    return mql;
  }

  beforeEach(() => {
    changeHandler = null;
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when window width is >= 768", async () => {
    setupMatchMedia(1024);
    const { useIsMobile } = await import("../use-mobile");
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true when window width is < 768", async () => {
    setupMatchMedia(375);
    const { useIsMobile } = await import("../use-mobile");
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false when window width is exactly 768", async () => {
    setupMatchMedia(768);
    const { useIsMobile } = await import("../use-mobile");
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("registers a change listener on the media query", async () => {
    const mql = setupMatchMedia(1024);
    const { useIsMobile } = await import("../use-mobile");
    renderHook(() => useIsMobile());
    expect(mql.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("removes the change listener on unmount", async () => {
    const mql = setupMatchMedia(1024);
    const { useIsMobile } = await import("../use-mobile");
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("updates to true when media query fires a change event with small width", async () => {
    setupMatchMedia(1024);
    const { useIsMobile } = await import("../use-mobile");
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      Object.defineProperty(globalThis, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      });
      changeHandler?.();
    });

    expect(result.current).toBe(true);
  });
});
