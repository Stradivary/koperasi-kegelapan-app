// @vitest-environment jsdom
/**
 * Bug Condition Exploration Test - Blocked Card Status Not Displayed Across Views
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 *
 * This test encodes the EXPECTED behavior: when a card is blocked in the local DB,
 * the blocked status UI should be shown regardless of card wallet state.
 *
 * On UNFIXED code, these tests are EXPECTED TO FAIL — failure confirms the bug exists.
 * After the fix is implemented, these tests should PASS.
 *
 * Counterexamples documented:
 * - Terminal IDLE: `blockedReason` never set because effect returns early before `checkLocalBlockedStatus` is called
 * - Terminal CHECKED_OUT: same early return issue
 * - Gate CHECKED_IN: `blockedReason` set too late due to async race, render shows "Sudah Check-in" first
 * - Scout: no call to `checkLocalBlockedStatus` exists at all
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { createElement } from "react";
import { CardState, CardStatus } from "../../../core/payload/types";
import type { CardPayload, SessionGrant } from "../../../core/payload/types";
import type { NfcCardState } from "../../../hooks/useNfcCard";

// ── Mocks ──────────────────────────────────────────────────────────────

// Mock checkLocalBlockedStatus to return blocked
vi.mock("../../../core/nfc/localStatusCheck", () => ({
  checkLocalBlockedStatus: vi.fn().mockResolvedValue({
    blocked: true,
    reason: "Kartu diblokir oleh admin",
    notInLocalDb: false,
  }),
}));

// Mock useSessionGrant to return a valid grant
vi.mock("../../../hooks/useSessionGrant", () => ({
  useSessionGrant: vi.fn().mockReturnValue({
    grant: {
      keyVersion: 1,
      sessionKey: new Uint8Array(32),
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      allowedOps: ["checkin", "checkout"],
      signature: new Uint8Array(64),
      tenantId: "test-tenant",
      accountId: "test-account",
      deviceId: "test-device",
    } satisfies SessionGrant,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

// Mock useNfcCard - will be configured per test
const mockScan = vi.fn();
const mockWrite = vi.fn().mockResolvedValue(true);
const mockReset = vi.fn();
const mockCancel = vi.fn();

vi.mock("../../../hooks/useNfcCard", () => ({
  useNfcCard: vi.fn(),
}));

// Mock SyncEngineContext
vi.mock("../../../hooks/SyncEngineContext", () => ({
  useSyncEngineContext: vi.fn().mockReturnValue(null),
}));

// Mock useReconciliation (used by TerminalSection)
vi.mock("../../../hooks/useReconciliation", () => ({
  useReconciliation: vi.fn().mockReturnValue({
    status: "idle",
    error: null,
    lastSyncedAt: null,
    pendingCount: 0,
    sync: vi.fn(),
    checkPending: vi.fn(),
  }),
}));

// Mock peerSyncCoordinator (used by GateSection)
vi.mock("../../../lib/peerSyncCoordinator", () => ({
  notifyCheckin: vi.fn(),
}));

// Mock state machine engine (used by Terminal and Gate)
vi.mock("../../../core/state-machine/engine", () => ({
  validateTransition: vi.fn().mockReturnValue({ valid: true }),
  applyCheckin: vi.fn().mockImplementation((payload) => payload),
  applyCheckout: vi.fn().mockImplementation((payload) => payload),
  PARKING_RATE_PER_HOUR: 2000,
}));

// Mock reconciliationOutbox and indexeddb
vi.mock("../../../lib/indexeddb", () => ({
  reconciliationOutbox: {
    add: vi.fn().mockResolvedValue(undefined),
    getPending: vi.fn().mockResolvedValue([]),
    markSynced: vi.fn().mockResolvedValue(undefined),
  },
  makeIdempotencyKey: vi.fn().mockReturnValue("test-key"),
  sessionGrantCacheStore: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock transactionLogService
vi.mock("../../../lib/transactionLogService", () => ({
  recordTransaction: vi.fn().mockResolvedValue(undefined),
}));

import { useNfcCard } from "../../../hooks/useNfcCard";

const mockUseNfcCard = vi.mocked(useNfcCard);

// ── Helpers ────────────────────────────────────────────────────────────

function makePayload(overrides: {
  cardState?: number;
  cardStatus?: number;
  name?: string;
  balance?: number;
}): CardPayload {
  return {
    header: {
      magic: 0x4b4f5057,
      version: 3,
      type: 0,
      cardId: new Uint8Array([0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6]),
      tenantBind: 0,
    },
    identity: {
      name: overrides.name ?? "Test User",
      userId: "GJWt7u3g",
      gender: 0,
      status: overrides.cardStatus ?? CardStatus.ACTIVE,
      createdAt: 1700000000,
    },
    wallet: {
      balance: overrides.balance ?? 500000,
      lastBalance: 500000,
      counter: 10n,
      lastTimestamp: 1700000000,
      state: overrides.cardState ?? CardState.IDLE,
      flags: 0,
    },
    session: {
      startTime: 1700000000,
      endTime: 0,
      terminalId: 42,
    },
    logEntries: [],
    trailer: {
      expiresAt: 1800000000,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 10,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  };
}

function setupNfcState(state: NfcCardState) {
  mockUseNfcCard.mockReturnValue({
    state,
    scan: mockScan,
    write: mockWrite,
    reset: mockReset,
    cancel: mockCancel,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("Bug Condition: Blocked Card Status Not Displayed Across Views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("Terminal View - Blocked card with IDLE state", () => {
    it("should show blocked UI instead of 'Belum Check-in' when card is blocked and state is IDLE", async () => {
      // Setup: card is in IDLE state, blocked in local DB
      setupNfcState({
        phase: "ready",
        payload: makePayload({ cardState: CardState.IDLE }),
        serialNumber: "a1:b2:c3:d4",
        error: null,
        tamperDetected: false,
        warning: null,
      });

      const { TerminalSection } = await import("../TerminalSection");

      await act(async () => {
        render(
          createElement(TerminalSection, {
            tenantId: "test-tenant",
            tenantName: "Test Koperasi",
            accountId: "test-account",
            deviceId: "test-device",
            terminalId: 1,
          }),
        );
      });

      // Allow microtasks (Promise.resolve from checkLocalBlockedStatus mock) to flush
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // EXPECTED: blocked UI should be shown (contains "diblokir" or "Ditolak")
      const blockedText =
        screen.queryByText(/Kartu diblokir/i) ??
        screen.queryByText(/Checkout Ditolak/i) ??
        screen.queryByText(/Akses Ditolak/i) ??
        screen.queryByText(/diblokir/i);
      expect(
        blockedText,
        "Bug: Terminal IDLE - blocked card shows 'Belum Check-in' instead of blocked UI because effect returns early before checkLocalBlockedStatus is called",
      ).not.toBeNull();

      // EXPECTED: "Belum Check-in" should NOT be shown
      expect(screen.queryByText(/Belum Check-in/i)).toBeNull();
    });
  });

  describe("Terminal View - Blocked card with CHECKED_OUT state", () => {
    it("should show blocked UI instead of 'Sudah Checkout' when card is blocked and state is CHECKED_OUT", async () => {
      // Setup: card is in CHECKED_OUT state, blocked in local DB
      setupNfcState({
        phase: "ready",
        payload: makePayload({ cardState: CardState.CHECKED_OUT }),
        serialNumber: "a1:b2:c3:d4",
        error: null,
        tamperDetected: false,
        warning: null,
      });

      const { TerminalSection } = await import("../TerminalSection");

      await act(async () => {
        render(
          createElement(TerminalSection, {
            tenantId: "test-tenant",
            tenantName: "Test Koperasi",
            accountId: "test-account",
            deviceId: "test-device",
            terminalId: 1,
          }),
        );
      });

      // Allow microtasks to flush
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // EXPECTED: blocked UI should be shown
      const blockedText =
        screen.queryByText(/Kartu diblokir/i) ??
        screen.queryByText(/Checkout Ditolak/i) ??
        screen.queryByText(/Akses Ditolak/i) ??
        screen.queryByText(/diblokir/i);
      expect(
        blockedText,
        "Bug: Terminal CHECKED_OUT - blocked card shows 'Sudah Checkout' instead of blocked UI because effect returns early before checkLocalBlockedStatus is called",
      ).not.toBeNull();

      // EXPECTED: "Sudah Checkout" should NOT be shown
      expect(screen.queryByText(/Sudah Checkout/i)).toBeNull();
    });
  });

  describe("Gate View - Blocked card with CHECKED_IN state", () => {
    it("should show blocked UI instead of 'Sudah Check-in' when card is blocked and state is CHECKED_IN", async () => {
      // Setup: card is in CHECKED_IN state, on-card status is ACTIVE, blocked in local DB
      setupNfcState({
        phase: "ready",
        payload: makePayload({
          cardState: CardState.CHECKED_IN,
          cardStatus: CardStatus.ACTIVE,
        }),
        serialNumber: "d4:e5:f6:a1",
        error: null,
        tamperDetected: false,
        warning: null,
      });

      const { GateSection } = await import("../GateSection");

      await act(async () => {
        render(
          createElement(GateSection, {
            tenantId: "test-tenant",
            tenantName: "Test Koperasi",
            accountId: "test-account",
            deviceId: "test-device",
            terminalId: 1,
          }),
        );
      });

      // Allow microtasks to flush (checkLocalBlockedStatus is async)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // EXPECTED: blocked UI should be shown ("Akses Ditolak" with blocked reason)
      const blockedText =
        screen.queryByText(/Akses Ditolak/i) ??
        screen.queryByText(/Kartu diblokir/i) ??
        screen.queryByText(/diblokir/i);
      expect(
        blockedText,
        "Bug: Gate CHECKED_IN - blocked card shows 'Sudah Check-in' instead of blocked UI due to async race condition where blockedReason is set too late",
      ).not.toBeNull();

      // EXPECTED: "Sudah Check-in" should NOT be shown
      expect(screen.queryByText(/Sudah Check-in/i)).toBeNull();
    });
  });

  describe("Scout View - Blocked card with ACTIVE on-card status", () => {
    it("should show 'Blocked' badge instead of 'Active' when card is blocked in local DB", async () => {
      // Setup: card has ACTIVE on-card status, but is blocked in local DB
      setupNfcState({
        phase: "ready",
        payload: makePayload({
          cardState: CardState.IDLE,
          cardStatus: CardStatus.ACTIVE,
        }),
        serialNumber: "g7:h8:i9:j0",
        error: null,
        tamperDetected: false,
        warning: null,
      });

      const { ScoutSection } = await import("../ScoutSection");

      await act(async () => {
        render(
          createElement(ScoutSection, {
            tenantId: "test-tenant",
            tenantName: "Test Koperasi",
            accountId: "test-account",
            deviceId: "test-device",
            terminalId: 1,
          }),
        );
      });

      // Allow microtasks to flush
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // EXPECTED: "Blocked" badge should be shown (from local DB override)
      const blockedBadge = screen.queryByText(/Blocked/i) ?? screen.queryByText(/diblokir/i);
      expect(
        blockedBadge,
        "Bug: Scout - no call to checkLocalBlockedStatus exists, so blocked card with ACTIVE on-card status always shows 'Active' badge",
      ).not.toBeNull();

      // EXPECTED: "Active" badge should NOT be shown when card is blocked
      expect(screen.queryByText("Active")).toBeNull();
    });
  });
});
