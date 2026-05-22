import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock deviceBlock module
vi.mock("../deviceBlock", () => ({
  isDeviceBlocked: vi.fn().mockReturnValue(false),
  checkDeviceBlockResponse: vi.fn().mockResolvedValue(false),
}));

// Mock indexeddb module
vi.mock("../indexeddb", () => ({
  authTokenCacheStore: {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock import.meta.env
vi.stubEnv("VITE_API_BASE_URL", "https://test-api.example.com");

import {
  setCurrentDeviceId,
  getCurrentDeviceId,
  setAccessToken,
  getAccessToken,
  apiFetch,
  DeviceBlockedError,
  restoreAuthState,
} from "../api";
import { isDeviceBlocked, checkDeviceBlockResponse } from "../deviceBlock";
import { authTokenCacheStore } from "../indexeddb";

describe("api module", () => {
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    mockLocalStorage = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockLocalStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockLocalStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockLocalStorage[key];
      },
    });

    // Reset state
    setCurrentDeviceId(null);
    setAccessToken(null);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("setCurrentDeviceId / getCurrentDeviceId", () => {
    it("sets and gets device ID", () => {
      setCurrentDeviceId("device-123");
      expect(getCurrentDeviceId()).toBe("device-123");
    });

    it("persists to localStorage", () => {
      setCurrentDeviceId("device-456");
      expect(mockLocalStorage["kk_device_id"]).toBe("device-456");
    });

    it("clears device ID when null", () => {
      setCurrentDeviceId("device-789");
      setCurrentDeviceId(null);
      expect(getCurrentDeviceId()).toBeNull();
      expect(mockLocalStorage["kk_device_id"]).toBeUndefined();
    });
  });

  describe("setAccessToken / getAccessToken", () => {
    it("sets and gets access token", () => {
      setAccessToken("token-abc");
      expect(getAccessToken()).toBe("token-abc");
    });

    it("persists to localStorage", () => {
      setAccessToken("token-xyz");
      expect(mockLocalStorage["kk_access_token"]).toBe("token-xyz");
    });

    it("clears token when null", () => {
      setAccessToken("token-123");
      setAccessToken(null);
      expect(getAccessToken()).toBeNull();
      expect(mockLocalStorage["kk_access_token"]).toBeUndefined();
    });

    it("persists to IndexedDB when deviceId is set", () => {
      setCurrentDeviceId("dev1");
      setAccessToken("token-idb");
      expect(authTokenCacheStore.put).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: "dev1",
          accessToken: "token-idb",
        }),
      );
    });

    it("deletes from IndexedDB when clearing with deviceId set", () => {
      setCurrentDeviceId("dev1");
      setAccessToken(null);
      expect(authTokenCacheStore.delete).toHaveBeenCalledWith("dev1");
    });
  });

  describe("apiFetch", () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      vi.stubGlobal("fetch", mockFetch);
    });

    it("throws DeviceBlockedError when device is blocked", async () => {
      vi.mocked(isDeviceBlocked).mockReturnValue(true);
      await expect(apiFetch("https://api.test/endpoint")).rejects.toThrow(DeviceBlockedError);
    });

    it("makes fetch request when not blocked", async () => {
      vi.mocked(isDeviceBlocked).mockReturnValue(false);
      const res = await apiFetch("https://api.test/endpoint");
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("injects X-Device-Id header when device ID is set", async () => {
      setCurrentDeviceId("my-device");
      await apiFetch("https://api.test/endpoint");
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1]?.headers;
      expect(headers["X-Device-Id"]).toBe("my-device");
    });

    it("injects Authorization header when access token is set", async () => {
      setAccessToken("my-token");
      await apiFetch("https://api.test/endpoint");
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1]?.headers;
      expect(headers["Authorization"]).toBe("Bearer my-token");
    });

    it("does not override existing Authorization header", async () => {
      setAccessToken("my-token");
      await apiFetch("https://api.test/endpoint", {
        headers: { Authorization: "Bearer custom" },
      });
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1]?.headers;
      expect(headers["Authorization"]).toBe("Bearer custom");
    });

    it("throws DeviceBlockedError when response is device_blocked", async () => {
      vi.mocked(checkDeviceBlockResponse).mockResolvedValue(true);
      await expect(apiFetch("https://api.test/endpoint")).rejects.toThrow(DeviceBlockedError);
    });

    it("passes options through to fetch", async () => {
      vi.mocked(checkDeviceBlockResponse).mockResolvedValue(false);
      await apiFetch("https://api.test/endpoint", { method: "POST", body: "data" });
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1]?.method).toBe("POST");
      expect(callArgs[1]?.body).toBe("data");
    });

    it("handles Headers object", async () => {
      vi.mocked(checkDeviceBlockResponse).mockResolvedValue(false);
      setCurrentDeviceId("dev1");
      const headers = new Headers({ "Content-Type": "application/json" });
      await apiFetch("https://api.test/endpoint", { headers });
      const callArgs = mockFetch.mock.calls[0];
      const resultHeaders = callArgs[1]?.headers;
      expect(resultHeaders instanceof Headers).toBe(true);
      expect((resultHeaders as Headers).get("X-Device-Id")).toBe("dev1");
    });

    it("handles array headers", async () => {
      vi.mocked(checkDeviceBlockResponse).mockResolvedValue(false);
      setCurrentDeviceId("dev1");
      const headers: [string, string][] = [["Content-Type", "application/json"]];
      await apiFetch("https://api.test/endpoint", { headers });
      const callArgs = mockFetch.mock.calls[0];
      const resultHeaders = callArgs[1]?.headers;
      expect(Array.isArray(resultHeaders)).toBe(true);
    });
  });

  describe("DeviceBlockedError", () => {
    it("has correct name and isDeviceBlocked flag", () => {
      const err = new DeviceBlockedError("test");
      expect(err.name).toBe("DeviceBlockedError");
      expect(err.isDeviceBlocked).toBe(true);
      expect(err.message).toBe("test");
    });

    it("is an instance of Error", () => {
      const err = new DeviceBlockedError("test");
      expect(err instanceof Error).toBe(true);
    });
  });

  describe("restoreAuthState", () => {
    it("returns true when localStorage has token", async () => {
      mockLocalStorage["kk_access_token"] = "existing-token";
      // Need to re-import or simulate the hydration
      setAccessToken("existing-token");
      const result = await restoreAuthState("dev1");
      expect(result).toBe(true);
    });

    it("falls back to IndexedDB when no localStorage token", async () => {
      setAccessToken(null);
      vi.mocked(authTokenCacheStore.get).mockResolvedValue({
        deviceId: "dev1",
        accessToken: "idb-token",
        expiresAt: Date.now() + 100000,
        storedAt: Date.now(),
      });
      const result = await restoreAuthState("dev1");
      expect(result).toBe(true);
      expect(getAccessToken()).toBe("idb-token");
    });

    it("returns false when no token available", async () => {
      setAccessToken(null);
      vi.mocked(authTokenCacheStore.get).mockResolvedValue(null);
      const result = await restoreAuthState("dev1");
      expect(result).toBe(false);
    });
  });
});
