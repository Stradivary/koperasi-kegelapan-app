// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("useInstallPrompt", () => {
  type MqlListener = (e: { matches: boolean }) => void;

  function setupMatchMedia(matches = false) {
    const listeners: MqlListener[] = [];
    const mql = {
      matches,
      addEventListener: vi.fn((event: string, handler: MqlListener) => {
        if (event === "change") listeners.push(handler);
      }),
      removeEventListener: vi.fn(),
      _listeners: listeners,
      _fire: (newMatches: boolean) => {
        listeners.forEach((h) => h({ matches: newMatches }));
      },
    };
    Object.defineProperty(globalThis, "matchMedia", {
      value: vi.fn().mockReturnValue(mql),
      writable: true,
      configurable: true,
    });
    return mql;
  }

  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
    setupMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("canInstall is false initially when no prompt event has fired", async () => {
    const { useInstallPrompt } = await import("../useInstallPrompt");
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  it("isInstalled is false initially", async () => {
    const { useInstallPrompt } = await import("../useInstallPrompt");
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isInstalled).toBe(false);
  });

  it("isInstalled is true when display-mode matches standalone", async () => {
    setupMatchMedia(true);
    const { useInstallPrompt } = await import("../useInstallPrompt");
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isInstalled).toBe(true);
  });

  it("canInstall becomes true when beforeinstallprompt fires", async () => {
    const { useInstallPrompt } = await import("../useInstallPrompt");
    const { result } = renderHook(() => useInstallPrompt());

    const fakeEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "accepted" }),
    };

    act(() => {
      // Dispatch the beforeinstallprompt event
      const event = Object.assign(new Event("beforeinstallprompt"), fakeEvent);
      globalThis.dispatchEvent(event);
    });

    expect(result.current.canInstall).toBe(true);
  });

  it("dismiss() sets canInstall to false and persists to sessionStorage", async () => {
    const { useInstallPrompt } = await import("../useInstallPrompt");
    const { result } = renderHook(() => useInstallPrompt());

    // Trigger prompt
    act(() => {
      const fakeEvent = Object.assign(new Event("beforeinstallprompt"), {
        preventDefault: vi.fn(),
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      globalThis.dispatchEvent(fakeEvent);
    });

    expect(result.current.canInstall).toBe(true);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.canInstall).toBe(false);
    expect(sessionStorage.getItem("pwa-install-prompt-dismissed")).toBe("true");
  });

  it("canInstall is false when already dismissed in session", async () => {
    sessionStorage.setItem("pwa-install-prompt-dismissed", "true");

    const { useInstallPrompt } = await import("../useInstallPrompt");
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      const fakeEvent = Object.assign(new Event("beforeinstallprompt"), {
        preventDefault: vi.fn(),
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      globalThis.dispatchEvent(fakeEvent);
    });

    expect(result.current.canInstall).toBe(false);
  });

  it("install() returns false when no deferred prompt", async () => {
    const { useInstallPrompt } = await import("../useInstallPrompt");
    const { result } = renderHook(() => useInstallPrompt());

    let installResult: boolean | undefined;
    await act(async () => {
      installResult = await result.current.install();
    });

    expect(installResult).toBe(false);
  });

  it("isInstalled becomes true when appinstalled fires", async () => {
    const { useInstallPrompt } = await import("../useInstallPrompt");
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      globalThis.dispatchEvent(new Event("appinstalled"));
    });

    expect(result.current.isInstalled).toBe(true);
  });
});
