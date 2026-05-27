/**
 * Tests for src/lib/indexeddb.ts — store operations
 *
 * We mock the IDBFactory to avoid real IndexedDB in Node.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Tests for makeIdempotencyKey (pure function, no IDB needed) ───────────────

describe("makeIdempotencyKey", () => {
  it("formats key as tenantId:cardIdHex:counter", async () => {
    const { makeIdempotencyKey } = await import("../indexeddb");
    expect(makeIdempotencyKey("t-1", "abcdef", 42)).toBe("t-1:abcdef:42");
  });

  it("handles zero counter", async () => {
    const { makeIdempotencyKey } = await import("../indexeddb");
    expect(makeIdempotencyKey("tenant", "ff00", 0)).toBe("tenant:ff00:0");
  });
});

// ── Tests for store operations when IndexedDB is unavailable ─────────────────

describe("stores — IndexedDB unavailable", () => {
  let origIndexedDB: IDBFactory | undefined;

  beforeEach(() => {
    origIndexedDB = (globalThis as Record<string, unknown>).indexedDB as IDBFactory | undefined;
    // Remove indexedDB from globalThis to simulate unavailability
    delete (globalThis as Record<string, unknown>).indexedDB;
  });

  afterEach(() => {
    if (origIndexedDB !== undefined) {
      (globalThis as Record<string, unknown>).indexedDB = origIndexedDB;
    }
  });

  it("tenantContextStore.get returns undefined when IndexedDB unavailable", async () => {
    // Re-import to pick up the missing indexedDB
    vi.resetModules();
    const { tenantContextStore } = await import("../indexeddb");
    const result = await tenantContextStore.get("t-1");
    expect(result).toBeUndefined();
  });

  it("tenantContextStore.getAll returns empty array when IndexedDB unavailable", async () => {
    vi.resetModules();
    const { tenantContextStore } = await import("../indexeddb");
    const result = await tenantContextStore.getAll();
    expect(result).toEqual([]);
  });

  it("writeJournalStore.get returns undefined when IndexedDB unavailable", async () => {
    vi.resetModules();
    const { writeJournalStore } = await import("../indexeddb");
    const result = await writeJournalStore.get("t-1", "abc");
    expect(result).toBeUndefined();
  });

  it("writeJournalStore.getAll returns empty array when IndexedDB unavailable", async () => {
    vi.resetModules();
    const { writeJournalStore } = await import("../indexeddb");
    const result = await writeJournalStore.getAll();
    expect(result).toEqual([]);
  });

  it("sessionGrantCacheStore.get returns undefined when IndexedDB unavailable", async () => {
    vi.resetModules();
    const { sessionGrantCacheStore } = await import("../indexeddb");
    const result = await sessionGrantCacheStore.get("t-1", "a-1", "d-1");
    expect(result).toBeUndefined();
  });

  it("authTokenCacheStore.get returns undefined when IndexedDB unavailable", async () => {
    vi.resetModules();
    const { authTokenCacheStore } = await import("../indexeddb");
    const result = await authTokenCacheStore.get("device-1");
    expect(result).toBeUndefined();
  });

  it("authTokenCacheStore.clear is a no-op when IndexedDB unavailable", async () => {
    vi.resetModules();
    const { authTokenCacheStore } = await import("../indexeddb");
    await expect(authTokenCacheStore.clear()).resolves.toBeUndefined();
  });

  it("reconciliationOutbox.getPending returns empty array when IndexedDB unavailable", async () => {
    vi.resetModules();
    const { reconciliationOutbox } = await import("../indexeddb");
    const result = await reconciliationOutbox.getPending("t-1");
    expect(result).toEqual([]);
  });

  it("policyCacheStore.get returns undefined when IndexedDB unavailable", async () => {
    vi.resetModules();
    const { policyCacheStore } = await import("../indexeddb");
    const result = await policyCacheStore.get("t-1");
    expect(result).toBeUndefined();
  });
});

// ── Tests for openDb error handling ──────────────────────────────────────────

describe("openDb — error handling", () => {
  it("rejects when IDBFactory.open fails", async () => {
    vi.resetModules();

    const mockReq = {
      result: null,
      error: new DOMException("Open failed"),
      onsuccess: null as ((e: Event) => void) | null,
      onerror: null as ((e: Event) => void) | null,
      onblocked: null as ((e: Event) => void) | null,
      onupgradeneeded: null as ((e: IDBVersionChangeEvent) => void) | null,
    };

    const mockIdb = {
      open: vi.fn().mockReturnValue(mockReq),
    };

    (globalThis as Record<string, unknown>).indexedDB = mockIdb;

    const { tenantContextStore } = await import("../indexeddb");

    // Trigger the error asynchronously
    const promise = tenantContextStore.put({
      tenantId: "t-1",
      tenantSlug: "slug",
      tenantName: "Name",
      deviceId: "d-1",
      accountId: "a-1",
      role: "admin",
      terminalId: 0,
      updatedAt: Date.now(),
    });

    // Fire the onerror handler
    if (mockReq.onerror) {
      mockReq.onerror(new Event("error"));
    }

    await expect(promise).rejects.toThrow();
  });
});
