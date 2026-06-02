import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getDeviceBlockState,
  isDeviceBlocked,
  handleDeviceBlocked,
  clearBlockState,
  checkDeviceBlockResponse,
  formatBlockedUntil,
  subscribeToDeviceBlock,
  onDeviceUnblock,
  setupBlockVisibilityHandler,
} from "../deviceBlock";

// Mock the indexeddb module to avoid actual IndexedDB operations in tests
vi.mock("#/infrastructure/persistence/dexie/indexeddb", () => ({
  tenantContextStore: {
    getAll: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("deviceBlock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearBlockState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getDeviceBlockState", () => {
    it("returns unblocked state initially", () => {
      const state = getDeviceBlockState();
      expect(state.blocked).toBe(false);
      expect(state.blockedUntil).toBeNull();
    });
  });

  describe("isDeviceBlocked", () => {
    it("returns false when not blocked", () => {
      expect(isDeviceBlocked()).toBe(false);
    });

    it("returns true when blocked and time has not passed", async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      await handleDeviceBlocked(futureTime);
      expect(isDeviceBlocked()).toBe(true);
    });

    it("returns false when block has expired based on local clock", async () => {
      const pastTime = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
      await handleDeviceBlocked(pastTime);
      expect(isDeviceBlocked()).toBe(false);
    });
  });

  describe("handleDeviceBlocked", () => {
    it("sets blocked state with blockedUntil timestamp", async () => {
      const blockedUntil = Math.floor(Date.now() / 1000) + 7200;
      await handleDeviceBlocked(blockedUntil);

      const state = getDeviceBlockState();
      expect(state.blocked).toBe(true);
      expect(state.blockedUntil).toBe(blockedUntil);
    });

    it("notifies subscribers when block is set", async () => {
      const listener = vi.fn();
      subscribeToDeviceBlock(listener);

      const blockedUntil = Math.floor(Date.now() / 1000) + 3600;
      await handleDeviceBlocked(blockedUntil);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ blocked: true, blockedUntil }),
      );
    });
  });

  describe("clearBlockState", () => {
    it("resets state to unblocked", async () => {
      const blockedUntil = Math.floor(Date.now() / 1000) + 3600;
      await handleDeviceBlocked(blockedUntil);
      expect(isDeviceBlocked()).toBe(true);

      clearBlockState();
      expect(isDeviceBlocked()).toBe(false);
      expect(getDeviceBlockState().blockedUntil).toBeNull();
    });

    it("notifies subscribers when cleared", async () => {
      const blockedUntil = Math.floor(Date.now() / 1000) + 3600;
      await handleDeviceBlocked(blockedUntil);

      const listener = vi.fn();
      subscribeToDeviceBlock(listener);

      clearBlockState();
      expect(listener).toHaveBeenCalledWith({ blocked: false, blockedUntil: null });
    });
  });

  describe("subscribeToDeviceBlock", () => {
    it("returns an unsubscribe function", async () => {
      const listener = vi.fn();
      const unsubscribe = subscribeToDeviceBlock(listener);

      const blockedUntil = Math.floor(Date.now() / 1000) + 3600;
      await handleDeviceBlocked(blockedUntil);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      clearBlockState();
      // Should not be called again after unsubscribe
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("checkDeviceBlockResponse", () => {
    it("returns false for non-403 responses", async () => {
      const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
      const result = await checkDeviceBlockResponse(response);
      expect(result).toBe(false);
    });

    it("returns false for 403 without device_blocked error", async () => {
      const response = new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
      const result = await checkDeviceBlockResponse(response);
      expect(result).toBe(false);
    });

    it("returns true and sets block state for 403 device_blocked", async () => {
      const blockedUntil = Math.floor(Date.now() / 1000) + 3600;
      const response = new Response(JSON.stringify({ error: "device_blocked", blockedUntil }), {
        status: 403,
      });

      const result = await checkDeviceBlockResponse(response, "tenant-123");
      expect(result).toBe(true);
      expect(isDeviceBlocked()).toBe(true);
      expect(getDeviceBlockState().blockedUntil).toBe(blockedUntil);
    });

    it("returns false for 403 with non-JSON body", async () => {
      const response = new Response("Forbidden", { status: 403 });
      const result = await checkDeviceBlockResponse(response);
      expect(result).toBe(false);
    });
  });

  describe("formatBlockedUntil", () => {
    it("formats a unix timestamp into a locale string", () => {
      // Use a known timestamp: 2025-01-15 10:30:00 UTC
      const timestamp = 1736935800;
      const formatted = formatBlockedUntil(timestamp);
      // Should produce a non-empty string (exact format depends on locale)
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe("string");
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe("unblock timer", () => {
    it("clears block state when timer fires", async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const blockedUntil = nowSeconds + 60; // 60 seconds from now
      await handleDeviceBlocked(blockedUntil);

      expect(isDeviceBlocked()).toBe(true);

      // Advance time past the block expiry
      vi.advanceTimersByTime(61_000);

      const state = getDeviceBlockState();
      expect(state.blocked).toBe(false);
      expect(state.blockedUntil).toBeNull();
    });

    it("calls onDeviceUnblock callback when timer fires", async () => {
      const callback = vi.fn();
      onDeviceUnblock(callback);

      const nowSeconds = Math.floor(Date.now() / 1000);
      const blockedUntil = nowSeconds + 30;
      await handleDeviceBlocked(blockedUntil);

      vi.advanceTimersByTime(31_000);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("caps delay at 24 hours for very large blockedUntil values", async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const blockedUntil = nowSeconds + 365 * 24 * 60 * 60; // 1 year from now
      await handleDeviceBlocked(blockedUntil);

      expect(isDeviceBlocked()).toBe(true);
      // After 24 hours, the timer should fire (capped)
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000);
      expect(getDeviceBlockState().blocked).toBe(false);
    });
  });

  describe("onDeviceUnblock", () => {
    it("registers a callback for unblock events", async () => {
      const callback = vi.fn();
      onDeviceUnblock(callback);

      const nowSeconds = Math.floor(Date.now() / 1000);
      await handleDeviceBlocked(nowSeconds + 10);
      vi.advanceTimersByTime(11_000);

      expect(callback).toHaveBeenCalled();
    });
  });

  describe("setupBlockVisibilityHandler", () => {
    it("returns a cleanup function", () => {
      const mockAddEventListener = vi.fn();
      const mockRemoveEventListener = vi.fn();
      vi.stubGlobal("document", {
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
        visibilityState: "visible",
      });

      const cleanup = setupBlockVisibilityHandler();
      expect(typeof cleanup).toBe("function");
      expect(mockAddEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

      cleanup();
      expect(mockRemoveEventListener).toHaveBeenCalledWith(
        "visibilitychange",
        expect.any(Function),
      );

      vi.unstubAllGlobals();
    });

    it("clears expired block when tab becomes visible", async () => {
      const mockListeners: Record<string, Function> = {};
      vi.stubGlobal("document", {
        addEventListener: (event: string, handler: Function) => {
          mockListeners[event] = handler;
        },
        removeEventListener: vi.fn(),
        visibilityState: "visible",
      });

      setupBlockVisibilityHandler();

      // Set a block that has already expired
      const pastTime = Math.floor(Date.now() / 1000) - 10;
      await handleDeviceBlocked(pastTime);
      // The block is already expired but state is still set
      // Simulate visibility change
      if (mockListeners["visibilitychange"]) {
        mockListeners["visibilitychange"]();
      }

      // Block should be cleared
      expect(getDeviceBlockState().blocked).toBe(false);

      vi.unstubAllGlobals();
    });

    it("does nothing when tab is not visible", async () => {
      const mockListeners: Record<string, Function> = {};
      vi.stubGlobal("document", {
        addEventListener: (event: string, handler: Function) => {
          mockListeners[event] = handler;
        },
        removeEventListener: vi.fn(),
        visibilityState: "hidden",
      });

      setupBlockVisibilityHandler();

      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      await handleDeviceBlocked(futureTime);

      if (mockListeners["visibilitychange"]) {
        mockListeners["visibilitychange"]();
      }

      // Block should still be active (tab is hidden)
      expect(getDeviceBlockState().blocked).toBe(true);

      vi.unstubAllGlobals();
      clearBlockState();
    });
  });
});
