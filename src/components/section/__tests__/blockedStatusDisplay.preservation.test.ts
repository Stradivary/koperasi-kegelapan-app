// @vitest-environment jsdom
/**
 * Preservation Property Tests - Non-Blocked Card Behavior Unchanged
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 *
 * These tests capture the baseline behavior of the UNFIXED code for non-blocked cards.
 * They must PASS on unfixed code, confirming the behavior we need to preserve after the fix.
 *
 * Observations on unfixed code:
 * - Terminal: non-blocked IDLE → "Belum Check-in"
 * - Terminal: non-blocked CHECKED_OUT → "Sudah Checkout"
 * - Terminal: non-blocked CHECKED_IN → auto-checkout proceeds (calls performOvertimeCheckout)
 * - Gate: non-blocked IDLE → auto-checkin proceeds (calls write with checkin payload)
 * - Gate: non-blocked CHECKED_IN → "Sudah Check-in"
 * - Scout: non-blocked ACTIVE → "Active" badge with member info
 * - Gate: on-card blocked (BLOCKED_TAMPER, BLOCKED_ADMIN) → on-card blocked reason shown
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { createElement } from "react";
import { CardState, CardStatus } from "../../../core/payload/types";
import type { CardPayload, SessionGrant } from "../../../core/payload/types";
import type { NfcCardState } from "../../../hooks/useNfcCard";

// ── Mocks ──────────────────────────────────────────────────────────────

// Mock checkLocalBlockedStatus to return NOT blocked (preservation scenario)
vi.mock("../../../core/nfc/localStatusCheck", () => ({
  checkLocalBlockedStatus: vi.fn().mockResolvedValue({
    blocked: false,
    reason: null,
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
}));

// Mock overtimeCheckout (used by TerminalSection)
vi.mock("../../../core/nfc/overtimeCheckout", () => ({
  performOvertimeCheckout: vi.fn().mockResolvedValue({
    success: true,
    durationSeconds: 3600,
    fee: 5000,
    updatedPayload: null,
    operationType: "checkout",
  }),
  DEFAULT_OVERTIME_TARIFF_RATE: 5000,
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
import { performOvertimeCheckout } from "../../../core/nfc/overtimeCheckout";
import { applyCheckin } from "../../../core/state-machine/engine";

const mockUseNfcCard = vi.mocked(useNfcCard);
const mockPerformOvertimeCheckout = vi.mocked(performOvertimeCheckout);
const mockApplyCheckin = vi.mocked(applyCheckin);

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

describe("Preservation: Non-Blocked Card Behavior Unchanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset performOvertimeCheckout mock to default success
    mockPerformOvertimeCheckout.mockResolvedValue({
      success: true,
      durationSeconds: 3600,
      fee: 5000,
      updatedPayload: undefined,
      operationType: "checkout",
      overtime: false,
      action: "NORMAL_CHECKOUT",
    });
  });

  afterEach(() => {
    cleanup();
  });

  // ── Terminal Preservation ──────────────────────────────────────────────

  describe("Terminal View - Non-blocked card preservation", () => {
    it("Req 3.1: non-blocked card in IDLE state shows 'Belum Check-in'", async () => {
      // Observation: Terminal with active card in IDLE state shows "Belum Check-in" on unfixed code
      setupNfcState({
        phase: "ready",
        payload: makePayload({ cardState: CardState.IDLE, cardStatus: CardStatus.ACTIVE }),
        serialNumber: "a1:b2:c3:d4",
        error: null,
        tamperDetected: false,
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

      // PRESERVED: "Belum Check-in" message is shown for non-blocked IDLE card
      expect(screen.queryByText(/Belum Check-in/i)).not.toBeNull();
      // No blocked UI should appear
      expect(screen.queryByText(/Checkout Ditolak/i)).toBeNull();
      expect(screen.queryByText(/diblokir/i)).toBeNull();
    });

    it("Req 3.1: non-blocked card in CHECKED_OUT state shows 'Sudah Checkout'", async () => {
      // Observation: Terminal with active card in CHECKED_OUT state shows "Sudah Checkout" on unfixed code
      setupNfcState({
        phase: "ready",
        payload: makePayload({ cardState: CardState.CHECKED_OUT, cardStatus: CardStatus.ACTIVE }),
        serialNumber: "a1:b2:c3:d4",
        error: null,
        tamperDetected: false,
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

      // PRESERVED: "Sudah Checkout" message is shown for non-blocked CHECKED_OUT card
      expect(screen.queryByText(/Sudah Checkout/i)).not.toBeNull();
      // No blocked UI should appear
      expect(screen.queryByText(/Checkout Ditolak/i)).toBeNull();
      expect(screen.queryByText(/diblokir/i)).toBeNull();
    });

    it("Req 3.2: non-blocked card in CHECKED_IN state triggers auto-checkout flow", async () => {
      // Observation: Terminal with active card in CHECKED_IN state triggers auto-checkout flow on unfixed code
      setupNfcState({
        phase: "ready",
        payload: makePayload({ cardState: CardState.CHECKED_IN, cardStatus: CardStatus.ACTIVE }),
        serialNumber: "a1:b2:c3:d4",
        error: null,
        tamperDetected: false,
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

      // Allow microtasks to flush (checkLocalBlockedStatus + performOvertimeCheckout)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // PRESERVED: auto-checkout flow is triggered (performOvertimeCheckout was called)
      expect(mockPerformOvertimeCheckout).toHaveBeenCalled();
      // No blocked UI should appear
      expect(screen.queryByText(/Checkout Ditolak/i)).toBeNull();
      expect(screen.queryByText(/diblokir/i)).toBeNull();
    });
  });

  // ── Gate Preservation ──────────────────────────────────────────────────

  describe("Gate View - Non-blocked card preservation", () => {
    it("Req 3.3: non-blocked card in IDLE state triggers auto-checkin flow", async () => {
      // Observation: Gate with active card in IDLE state triggers auto-checkin flow on unfixed code
      setupNfcState({
        phase: "ready",
        payload: makePayload({ cardState: CardState.IDLE, cardStatus: CardStatus.ACTIVE }),
        serialNumber: "d4:e5:f6:a1",
        error: null,
        tamperDetected: false,
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

      // Allow microtasks to flush (checkLocalBlockedStatus + validateTransition + write)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // PRESERVED: auto-checkin flow is triggered (applyCheckin and write were called)
      expect(mockApplyCheckin).toHaveBeenCalled();
      expect(mockWrite).toHaveBeenCalled();
      // No blocked UI should appear
      expect(screen.queryByText(/Akses Ditolak/i)).toBeNull();
      expect(screen.queryByText(/diblokir/i)).toBeNull();
    });

    it("Req 3.4: non-blocked card already CHECKED_IN shows 'Sudah Check-in'", async () => {
      // Observation: Gate with active card in CHECKED_IN state shows "Sudah Check-in" on unfixed code
      // Note: For CHECKED_IN cards at the gate, the validateTransition returns invalid
      // because you can't check-in when already checked in. But the render path shows
      // "Sudah Check-in" via the isAlreadyCheckedIn condition.
      // However, looking at the code more carefully: the effect calls checkLocalBlockedStatus
      // which returns { blocked: false }, then calls validateTransition. If validateTransition
      // returns { valid: false }, it sets autoCheckinTriggered = true and returns without
      // calling write. The render then shows "Sudah Check-in" because isAlreadyCheckedIn is true.
      // But wait - looking at the Gate code again, for CHECKED_IN cards with ACTIVE on-card status,
      // the flow goes: on-card status check passes (ACTIVE), then checkLocalBlockedStatus is called
      // (returns not blocked), then validateTransition is called. If validateTransition returns
      // { valid: false }, autoCheckinTriggered is set and the render shows "Sudah Check-in".
      // Let's mock validateTransition to return invalid for this case.
      const { validateTransition } = await import("../../../core/state-machine/engine");
      vi.mocked(validateTransition).mockReturnValue({ valid: false });

      setupNfcState({
        phase: "ready",
        payload: makePayload({ cardState: CardState.CHECKED_IN, cardStatus: CardStatus.ACTIVE }),
        serialNumber: "d4:e5:f6:a1",
        error: null,
        tamperDetected: false,
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

      // Allow microtasks to flush
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // PRESERVED: "Sudah Check-in" message is shown for non-blocked CHECKED_IN card
      expect(screen.queryByText(/Sudah Check-in/i)).not.toBeNull();
      // No blocked UI should appear
      expect(screen.queryByText(/Akses Ditolak/i)).toBeNull();
      expect(screen.queryByText(/diblokir/i)).toBeNull();

      // Restore mock
      vi.mocked(validateTransition).mockReturnValue({ valid: true });
    });

    it("Req 3.6: card with on-card BLOCKED_TAMPER status shows on-card blocked reason", async () => {
      // Observation: Gate with on-card blocked status (BLOCKED_TAMPER) shows on-card blocked reason on unfixed code
      // The Gate code checks payload.identity.status !== CardStatus.ACTIVE first,
      // and if not active, sets blockedReason from the statusNames map.
      setupNfcState({
        phase: "ready",
        payload: makePayload({
          cardState: CardState.IDLE,
          cardStatus: CardStatus.BLOCKED_TAMPER,
        }),
        serialNumber: "d4:e5:f6:a1",
        error: null,
        tamperDetected: false,
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

      // Allow microtasks to flush
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // PRESERVED: on-card blocked reason is shown
      expect(screen.queryByText(/Akses Ditolak/i)).not.toBeNull();
      expect(screen.queryByText(/manipulasi/i)).not.toBeNull();
    });

    it("Req 3.6: card with on-card BLOCKED_ADMIN status shows on-card blocked reason", async () => {
      // Observation: Gate with on-card blocked status (BLOCKED_ADMIN) shows on-card blocked reason on unfixed code
      setupNfcState({
        phase: "ready",
        payload: makePayload({
          cardState: CardState.IDLE,
          cardStatus: CardStatus.BLOCKED_ADMIN,
        }),
        serialNumber: "d4:e5:f6:a1",
        error: null,
        tamperDetected: false,
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

      // Allow microtasks to flush
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // PRESERVED: on-card blocked reason is shown
      expect(screen.queryByText(/Akses Ditolak/i)).not.toBeNull();
      expect(screen.queryByText(/admin/i)).not.toBeNull();
    });
  });

  // ── Scout Preservation ──────────────────────────────────────────────────

  describe("Scout View - Non-blocked card preservation", () => {
    it("Req 3.5: non-blocked card with ACTIVE on-card status shows 'Active' badge", async () => {
      // Observation: Scout with active card (onCardStatus=ACTIVE) shows "Active" badge on unfixed code
      setupNfcState({
        phase: "ready",
        payload: makePayload({
          cardState: CardState.IDLE,
          cardStatus: CardStatus.ACTIVE,
          name: "Budi Santoso",
          balance: 250000,
        }),
        serialNumber: "g7:h8:i9:j0",
        error: null,
        tamperDetected: false,
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

      // PRESERVED: "Active" badge is shown for non-blocked card
      expect(screen.queryByText("Active")).not.toBeNull();
      // Member name is displayed
      expect(screen.queryByText("Budi Santoso")).not.toBeNull();
      // Balance is displayed
      expect(screen.queryByText(/250\.000/)).not.toBeNull();
      // No blocked badge should appear
      expect(screen.queryByText(/Blocked/i)).toBeNull();
      expect(screen.queryByText(/diblokir/i)).toBeNull();
    });

    it("Req 3.5: non-blocked card shows correct member info and balance", async () => {
      // Property: for any non-blocked active card, Scout displays member name and balance correctly
      setupNfcState({
        phase: "ready",
        payload: makePayload({
          cardState: CardState.CHECKED_IN,
          cardStatus: CardStatus.ACTIVE,
          name: "Siti Rahayu",
          balance: 1500000,
        }),
        serialNumber: "x1:y2:z3:w4",
        error: null,
        tamperDetected: false,
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

      // PRESERVED: "Active" badge is shown regardless of wallet state
      expect(screen.queryByText("Active")).not.toBeNull();
      // Member name is displayed
      expect(screen.queryByText("Siti Rahayu")).not.toBeNull();
      // Balance is displayed
      expect(screen.queryByText(/1\.500\.000/)).not.toBeNull();
    });
  });
});
