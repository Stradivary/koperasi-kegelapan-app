import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cn, setDeviceSetupLaunchContext, consumeDeviceSetupLaunchContext } from "../utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    const stateHidden = false;
    expect(cn("base", stateHidden && "hidden", "visible")).toBe("base visible");
  });

  it("merges tailwind classes correctly", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  it("handles undefined and null inputs", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });

  it("handles empty string", () => {
    expect(cn("", "foo")).toBe("foo");
  });

  it("handles arrays", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });
});

describe("DeviceSetupLaunchContext", () => {
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
    };
    vi.stubGlobal("window", { sessionStorage: storageMock });
    vi.stubGlobal("sessionStorage", storageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("setDeviceSetupLaunchContext", () => {
    it("stores context in sessionStorage", () => {
      setDeviceSetupLaunchContext({ returnTo: "/dashboard" });
      expect(mockStorage["device-setup-launch-context"]).toBeDefined();
      const stored = JSON.parse(mockStorage["device-setup-launch-context"]);
      expect(stored.returnTo).toBe("/dashboard");
    });

    it("stores context with optional returnLabel", () => {
      setDeviceSetupLaunchContext({ returnTo: "/home", returnLabel: "Home" });
      const stored = JSON.parse(mockStorage["device-setup-launch-context"]);
      expect(stored.returnLabel).toBe("Home");
    });
  });

  describe("consumeDeviceSetupLaunchContext", () => {
    it("returns null when no context is stored", () => {
      expect(consumeDeviceSetupLaunchContext()).toBeNull();
    });

    it("returns the stored context and removes it", () => {
      mockStorage["device-setup-launch-context"] = JSON.stringify({ returnTo: "/settings" });
      const result = consumeDeviceSetupLaunchContext();
      expect(result).toEqual({ returnTo: "/settings", returnLabel: undefined });
      expect(mockStorage["device-setup-launch-context"]).toBeUndefined();
    });

    it("returns context with returnLabel when present", () => {
      mockStorage["device-setup-launch-context"] = JSON.stringify({
        returnTo: "/page",
        returnLabel: "My Page",
      });
      const result = consumeDeviceSetupLaunchContext();
      expect(result).toEqual({ returnTo: "/page", returnLabel: "My Page" });
    });

    it("returns null for invalid JSON", () => {
      mockStorage["device-setup-launch-context"] = "not-json{";
      expect(consumeDeviceSetupLaunchContext()).toBeNull();
    });

    it("returns null when returnTo is missing", () => {
      mockStorage["device-setup-launch-context"] = JSON.stringify({ returnLabel: "test" });
      expect(consumeDeviceSetupLaunchContext()).toBeNull();
    });

    it("returns null when returnTo is empty string", () => {
      mockStorage["device-setup-launch-context"] = JSON.stringify({ returnTo: "" });
      expect(consumeDeviceSetupLaunchContext()).toBeNull();
    });

    it("returns null when returnTo is not a string", () => {
      mockStorage["device-setup-launch-context"] = JSON.stringify({ returnTo: 123 });
      expect(consumeDeviceSetupLaunchContext()).toBeNull();
    });

    it("ignores non-string returnLabel", () => {
      mockStorage["device-setup-launch-context"] = JSON.stringify({
        returnTo: "/ok",
        returnLabel: 42,
      });
      const result = consumeDeviceSetupLaunchContext();
      expect(result).toEqual({ returnTo: "/ok", returnLabel: undefined });
    });
  });
});
