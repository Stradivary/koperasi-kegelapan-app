import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetAll = vi.fn();

// Mock the lazy indexeddb module that initDeviceId imports from
vi.mock("#/infrastructure/persistence/dexie/indexeddb.lazy", () => ({
  getTenantContextStore: () => Promise.resolve({ getAll: mockGetAll }),
}));

// Mock the api module for setCurrentDeviceId
const mockSetCurrentDeviceId = vi.fn();
let _currentDeviceId: string | null = null;

vi.mock("#/infrastructure/api/apiClient", () => ({
  setCurrentDeviceId: (id: string | null) => {
    _currentDeviceId = id;
    mockSetCurrentDeviceId(id);
  },
  getCurrentDeviceId: () => _currentDeviceId,
}));

import { initDeviceIdFromStorage } from "#/infrastructure/device/initDeviceId";

describe("initDeviceIdFromStorage", () => {
  beforeEach(() => {
    _currentDeviceId = null;
    mockSetCurrentDeviceId.mockClear();
    mockGetAll.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets deviceId from the most recently updated tenant context", async () => {
    mockGetAll.mockResolvedValue([
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
      expect(_currentDeviceId).toBe("device-newest");
    });
  });

  it("does nothing when no tenant contexts exist", async () => {
    mockGetAll.mockResolvedValue([]);

    initDeviceIdFromStorage();

    // Give the promise time to resolve
    await new Promise((r) => setTimeout(r, 10));
    expect(_currentDeviceId).toBeNull();
  });

  it("silently handles IndexedDB errors", async () => {
    mockGetAll.mockRejectedValue(new Error("IndexedDB unavailable"));

    // Should not throw
    initDeviceIdFromStorage();

    // Give the promise time to reject
    await new Promise((r) => setTimeout(r, 10));
    expect(_currentDeviceId).toBeNull();
  });

  it("sets deviceId from single context", async () => {
    mockGetAll.mockResolvedValue([
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
      expect(_currentDeviceId).toBe("single-device-id");
    });
  });
});
