import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerHaptic } from "#/infrastructure/device/haptics";

describe("triggerHaptic", () => {
  let vibrateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vibrateMock = vi.fn();
    Object.defineProperty(globalThis, "navigator", {
      value: { vibrate: vibrateMock },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls navigator.vibrate(50) for "intermediate" type', () => {
    triggerHaptic("intermediate");
    expect(vibrateMock).toHaveBeenCalledWith(50);
  });

  it('calls navigator.vibrate(100) for "success" type', () => {
    triggerHaptic("success");
    expect(vibrateMock).toHaveBeenCalledWith(100);
  });

  it('calls navigator.vibrate([50, 50, 50]) for "error" type', () => {
    triggerHaptic("error");
    expect(vibrateMock).toHaveBeenCalledWith([50, 50, 50]);
  });

  it("does not throw when navigator.vibrate is not supported", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      writable: true,
      configurable: true,
    });
    expect(() => triggerHaptic("success")).not.toThrow();
  });

  it("does not throw when navigator is undefined (SSR)", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(() => triggerHaptic("error")).not.toThrow();
  });
});
