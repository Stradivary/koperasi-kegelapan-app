import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initDeviceIdFromStorage } from "#/infrastructure/device/initDeviceId";
import { setCurrentDeviceId, getCurrentDeviceId } from "#/infrastructure/api/apiClient";

// Mock the indexeddb module
vi.mock("#/infrastructure/persistence/dexie/indexeddb", () => ({
  tenantContextStore: {
    getAll: vi.fn(),
  },
}));

import { tenantContextStore } from "#/infrastructure/persistence/dexie/indexeddb";

describe("initDeviceIdFromStorage", () => {
  beforeEach(() => {
    // Reset the cached device ID
    setCurrentDeviceId(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets deviceId from the most recently updated tenant context", async () => {
    vi.mocked(tenantContextStore.getAll).mockResolvedValue([
      {
        tenantId: "t1",
        tenantSlug: "slug1",
        tenantName: "Tenant 1",
        deviceId: "device-old",
        accountId: "a1",
        role: "admin",
        terminalId: 0,
        updatedAt: 1000,
      },
      {
        tenantId: "t2",
        tenantSlug: "slug2",
        tenantName: "Tenant 2",
        deviceId: "device-newest",
        accountId: "a2",
        role: "station",
        terminalId: 0,
        updatedAt: 2000,
      },
    ]);

    initDeviceIdFromStorage();

    // Wait for the async operation to complete
    await vi.waitFor(() => {
      expect(getCurrentDeviceId()).toBe("device-newest");
    });
  });

  it("does nothing when no tenant contexts exist", async () => {
    vi.mocked(tenantContextStore.getAll).mockResolvedValue([]);

    initDeviceIdFromStorage();

    // Give the promise time to resolve
    await new Promise((r) => setTimeout(r, 10));
    expect(getCurrentDeviceId()).toBeNull();
  });

  it("silently handles IndexedDB errors", async () => {
    vi.mocked(tenantContextStore.getAll).mockRejectedValue(new Error("IndexedDB unavailable"));

    // Should not throw
    initDeviceIdFromStorage();

    // Give the promise time to reject
    await new Promise((r) => setTimeout(r, 10));
    expect(getCurrentDeviceId()).toBeNull();
  });

  it("sets deviceId from single context", async () => {
    vi.mocked(tenantContextStore.getAll).mockResolvedValue([
      {
        tenantId: "t1",
        tenantSlug: "slug1",
        tenantName: "Tenant 1",
        deviceId: "single-device-id",
        accountId: "a1",
        role: "terminal",
        terminalId: 0,
        updatedAt: 5000,
      },
    ]);

    initDeviceIdFromStorage();

    await vi.waitFor(() => {
      expect(getCurrentDeviceId()).toBe("single-device-id");
    });
  });
});
