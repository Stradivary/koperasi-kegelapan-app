/**
 * Additional tests for api.ts covering line 206:
 * restoreAuthState when IndexedDB throws
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../deviceBlock", () => ({
  isDeviceBlocked: vi.fn().mockReturnValue(false),
  checkDeviceBlockResponse: vi.fn().mockResolvedValue(false),
}));

vi.mock("../indexeddb", () => ({
  authTokenCacheStore: {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockRejectedValue(new Error("IndexedDB unavailable")),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.stubEnv("VITE_API_BASE_URL", "https://test-api.example.com");

import { setAccessToken, restoreAuthState } from "../api";

describe("restoreAuthState - IndexedDB throws (line 206)", () => {
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
    setAccessToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when IndexedDB throws and no localStorage token", async () => {
    // No token in localStorage, IndexedDB throws
    const result = await restoreAuthState("dev1");
    expect(result).toBe(false);
  });
});
