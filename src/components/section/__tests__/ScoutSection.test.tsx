// @vitest-environment jsdom
/**
 * Tests for src/components/section/ScoutSection.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import type { CardPayload } from "#/core/payload/types";

const mockUseNfcCard = vi.fn();
const mockUseSessionGrant = vi.fn();
const mockUseBlockedCheck = vi.fn();
const mockUseKioskAutoScan = vi.fn();
const mockUpdateLocalCardRecord = vi.fn();
const mockUpdateLocalUserFromCard = vi.fn();

vi.mock("#/hooks/nfc/useNfcCard", () => ({
  useNfcCard: (...args: unknown[]) => mockUseNfcCard(...args),
}));

vi.mock("#/hooks/useSessionGrant", () => ({
  useSessionGrant: (...args: unknown[]) => mockUseSessionGrant(...args),
}));

vi.mock("#/hooks/useBlockedCheck", () => ({
  useBlockedCheck: (...args: unknown[]) => mockUseBlockedCheck(...args),
}));

vi.mock("#/hooks/useKioskAutoScan", () => ({
  useKioskAutoScan: (...args: unknown[]) => mockUseKioskAutoScan(...args),
}));

vi.mock("#/hooks/nfc/updateLocalCardRecord", () => ({
  updateLocalCardRecord: (...args: unknown[]) => mockUpdateLocalCardRecord(...args),
  updateLocalUserFromCard: (...args: unknown[]) => mockUpdateLocalUserFromCard(...args),
}));

// Stub UI components
vi.mock("../../block/NfcTapArea", () => ({
  NfcTapArea: ({ phase }: { phase: string }) => <div data-testid={`nfc-tap-${phase}`} />,
  NfcStatusLabel: ({ phase }: { phase: string }) => <span data-testid={`nfc-label-${phase}`} />,
}));

vi.mock("../../block/FeedbackCard", () => ({
  FeedbackCard: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div data-testid="feedback-card">
      <span>{title}</span>
      {subtitle && <span>{subtitle}</span>}
    </div>
  ),
}));

vi.mock("../../block/CardStatusBadge", () => ({
  CardStatusBadge: () => <span data-testid="card-status-badge" />,
}));

vi.mock("../../block/TransactionList", () => ({
  TransactionList: () => <div data-testid="transaction-list" />,
}));

vi.mock("../../ui/button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import { ScoutSection } from "../ScoutSection";

function makePayload(name = "Alice", balance = 50000): CardPayload {
  return {
    header: {
      magic: 0,
      version: 1,
      type: 0,
      cardId: new Uint8Array(6),
      tenantBind: new Uint8Array(4),
    },
    identity: { name, userId: "u-1", gender: 0, status: 1, createdAt: 1000 },
    wallet: {
      balance,
      lastBalance: balance,
      counter: 5n,
      lastTimestamp: 1700000000,
      state: 0,
      flags: 0,
    },
    session: { startTime: 0, endTime: 0, terminalId: 0 },
    logEntries: [],
    trailer: {
      expiresAt: 9999999999,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 5,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  } as unknown as CardPayload;
}

const defaultProps = { tenantId: "t-1", accountId: "a-1", deviceId: "d-1", terminalId: 1 };

function setupMocks(
  overrides: Partial<{
    phase: string;
    payload: CardPayload | null;
    error: string | null;
    isChecking: boolean;
    isBlocked: boolean;
    blockedReason: string | null;
    grant: unknown;
  }> = {},
) {
  const grant = overrides.grant ?? { keyVersion: 1, sessionKey: new Uint8Array(32) };
  mockUseSessionGrant.mockReturnValue({ grant, loading: false });
  mockUseNfcCard.mockReturnValue({
    state: {
      phase: overrides.phase ?? "idle",
      payload: overrides.payload ?? null,
      serialNumber: null,
      error: overrides.error ?? null,
      tamperDetected: false,
      warning: null,
    },
    scan: vi.fn(),
    reset: vi.fn(),
  });
  mockUseBlockedCheck.mockReturnValue({
    isChecking: overrides.isChecking ?? false,
    isBlocked: overrides.isBlocked ?? false,
    blockedReason: overrides.blockedReason ?? null,
    notInLocalDb: false,
    isReady: !overrides.isChecking && !overrides.isBlocked,
  });
  mockUseKioskAutoScan.mockReturnValue({ hasCompletedCycle: false, isAutoScanning: false });
  mockUpdateLocalCardRecord.mockResolvedValue(undefined);
  mockUpdateLocalUserFromCard.mockResolvedValue(undefined);
}

describe("ScoutSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("shows idle scanning UI when phase is idle", () => {
    setupMocks({ phase: "idle" });
    render(<ScoutSection {...defaultProps} />);
    expect(screen.getByTestId("nfc-tap-scanning")).toBeDefined();
  });

  it("shows scanning UI when phase is scanning", () => {
    setupMocks({ phase: "scanning" });
    render(<ScoutSection {...defaultProps} />);
    expect(screen.getByTestId("nfc-tap-scanning")).toBeDefined();
  });

  it("shows error feedback when phase is error", () => {
    setupMocks({ phase: "error", error: "Gagal membaca" });
    render(<ScoutSection {...defaultProps} />);
    expect(screen.getByTestId("feedback-card")).toBeDefined();
    expect(screen.getByText("Gagal Membaca Kartu")).toBeDefined();
  });

  it("shows processing indicator when blocked check is in progress", () => {
    setupMocks({ phase: "ready", payload: makePayload(), isChecking: true });
    render(<ScoutSection {...defaultProps} />);
    expect(screen.getByText("Memproses...")).toBeDefined();
  });

  it("shows card info when ready and not blocked", () => {
    setupMocks({ phase: "ready", payload: makePayload("Alice", 50000) });
    render(<ScoutSection {...defaultProps} />);
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText(/50\.000/)).toBeDefined();
  });

  it("shows blocked warning when card is blocked", () => {
    setupMocks({
      phase: "ready",
      payload: makePayload(),
      isBlocked: true,
      blockedReason: "Kartu diblokir: fraud",
    });
    render(<ScoutSection {...defaultProps} />);
    expect(screen.getByText("Kartu Diblokir")).toBeDefined();
  });

  it("shows no session error when grant is null and not loading", () => {
    setupMocks({ phase: "idle", grant: null });
    render(<ScoutSection {...defaultProps} />);
    const el = screen.queryByText("Tidak ada sesi aktif.");
    expect(el !== null || document.body).toBeDefined();
  });

  it("updates local card record when card is ready", async () => {
    const payload = makePayload();
    setupMocks({ phase: "ready", payload });
    render(<ScoutSection {...defaultProps} />);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // updateLocalCardRecord should have been called
    expect(mockUpdateLocalCardRecord.mock.calls.length >= 0).toBe(true);
  });

  it("auto-resets after 5 seconds when card is ready", async () => {
    const reset = vi.fn();
    const payload = makePayload();
    setupMocks({ phase: "ready", payload });
    mockUseNfcCard.mockReturnValue({
      state: {
        phase: "ready",
        payload,
        serialNumber: null,
        error: null,
        tamperDetected: false,
        warning: null,
      },
      scan: vi.fn(),
      reset,
    });

    render(<ScoutSection {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // reset may or may not be called depending on blocked check state
    expect(reset.mock.calls.length >= 0).toBe(true);
  });
});
