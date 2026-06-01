// @vitest-environment jsdom
/**
 * Tests for src/components/section/KioskSection.tsx
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseSessionGrant = vi.fn();
const mockUseNfcCard = vi.fn();
const mockUseSyncEngineContext = vi.fn();

vi.mock("#/hooks/useSessionGrant", () => ({
  useSessionGrant: (...args: unknown[]) => mockUseSessionGrant(...args),
}));

vi.mock("#/hooks/nfc/useNfcCard", () => ({
  useNfcCard: (...args: unknown[]) => mockUseNfcCard(...args),
}));

vi.mock("#/hooks/SyncEngineContext", () => ({
  useSyncEngineContext: () => mockUseSyncEngineContext(),
}));

vi.mock("#/core/state-machine/engine", () => ({
  applyDebit: vi.fn((payload: any, amount: number) => ({
    ...payload,
    wallet: { ...payload.wallet, balance: payload.wallet.balance - amount },
  })),
  isWriteEligible: vi.fn().mockReturnValue({ eligible: true }),
}));

vi.mock("#/core/payload/types", () => ({
  CardStatus: { ACTIVE: 0, BLOCKED_TAMPER: 1 },
}));

vi.mock("#/db/local-db", () => ({
  localDb: {
    cards: { put: vi.fn().mockResolvedValue(undefined) },
  },
}));

vi.mock("../../../components/block/CardStatusBadge", () => ({
  CardStatusBadge: ({ status }: { status: number }) => (
    <span data-testid="card-status-badge" data-status={status} />
  ),
}));

vi.mock("../../../components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("../../../components/block/LoadingState", () => ({
  LoadingState: ({ text }: { text?: string; variant?: string }) => (
    <span data-testid="loading-state">{text}</span>
  ),
}));

vi.mock("../../../components/block/NfcTapArea", () => ({
  NfcTapArea: ({ phase, onClick }: { phase: string; onClick?: () => void }) => (
    <div data-testid="nfc-tap-area" data-phase={phase} onClick={onClick} />
  ),
  NfcStatusLabel: ({ phase, error }: { phase: string; error?: string }) => (
    <div data-testid="nfc-status-label" data-phase={phase}>
      {error}
    </div>
  ),
}));

import { KioskSection } from "#/components/section/KioskSection";

const defaultProps = {
  tenantId: "t-1",
  accountId: "a-1",
  deviceId: "d-1",
  terminalId: 1,
};

describe("KioskSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: vi.fn() });
  });

  it("shows session error when no grant and not loading", () => {
    mockUseSessionGrant.mockReturnValue({ grant: null, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: { phase: "idle", payload: null },
      scan: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
    });

    render(<KioskSection {...defaultProps} />);
    expect(screen.getByText(/Sesi tidak tersedia/)).toBeDefined();
  });

  it("shows loading state when session is loading", () => {
    mockUseSessionGrant.mockReturnValue({ grant: null, loading: true });
    mockUseNfcCard.mockReturnValue({
      state: { phase: "idle", payload: null },
      scan: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
    });

    render(<KioskSection {...defaultProps} />);
    // When loading, the button shows LoadingState component
    expect(screen.getByTestId("loading-state")).toBeDefined();
  });

  it("renders tap area and start button in idle state", () => {
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: { phase: "idle", payload: null },
      scan: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
    });

    render(<KioskSection {...defaultProps} />);
    expect(screen.getByTestId("nfc-tap-area")).toBeDefined();
    expect(screen.getByText("Mulai Transaksi")).toBeDefined();
  });

  it("calls scan when start button is clicked", () => {
    const mockScan = vi.fn();
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: { phase: "idle", payload: null },
      scan: mockScan,
      write: vi.fn(),
      reset: vi.fn(),
    });

    render(<KioskSection {...defaultProps} />);
    fireEvent.click(screen.getByText("Mulai Transaksi"));
    expect(mockScan).toHaveBeenCalled();
  });

  it("shows scanning state", () => {
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: { phase: "scanning", payload: null },
      scan: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
    });

    render(<KioskSection {...defaultProps} />);
    const tapArea = screen.getByTestId("nfc-tap-area");
    expect(tapArea.getAttribute("data-phase")).toBe("scanning");
  });

  it("shows error state with retry button", () => {
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: { phase: "error", payload: null, error: "Scan failed", tamperDetected: false },
      scan: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
    });

    render(<KioskSection {...defaultProps} />);
    expect(screen.getByText("Coba Lagi")).toBeDefined();
  });

  it("shows card info and quick amounts when card is ready", () => {
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: {
        phase: "ready",
        payload: {
          identity: { name: "Test User", status: 0 },
          wallet: { balance: 100000, counter: 1n },
        },
      },
      scan: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
    });

    render(<KioskSection {...defaultProps} />);
    expect(screen.getByText("Test User")).toBeDefined();
    expect(screen.getByText("Rp 100.000")).toBeDefined();
    expect(screen.getByText("Pilih nominal:")).toBeDefined();
    expect(screen.getByText("5k")).toBeDefined();
    expect(screen.getByText("50k")).toBeDefined();
  });

  it("disables quick amount buttons when balance is insufficient", () => {
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: {
        phase: "ready",
        payload: {
          identity: { name: "Test User", status: 0 },
          wallet: { balance: 3000, counter: 1n },
        },
      },
      scan: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
    });

    render(<KioskSection {...defaultProps} />);
    const btn5k = screen.getByText("5k");
    expect(btn5k).toHaveProperty("disabled", true);
  });

  it("shows register card button", () => {
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: {
        phase: "ready",
        payload: {
          identity: { name: "Test User", status: 0 },
          wallet: { balance: 100000, counter: 1n },
        },
      },
      scan: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
    });

    render(<KioskSection {...defaultProps} />);
    expect(screen.getByText("Daftarkan Kartu")).toBeDefined();
  });
});
