import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, DeviceBlockedError } from "#/infrastructure/api/apiClient";
import { handleDeviceBlocked, clearBlockState } from "#/infrastructure/api/deviceBlock";

// Mock the indexeddb module
vi.mock("#/infrastructure/persistence/dexie/indexeddb", () => ({
  tenantContextStore: {
    getAll: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("apiFetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearBlockState();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("passes through normal responses", async () => {
    const mockResponse = new Response(JSON.stringify({ data: "ok" }), { status: 200 });
    vi.mocked(fetch).mockResolvedValue(mockResponse);

    const result = await apiFetch("https://api.example.com/test");
    expect(result.status).toBe(200);
  });

  it("throws DeviceBlockedError when device is already blocked", async () => {
    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    await handleDeviceBlocked(futureTime);

    await expect(apiFetch("https://api.example.com/test")).rejects.toThrow(DeviceBlockedError);
    // fetch should not have been called
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws DeviceBlockedError when server returns 403 device_blocked", async () => {
    const blockedUntil = Math.floor(Date.now() / 1000) + 3600;
    const mockResponse = new Response(JSON.stringify({ error: "device_blocked", blockedUntil }), {
      status: 403,
    });
    vi.mocked(fetch).mockResolvedValue(mockResponse);

    await expect(apiFetch("https://api.example.com/test", undefined, "tenant-1")).rejects.toThrow(
      DeviceBlockedError,
    );
  });

  it("passes through non-device-blocked 403 responses", async () => {
    const mockResponse = new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    vi.mocked(fetch).mockResolvedValue(mockResponse);

    const result = await apiFetch("https://api.example.com/test");
    expect(result.status).toBe(403);
  });

  it("DeviceBlockedError has isDeviceBlocked property", async () => {
    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    await handleDeviceBlocked(futureTime);

    try {
      await apiFetch("https://api.example.com/test");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(DeviceBlockedError);
      expect((e as DeviceBlockedError).isDeviceBlocked).toBe(true);
    }
  });
});
