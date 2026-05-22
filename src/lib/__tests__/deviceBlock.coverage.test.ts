/**
 * Coverage tests for deviceBlock.ts — clearSessionGrantCache paths
 * and scheduleUnblock timer replacement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("#/infrastructure/persistence/dexie/indexeddb", () => ({
  tenantContextStore: {
    getAll: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

import {
  handleDeviceBlocked,
  clearBlockState,
  getDeviceBlockState,
  isDeviceBlocked,
} from "#/infrastructure/api/deviceBlock";

// ---------------------------------------------------------------------------
// Helpers — build a minimal fake IndexedDB
// ---------------------------------------------------------------------------

/**
 * Simulates cursor iteration over cursorEntries, firing onsuccess on the request.
 */
function simulateCursorIteration(
  cursorEntries: Array<{ tenantId: string }>,
  req: Record<string, unknown>,
  cursorIndex: { value: number },
) {
  if (cursorIndex.value < cursorEntries.length) {
    const entry = cursorEntries[cursorIndex.value++];
    const cursor = {
      value: entry,
      delete: vi.fn(),
      continue: vi.fn(() => {
        setTimeout(() => {
          simulateCursorIteration(cursorEntries, req, cursorIndex);
        }, 0);
      }),
    };
    req.result = cursor;
  } else {
    req.result = null;
  }
  if (typeof (req as Record<string, Function>).onsuccess === "function") {
    (req as Record<string, Function>).onsuccess({ target: req });
  }
}

function makeFakeIdb(
  options: {
    hasStore?: boolean;
    storeNames?: string[];
    clearShouldFail?: boolean;
    openShouldFail?: boolean;
    cursorEntries?: Array<{ tenantId: string }>;
  } = {},
) {
  const {
    hasStore = true,
    clearShouldFail: _clearShouldFail = false,
    openShouldFail = false,
    cursorEntries = [],
  } = options;

  const storeNames = options.storeNames ?? (hasStore ? ["sessionGrantCache"] : []);

  const fakeStore = {
    clear: vi.fn(),
    openCursor: vi.fn(),
  };

  const cursorIndex = { value: 0 };
  fakeStore.openCursor.mockImplementation(() => {
    const req: Record<string, unknown> = {};
    setTimeout(() => {
      simulateCursorIteration(cursorEntries, req, cursorIndex);
    }, 0);
    return req;
  });

  const fakeTransaction = {
    objectStore: vi.fn().mockReturnValue(fakeStore),
    oncomplete: null as Function | null,
    onerror: null as Function | null,
  };

  const fakeDb = {
    objectStoreNames: { contains: (name: string) => storeNames.includes(name) },
    transaction: vi.fn().mockReturnValue(fakeTransaction),
    close: vi.fn(),
  };

  // Trigger oncomplete after a tick
  fakeDb.transaction.mockImplementation(() => {
    setTimeout(() => {
      if (fakeTransaction.oncomplete) fakeTransaction.oncomplete();
    }, 10);
    return fakeTransaction;
  });

  const openReq: Record<string, unknown> = {};
  const fakeIdb = {
    open: vi.fn().mockImplementation(() => {
      setTimeout(() => {
        if (openShouldFail) {
          if (typeof (openReq as Record<string, Function>).onerror === "function") {
            (openReq as Record<string, Function>).onerror();
          }
        } else {
          openReq.result = fakeDb;
          if (typeof (openReq as Record<string, Function>).onsuccess === "function") {
            (openReq as Record<string, Function>).onsuccess();
          }
        }
      }, 0);
      return openReq;
    }),
  };

  return { fakeIdb, fakeDb, fakeStore, fakeTransaction };
}

// ---------------------------------------------------------------------------
// clearSessionGrantCache via handleDeviceBlocked
// ---------------------------------------------------------------------------

