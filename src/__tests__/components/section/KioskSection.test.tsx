// @vitest-environment jsdom
/**
 * Tests for src/components/section/KioskSection.tsx
 * Covers: idle, scanning, error, ready (quick amounts, confirm, register, done),
 *         custom amount, write flow, session loading/error states.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseSessionGrant = vi.fn();
const mockUseNfcCard = vi.fn();
const mockUseSyncEngineContext = vi.fn();
const mockWrite = vi.fn();
const mockReset = vi.fn();
const mockScan = vi.fn();

vi.mock("#/hooks/useSessionGrant", () => ({
  useSessionGrant: (...args: unknown[]) => mockUseSessionGrant(...args),
}));

vi.mock("#/hooks/nfc/useNfcCard", () => ({
  useNfcCard: (...args: unknown[]) => mockUseNfcCard(...args),
}));

vi.mock("#/hooks/SyncEngineContext", () => ({
  useSyncEngineContext: () => mockUseSyncEngineContext(),
}));

vi.mock("#/hooks/domain", () => ({
  applyDebit: vi.fn((payload: unknown, amount: number) => ({
    ...(payload as object),
    wallet: {
      ...(payload as { wallet: { balance: number } }).wallet,
      balance: (payload as { wallet: { balance: number } }).wallet.balance - amount,
    },
  })),
  isWriteEligible: vi.fn().mockReturnValue({ eligible: true }),
}));

vi.mock("#/hooks/types", () => ({
  CardStatus: { ACTIVE: 0, BLOCKED_TAMPER: 1, BLOCKED_ADMIN: 4 },
}));

vi.mock("#/hooks/useLocalDb", () => ({
  localDb: {
    cards: { put: vi.fn().mockResolvedValue(undefined) },
  },
}));

vi.mock("#/components/block/CardStatusBadge", () => ({
  CardStatusBadge: ({ status }: { status: number }) => (
    <span data-testid="card-status-badge" data-status={status} />
  ),
}));

vi.mock("#/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
    size: _sz,
    className: _cn,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock("#/components/block/LoadingState", () => ({
  LoadingState: ({ text }: { text?: string }) => <span data-testid="loading-state">{text}</span>,
}));

vi.mock("#/components/block/NfcTapArea", () => ({
  NfcTapArea: ({ phase, onClick }: { phase: string; onClick?: () => void }) => (
    <div data-testid="nfc-tap-area" data-phase={phase} onClick={onClick} />
  ),
  NfcStatusLabel: ({ phase, error }: { phase: string; error?: string | null }) => (
    <div data-testid="nfc-status-label" data-phase={phase}>
      {error}
    </div>
  ),
}));

import { KioskSection } from "#/components/section/KioskSection";

const defaultProps = { tenantId: "t-1", accountId: "a-1", deviceId: "d-1", terminalId: 1 };

const activePayload = {
  header: { cardId: new Uint8Array([0xab, 0xcd, 0xef, 0x01, 0x02, 0x03]) },
  identity: { name: "Budi", status: 0 },
  wallet: { balance: 100_000, counter: 1n },
};

function setupReady(payloadOverride = activePayload) {
  mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
  mockUseNfcCard.mockReturnValue({
    state: { phase: "ready", payload: payloadOverride, tamperDetected: false, error: null },
    scan: mockScan,
    write: mockWrite,
    reset: mockReset,
  });
}

describe("KioskSection - session states", () => {
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
    expect(screen.getByTestId("loading-state")).toBeDefined();
  });
});

describe("KioskSection - idle phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: vi.fn() });
  });

  it("renders tap area and start button", () => {
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: { phase: "idle", payload: null },
      scan: mockScan,
      write: vi.fn(),
      reset: vi.fn(),
    });
    render(<KioskSection {...defaultProps} />);
    expect(screen.getByTestId("nfc-tap-area")).toBeDefined();
    expect(screen.getByText("Mulai Transaksi")).toBeDefined();
  });

  it("calls scan when start button clicked", () => {
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: { phase: "idle", payload: null },
      scan: mockScan,
      write: vi.fn(),
      reset: vi.fn(),
    });
    render(<KioskSection {...defaultProps} />);
    fireEvent.click(screen.getByText("Mulai Transaksi"));
    expect(mockScan).toHaveBeenCalledOnce();
  });
});

describe("KioskSection - scanning phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: vi.fn() });
  });

  it("shows scanning NfcTapArea", () => {
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: { phase: "scanning", payload: null },
      scan: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
    });
    render(<KioskSection {...defaultProps} />);
    expect(screen.getByTestId("nfc-tap-area").getAttribute("data-phase")).toBe("scanning");
  });
});

describe("KioskSection - error phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: vi.fn() });
  });

  it("shows error tap area and retry button", () => {
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: { phase: "error", payload: null, error: "Scan failed", tamperDetected: false },
      scan: vi.fn(),
      write: vi.fn(),
      reset: mockReset,
    });
    render(<KioskSection {...defaultProps} />);
    expect(screen.getByText("Coba Lagi")).toBeDefined();
  });

  it("calls reset when retry clicked", () => {
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: { phase: "error", payload: null, error: "fail", tamperDetected: false },
      scan: vi.fn(),
      write: vi.fn(),
      reset: mockReset,
    });
    render(<KioskSection {...defaultProps} />);
    fireEvent.click(screen.getByText("Coba Lagi"));
    expect(mockReset).toHaveBeenCalledOnce();
  });
});

describe("KioskSection - ready phase (tap step)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: vi.fn() });
  });

  it("shows card name and balance", () => {
    setupReady();
    render(<KioskSection {...defaultProps} />);
    expect(screen.getByText("Budi")).toBeDefined();
    expect(screen.getByText("Rp 100.000")).toBeDefined();
  });

  it("shows quick amount buttons", () => {
    setupReady();
    render(<KioskSection {...defaultProps} />);
    expect(screen.getByText("5k")).toBeDefined();
    expect(screen.getByText("50k")).toBeDefined();
  });

  it("disables quick amount buttons when balance insufficient", () => {
    setupReady({ ...activePayload, wallet: { balance: 3_000, counter: 1n } });
    render(<KioskSection {...defaultProps} />);
    const btn5k = screen.getByText("5k").closest("button");
    expect(btn5k?.disabled).toBe(true);
  });

  it("shows Daftarkan Kartu button", () => {
    setupReady();
    render(<KioskSection {...defaultProps} />);
    expect(screen.getByText("Daftarkan Kartu")).toBeDefined();
  });

  it("transitions to confirm step when quick amount clicked", () => {
    setupReady();
    render(<KioskSection {...defaultProps} />);
    fireEvent.click(screen.getByText("10k"));
    expect(screen.getByText("Konfirmasi Pembayaran")).toBeDefined();
    expect(screen.getByText("Rp 10.000")).toBeDefined();
  });

  it("transitions to confirm step via custom amount + OK", () => {
    setupReady();
    render(<KioskSection {...defaultProps} />);
    const input = screen.getByPlaceholderText("Nominal lain");
    fireEvent.change(input, { target: { value: "7500" } });
    fireEvent.click(screen.getByText("OK"));
    expect(screen.getByText("Konfirmasi Pembayaran")).toBeDefined();
  });

  it("transitions to register step when Daftarkan Kartu clicked", () => {
    setupReady();
    render(<KioskSection {...defaultProps} />);
    fireEvent.click(screen.getByText("Daftarkan Kartu"));
    expect(screen.getByText("Daftarkan")).toBeDefined();
  });
});

describe("KioskSection - confirm step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: vi.fn() });
  });

  it("shows Batal button that returns to tap step", () => {
    setupReady();
    render(<KioskSection {...defaultProps} />);
    fireEvent.click(screen.getByText("10k"));
    fireEvent.click(screen.getByText("Batal"));
    // After Batal, step is "tap" again — quick amounts should be visible
    expect(screen.getByText("Pilih nominal:")).toBeDefined();
  });

  it("calls write on confirm and shows done state", async () => {
    mockWrite.mockResolvedValue(true);
    setupReady();
    render(<KioskSection {...defaultProps} />);
    fireEvent.click(screen.getByText("10k"));
    fireEvent.click(screen.getByText("Konfirmasi Pembayaran"));
    await waitFor(() => expect(screen.getByText("Transaksi Berhasil")).toBeDefined());
    expect(mockWrite).toHaveBeenCalledOnce();
  });

  it("shows error when balance insufficient for custom amount", () => {
    setupReady({ ...activePayload, wallet: { balance: 5_000, counter: 1n } });
    render(<KioskSection {...defaultProps} />);
    const input = screen.getByPlaceholderText("Nominal lain");
    fireEvent.change(input, { target: { value: "10000" } });
    fireEvent.click(screen.getByText("OK"));
    fireEvent.click(screen.getByText("Konfirmasi Pembayaran"));
    expect(screen.getByText("Saldo tidak cukup")).toBeDefined();
  });
});

describe("KioskSection - register step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: vi.fn() });
  });

  it("shows register form with balance presets", () => {
    setupReady();
    render(<KioskSection {...defaultProps} />);
    fireEvent.click(screen.getByText("Daftarkan Kartu"));
    expect(screen.getByText("50k")).toBeDefined();
    expect(screen.getByText("100k")).toBeDefined();
  });

  it("Batal returns to tap step", () => {
    setupReady();
    render(<KioskSection {...defaultProps} />);
    fireEvent.click(screen.getByText("Daftarkan Kartu"));
    fireEvent.click(screen.getByText("Batal"));
    // After Batal, step is "tap" — quick amounts visible again
    expect(screen.getByText("Pilih nominal:")).toBeDefined();
  });

  it("registers card and shows done state", async () => {
    setupReady();
    render(<KioskSection {...defaultProps} />);
    fireEvent.click(screen.getByText("Daftarkan Kartu"));
    fireEvent.click(screen.getByText("Daftarkan"));
    await waitFor(() => expect(screen.getByText("Kartu Berhasil Didaftarkan")).toBeDefined());
  });
});

describe("KioskSection - done step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: vi.fn() });
  });

  it("shows Selesai button that resets to tap", async () => {
    mockWrite.mockResolvedValue(true);
    setupReady();
    render(<KioskSection {...defaultProps} />);
    fireEvent.click(screen.getByText("10k"));
    fireEvent.click(screen.getByText("Konfirmasi Pembayaran"));
    await waitFor(() => screen.getByText("Selesai"));
    fireEvent.click(screen.getByText("Selesai"));
    expect(mockReset).toHaveBeenCalledOnce();
  });
});
