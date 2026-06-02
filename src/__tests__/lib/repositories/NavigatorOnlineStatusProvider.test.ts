import { describe, expect, it, vi, afterEach } from "vitest";
import { NavigatorOnlineStatusProvider } from "#/infrastructure/persistence/dexie/repositories/NavigatorOnlineStatusProvider";

describe("NavigatorOnlineStatusProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when navigator.onLine is true", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const provider = new NavigatorOnlineStatusProvider();
    expect(provider.isOnline()).toBe(true);
  });

  it("returns false when navigator.onLine is false", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const provider = new NavigatorOnlineStatusProvider();
    expect(provider.isOnline()).toBe(false);
  });

  it("implements OnlineStatusProvider interface", () => {
    const provider = new NavigatorOnlineStatusProvider();
    expect(typeof provider.isOnline).toBe("function");
  });
});
