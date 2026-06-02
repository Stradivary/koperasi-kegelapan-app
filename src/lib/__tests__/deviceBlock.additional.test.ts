/**
 * Additional tests for deviceBlock.ts covering lines 214-215:
 * clearSessionGrantCache when indexedDB is null/unavailable
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleDeviceBlocked, clearBlockState } from "../deviceBlock";

vi.mock("#/infrastructure/persistence/dexie/indexeddb", () => ({
  tenantContextStore: {
    getAll: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("deviceBlock - clearSessionGrantCache when indexedDB unavailable (lines 214-215)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearBlockState();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearBlockState();
  });

  it("does not throw when indexedDB is not available on globalThis", async () => {
    // Remove indexedDB from globalThis to simulate unavailable environment
    const originalIndexedDB = (globalThis as any).indexedDB;
    delete (globalThis as any).indexedDB;

    const blockedUntil = Math.floor(Date.now() / 1000) + 3600;
    // Should not throw even without indexedDB
    await expect(handleDeviceBlocked(blockedUntil, "tenant-1")).resolves.toBeUndefined();

    // Restore
    if (originalIndexedDB !== undefined) {
      (globalThis as any).indexedDB = originalIndexedDB;
    }
  });

  it("handles handleDeviceBlocked without tenantId (clears all contexts)", async () => {
    const blockedUntil = Math.floor(Date.now() / 1000) + 3600;
    await expect(handleDeviceBlocked(blockedUntil)).resolves.toBeUndefined();
  });
});
