import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  notifyCheckin,
  verifyCheckinSynced,
  forcePushBeforeRead,
  setActiveTenantId,
  registerTriggerSync,
  peerSyncCoordinator,
} from "#/infrastructure/sync/peerSyncCoordinator";
import type { TransactionLog } from "#/infrastructure/persistence/dexie/localDb";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("#/infrastructure/persistence/dexie/localDb", () => {
  const mockWhere = vi.fn();
  const mockBetween = vi.fn();
  const mockFilter = vi.fn();
  const mockToArray = vi.fn();

  return {
    localDb: {
      transactionLog: {
        where: mockWhere.mockReturnValue({
          between: mockBetween.mockReturnValue({
            filter: mockFilter.mockReturnValue({
              toArray: mockToArray.mockResolvedValue([]),
            }),
          }),
        }),
      },
    },
  };
});

vi.mock("../syncPush", () => ({
  syncPush: vi.fn().mockResolvedValue({
    totalAccepted: 0,
    totalRejected: 0,
    pullNeeded: false,
    conflictCount: 0,
    failedCount: 0,
  }),
}));

import { localDb } from "#/infrastructure/persistence/dexie/localDb";
import { syncPush } from "../syncPush";

// ── Helpers ────────────────────────────────────────────────────────────

function makeCheckinEntry(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    id: 1,
    tenantId: "t-1",
    cardId: "aabbccddee01",
    userId: null,
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

// ── Setup ──────────────────────────────────────────────────────────────

describe("PeerSyncCoordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActiveTenantId("t-1");
    registerTriggerSync(null);

    // Reset navigator.onLine
    Object.defineProperty(navigator, "onLine", { value: true, writable: true });
  });

  afterEach(() => {
    registerTriggerSync(null);
    setActiveTenantId(null);
  });

  // ── notifyCheckin ──────────────────────────────────────────────────

  describe("notifyCheckin", () => {
    it("should call triggerSync callback when registered", () => {
      const mockTrigger = vi.fn();
      registerTriggerSync(mockTrigger);

      notifyCheckin("aabbccddee01", Date.now());

      expect(mockTrigger).toHaveBeenCalledTimes(1);
    });

    it("should call syncPush directly when no triggerSync callback registered", () => {
      notifyCheckin("aabbccddee01", Date.now());

      expect(syncPush).toHaveBeenCalledWith("t-1");
    });

    it("should not throw when syncPush fails (non-blocking)", async () => {
      vi.mocked(syncPush).mockRejectedValueOnce(new Error("Network error"));

      // Should not throw
      expect(() => notifyCheckin("aabbccddee01", Date.now())).not.toThrow();
    });

    it("should not call syncPush when no tenant is set and no callback", () => {
      setActiveTenantId(null);
      registerTriggerSync(null);

      notifyCheckin("aabbccddee01", Date.now());

      expect(syncPush).not.toHaveBeenCalled();
    });
  });

  // ── verifyCheckinSynced ────────────────────────────────────────────

  describe("verifyCheckinSynced", () => {
    it("should return synced=true when no pending check-ins exist", async () => {
      // Default mock returns empty array (no pending)
      const result = await verifyCheckinSynced("aabbccddee01");

      expect(result.lastCheckinSynced).toBe(true);
      expect(result.shouldWaitForSync).toBe(false);
    });

    it("should return synced=false when pending check-ins exist", async () => {
      const pendingEntry = makeCheckinEntry({ syncStatus: "pending" });

      // First call (pending check) returns entries
      const mockFilter = vi
        .fn()
        .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([pendingEntry]) });
      const mockBetween = vi.fn().mockReturnValue({ filter: mockFilter });
      const mockWhere = vi.fn().mockReturnValue({ between: mockBetween });
      (localDb.transactionLog as any).where = mockWhere;

      const result = await verifyCheckinSynced("aabbccddee01");

      expect(result.lastCheckinSynced).toBe(false);
      expect(result.lastSyncConfirmedAt).toBeNull();
      expect(result.shouldWaitForSync).toBe(false);
    });

    it("should NEVER set shouldWaitForSync to true (NFC is authoritative)", async () => {
      const pendingEntry = makeCheckinEntry({ syncStatus: "pending" });

      const mockFilter = vi
        .fn()
        .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([pendingEntry]) });
      const mockBetween = vi.fn().mockReturnValue({ filter: mockFilter });
      const mockWhere = vi.fn().mockReturnValue({ between: mockBetween });
      (localDb.transactionLog as any).where = mockWhere;

      const result = await verifyCheckinSynced("aabbccddee01");

      expect(result.shouldWaitForSync).toBe(false);
    });

    it("should return safe defaults when no tenant is set", async () => {
      setActiveTenantId(null);

      const result = await verifyCheckinSynced("aabbccddee01");

      expect(result.lastCheckinSynced).toBe(false);
      expect(result.lastSyncConfirmedAt).toBeNull();
      expect(result.shouldWaitForSync).toBe(false);
    });

    it("should return safe defaults on IndexedDB error", async () => {
      const mockFilter = vi
        .fn()
        .mockReturnValueOnce({ toArray: vi.fn().mockRejectedValue(new Error("DB error")) });
      const mockBetween = vi.fn().mockReturnValue({ filter: mockFilter });
      const mockWhere = vi.fn().mockReturnValue({ between: mockBetween });
      (localDb.transactionLog as any).where = mockWhere;

      const result = await verifyCheckinSynced("aabbccddee01");

      expect(result.lastCheckinSynced).toBe(false);
      expect(result.shouldWaitForSync).toBe(false);
    });
  });

  // ── forcePushBeforeRead ────────────────────────────────────────────

  describe("forcePushBeforeRead", () => {
    it("should call syncPush when pending entries exist", async () => {
      const pendingEntry = makeCheckinEntry({ syncStatus: "pending" });

      const mockFilter = vi
        .fn()
        .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([pendingEntry]) });
      const mockBetween = vi.fn().mockReturnValue({ filter: mockFilter });
      const mockWhere = vi.fn().mockReturnValue({ between: mockBetween });
      (localDb.transactionLog as any).where = mockWhere;

      const result = await forcePushBeforeRead("aabbccddee01");

      expect(result).toBe(true);
      expect(syncPush).toHaveBeenCalledWith("t-1");
    });

    it("should return true when no tenant is set", async () => {
      setActiveTenantId(null);

      const result = await forcePushBeforeRead("aabbccddee01");

      expect(result).toBe(true);
    });
  });

  // ── Interface compliance ───────────────────────────────────────────

  describe("peerSyncCoordinator interface", () => {
    it("should expose all required methods", () => {
      expect(peerSyncCoordinator.notifyCheckin).toBeDefined();
      expect(peerSyncCoordinator.verifyCheckinSynced).toBeDefined();
      expect(peerSyncCoordinator.forcePushBeforeRead).toBeDefined();
    });

    it("should have correct function signatures", () => {
      expect(typeof peerSyncCoordinator.notifyCheckin).toBe("function");
      expect(typeof peerSyncCoordinator.verifyCheckinSynced).toBe("function");
      expect(typeof peerSyncCoordinator.forcePushBeforeRead).toBe("function");
    });
  });
});
