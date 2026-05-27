/**
 * Additional tests for utils.ts covering lines 17-22:
 * setDeviceSetupLaunchContext when window === undefined
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { setDeviceSetupLaunchContext, consumeDeviceSetupLaunchContext } from "../utils";

describe("utils — window undefined guard (lines 17-22)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("setDeviceSetupLaunchContext does nothing when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    // Should not throw
    expect(() => setDeviceSetupLaunchContext({ returnTo: "/test" })).not.toThrow();
  });

  it("consumeDeviceSetupLaunchContext returns null when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    const result = consumeDeviceSetupLaunchContext();
    expect(result).toBeNull();
  });
});
