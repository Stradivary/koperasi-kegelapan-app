/**
 * Additional tests for peerSyncCoordinator.ts covering uncovered lines:
 * - Line 121: forcePushBeforeRead returns false when offline
 * - Line 135: forcePushBeforeRead returns true when no pending entries
 * - Lines 185,193,197: verifyCheckinSynced with synced check-ins
 * - Line 211: forcePushBeforeRead timeout/failure path
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  forcePushBeforeRead,
  verifyCheckinSynced,
  setActiveTenantId,
  registerTriggerSync,
} from "../peerSyncCoordinator";
import type { TransactionLog } from "#/db/local-db";

vi.mock("#/db/local-db", () => {
  const mockWhere = vi.fn();
  return {
    localDb: {
      transactionLog: {
        where: mockWhere.mockReturnValue({
          between: vi.fn().mockReturnValue({
            filter: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      },
    },
  };
});

vi.mock("../syncPush", () => ({
  syncPush: vi.fn().mockResolvedValue(undefined),
}));

import { localDb } from "#/db/local-db";
import { syncPush } from "../syncPush";

function makeEntry(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    id: 1,
    tenantId: "t-1",
    cardId: "aabbccddee01",
    userId: null,
    cardName: null,
    counter: 1,
    type: "checkin",
    amount: 0,
    balanceAfter: 1000,
    timestamp: 1700000000,
    hash: "abcdef123456",
    terminalId: null,
    deviceId: "device-1",
    syncStatus: "pending",
    syncedAt: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("peerSyncCoordinator additional coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActiveTenantId("t-1");
    registerTriggerSync(null);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true, writable: true });
  });

  afterEach(() => {
    setActiveTenantId(null);
    registerTriggerSync(null);
  });

  describe("forcePushBeforeRead — offline path (line 121)", () => {
    it("returns false when navigator is offline", async () => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

      const result = await forcePushBeforeRead("aabbccddee01");
      expect(result).toBe(false);
    });
  });

  describe("forcePushBeforeRead — no pending entries (line 135)", () => {
    it("returns true when no pending entries exist", async () => {
      // Default mock returns empty array
      const result = await forcePushBeforeRead("aabbccddee01");
      expect(result).toBe(true);
      expect(syncPush).not.toHaveBeenCalled();
    });
  });

  describe("forcePushBeforeRead — push failure (line 211)", () => {
    it("returns false when syncPush throws", async () => {
      vi.mocked(syncPush).mockRejectedValueOnce(new Error("Network error"));

      const pendingEntry = makeEntry({ syncStatus: "pending" });
      const mockFilter = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([pendingEntry]),
      });
      const mockBetween = vi.fn().mockReturnValue({ filter: mockFilter });
      const mockWhere = vi.fn().mockReturnValue({ between: mockBetween });
      (localDb.transactionLog as any).where = mockWhere;

      const result = await forcePushBeforeRead("aabbccddee01");
      expect(result).toBe(false);
    });

    it("returns false when syncPush times out", async () => {
      // Make syncPush hang forever
      vi.mocked(syncPush).mockImplementation(() => new Promise<never>(() => {}));

      const pendingEntry = makeEntry({ syncStatus: "pending" });
      const mockFilter = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([pendingEntry]),
      });
      const mockBetween = vi.fn().mockReturnValue({ filter: mockFilter });
      const mockWhere = vi.fn().mockReturnValue({ between: mockBetween });
      (localDb.transactionLog as any).where = mockWhere;

      // Use real timers but with a very short timeout by mocking setTimeout
      // The FORCE_PUSH_TIMEOUT_MS is 3000ms — we simulate the timeout rejection
      const origSetTimeout = globalThis.setTimeout;
      vi.spyOn(globalThis, "setTimeout").mockImplementation(
        (fn: TimerHandler, delay?: number, ...args: unknown[]): ReturnType<typeof setTimeout> => {
          if (delay === 3000) {
            return origSetTimeout(() => {
              if (typeof fn === "function") fn(...args);
            }, 0) as unknown as ReturnType<typeof setTimeout>;
          }
          return origSetTimeout(fn as TimerHandler, delay, ...args) as unknown as ReturnType<
            typeof setTimeout
          >;
        },
      );

      const result = await forcePushBeforeRead("aabbccddee01");
      expect(result).toBe(false);

      vi.restoreAllMocks();
    }, 10000);
  });

  describe("verifyCheckinSynced — synced check-ins path (lines 185,193,197)", () => {
    it("returns lastSyncConfirmedAt from most recent synced check-in", async () => {
      const syncedEntry = makeEntry({
        syncStatus: "synced",
        syncedAt: 1700001000,
        timestamp: 1700000000,
      });

      // First call (pending check) returns empty, second call (synced check) returns entry
      let callCount = 0;
      const mockFilter = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // pending check — no pending entries
          return { toArray: vi.fn().mockResolvedValue([]) };
        }
        // synced check — return synced entry
        return { toArray: vi.fn().mockResolvedValue([syncedEntry]) };
      });
      const mockBetween = vi.fn().mockReturnValue({ filter: mockFilter });
      const mockWhere = vi.fn().mockReturnValue({ between: mockBetween });
      (localDb.transactionLog as any).where = mockWhere;

      const result = await verifyCheckinSynced("aabbccddee01");

      expect(result.lastCheckinSynced).toBe(true);
      expect(result.lastSyncConfirmedAt).toBe(1700001000);
    });

    it("returns null lastSyncConfirmedAt when no synced check-ins exist", async () => {
      // Both calls return empty arrays
      const mockFilter = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      });
      const mockBetween = vi.fn().mockReturnValue({ filter: mockFilter });
      const mockWhere = vi.fn().mockReturnValue({ between: mockBetween });
      (localDb.transactionLog as any).where = mockWhere;

      const result = await verifyCheckinSynced("aabbccddee01");

      expect(result.lastCheckinSynced).toBe(true);
      expect(result.lastSyncConfirmedAt).toBeNull();
    });

    it("picks the most recent synced check-in when multiple exist", async () => {
      const entries = [
        makeEntry({ syncStatus: "synced", syncedAt: 1700001000, timestamp: 1700000000 }),
        makeEntry({
          syncStatus: "synced",
          syncedAt: 1700005000,
          timestamp: 1700004000,
          counter: 2,
        }),
        makeEntry({
          syncStatus: "synced",
          syncedAt: 1700003000,
          timestamp: 1700002000,
          counter: 3,
        }),
      ];

      let callCount = 0;
      const mockFilter = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { toArray: vi.fn().mockResolvedValue([]) };
        return { toArray: vi.fn().mockResolvedValue(entries) };
      });
      const mockBetween = vi.fn().mockReturnValue({ filter: mockFilter });
      const mockWhere = vi.fn().mockReturnValue({ between: mockBetween });
      (localDb.transactionLog as any).where = mockWhere;

      const result = await verifyCheckinSynced("aabbccddee01");

      // Should pick the one with highest timestamp (1700004000)
      expect(result.lastSyncConfirmedAt).toBe(1700005000);
    });
  });
});