describe("handleDeviceBlocked — clearSessionGrantCache paths", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearBlockState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    clearBlockState();
  });

  it("resolves cleanly when indexedDB is not available (no global)", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    // Should not throw
    await expect(handleDeviceBlocked(futureTime, "tenant-1")).resolves.toBeUndefined();
    expect(isDeviceBlocked()).toBe(true);
  });

  it("resolves cleanly when idb.open fails", async () => {
    const { fakeIdb } = makeFakeIdb({ openShouldFail: true });
    vi.stubGlobal("indexedDB", fakeIdb);

    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    const promise = handleDeviceBlocked(futureTime, "tenant-1");
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
  });

  it("clears all entries when no tenantId provided (store.clear)", async () => {
    const { fakeIdb, fakeStore } = makeFakeIdb();
    vi.stubGlobal("indexedDB", fakeIdb);

    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    const promise = handleDeviceBlocked(futureTime); // no tenantId
    await vi.runAllTimersAsync();
    await promise;

    expect(fakeStore.clear).toHaveBeenCalled();
  });

  it("uses cursor to delete matching tenant entries when tenantId provided", async () => {
    const { fakeIdb, fakeStore } = makeFakeIdb({
      cursorEntries: [{ tenantId: "tenant-1" }, { tenantId: "tenant-2" }, { tenantId: "tenant-1" }],
    });
    vi.stubGlobal("indexedDB", fakeIdb);

    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    const promise = handleDeviceBlocked(futureTime, "tenant-1");
    await vi.runAllTimersAsync();
    await promise;

    // openCursor should have been called (cursor-based deletion)
    expect(fakeStore.openCursor).toHaveBeenCalled();
  });

  it("resolves cleanly when sessionGrantCache store does not exist", async () => {
    const { fakeIdb } = makeFakeIdb({ hasStore: false });
    vi.stubGlobal("indexedDB", fakeIdb);

    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    const promise = handleDeviceBlocked(futureTime, "tenant-1");
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// scheduleUnblock — timer replacement
// ---------------------------------------------------------------------------

describe("scheduleUnblock — timer replacement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearBlockState();
    vi.stubGlobal("indexedDB", undefined); // avoid IDB side effects
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    clearBlockState();
  });

  it("replaces existing timer when handleDeviceBlocked is called twice", async () => {
    const now = Math.floor(Date.now() / 1000);

    // First block
    await handleDeviceBlocked(now + 60);
    expect(isDeviceBlocked()).toBe(true);

    // Second block — should replace the first timer
    await handleDeviceBlocked(now + 120);
    expect(getDeviceBlockState().blockedUntil).toBe(now + 120);

    // Advance past first timer but not second
    vi.advanceTimersByTime(65_000);
    // Still blocked (second timer hasn't fired)
    expect(isDeviceBlocked()).toBe(true);

    // Advance past second timer
    vi.advanceTimersByTime(60_000);
    expect(getDeviceBlockState().blocked).toBe(false);
  });

  it("clears block immediately when blockedUntil is in the past", async () => {
    const pastTime = Math.floor(Date.now() / 1000) - 5;
    await handleDeviceBlocked(pastTime);
    // isDeviceBlocked checks local clock and clears expired blocks
    expect(isDeviceBlocked()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clearAuthState — tenantContextStore paths
// ---------------------------------------------------------------------------

describe("handleDeviceBlocked — clearAuthState paths", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearBlockState();
    vi.stubGlobal("indexedDB", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    clearBlockState();
  });

  it("deletes specific tenant context when tenantId is provided", async () => {
    const { tenantContextStore } = await import("#/infrastructure/persistence/dexie/indexeddb");
    vi.mocked(tenantContextStore.delete).mockResolvedValue(undefined);

    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    await handleDeviceBlocked(futureTime, "tenant-abc");

    expect(tenantContextStore.delete).toHaveBeenCalledWith("tenant-abc");
  });

  it("clears all tenant contexts when no tenantId is provided", async () => {
    const { tenantContextStore } = await import("#/infrastructure/persistence/dexie/indexeddb");
    vi.mocked(tenantContextStore.getAll).mockResolvedValue([
      { tenantId: "t1" } as never,
      { tenantId: "t2" } as never,
    ]);
    vi.mocked(tenantContextStore.delete).mockResolvedValue(undefined);

    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    await handleDeviceBlocked(futureTime);

    expect(tenantContextStore.getAll).toHaveBeenCalled();
    expect(tenantContextStore.delete).toHaveBeenCalledWith("t1");
    expect(tenantContextStore.delete).toHaveBeenCalledWith("t2");
  });
});
