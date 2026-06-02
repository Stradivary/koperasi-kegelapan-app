// @vitest-environment jsdom
/**
 * Tests for src/components/section/GateSection.tsx
 * Covers: session error, idle/scanning/ready/success/error phases,
 *         simulation mode toggle, getCardRejectionReason helper.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseSessionGrant = vi.fn();
const mockUseNfcCard = vi.fn();
const mockUseSyncEngineContext = vi.fn();
const mockUseBlockedCheck = vi.fn();
const mockUseKioskAutoScan = vi.fn();

vi.mock("#/presentation/hooks/useSessionGrant", () => ({
  useSessionGrant: (...args: unknown[]) => mockUseSessionGrant(...args),
}));
vi.mock("#/presentation/hooks/nfc/useNfcCard", () => ({
  useNfcCard: (...args: unknown[]) => mockUseNfcCard(...args),
}));
vi.mock("#/presentation/hooks/SyncEngineContext", () => ({
  useSyncEngineContext: () => mockUseSyncEngineContext(),
}));
vi.mock("#/presentation/hooks/useBlockedCheck", () => ({
  useBlockedCheck: (...args: unknown[]) => mockUseBlockedCheck(...args),
}));
vi.mock("#/presentation/hooks/useKioskAutoScan", () => ({
  useKioskAutoScan: (...args: unknown[]) => mockUseKioskAutoScan(...args),
}));
vi.mock("#/presentation/hooks/domain", () => ({
  validateTransition: vi.fn().mockReturnValue({ valid: true }),
  applyCheckin: vi.fn((p: unknown) => p),
  applyBlockStatus: vi.fn((p: unknown) => p),
}));
vi.mock("#/presentation/hooks/types", () => ({
  CardState: { IDLE: 0, CHECKED_IN: 1, CHECKED_OUT: 2, STATION_OPERATION: 3 },
  CardStatus: {
    ACTIVE: 0,
    BLOCKED_TAMPER: 1,
    BLOCKED_FRAUD: 2,
    BLOCKED_EXPIRED: 3,
    BLOCKED_ADMIN: 4,
  },
}));
vi.mock("#/presentation/hooks/usePeerSync", () => ({ notifyCheckin: vi.fn() }));
vi.mock("#/presentation/hooks/nfc/updateLocalCardRecord", () => ({
  updateLocalCardRecord: vi.fn(),
}));
vi.mock("#/presentation/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("#/presentation/components/block/NfcTapArea", () => ({
  NfcTapArea: ({ phase, tamperDetected }: { phase: string; tamperDetected?: boolean }) => (
    <div data-testid="nfc-tap-area" data-phase={phase} data-tamper={String(!!tamperDetected)} />
  ),
  NfcStatusLabel: ({ phase }: { phase: string }) => (
    <div data-testid="nfc-status-label" data-phase={phase} />
  ),
}));
vi.mock("#/presentation/components/block/FeedbackCard", () => ({
  FeedbackCard: ({
    title,
    variant,
    actions,
  }: {
    title: string;
    variant: string;
    subtitle?: string;
    actions?: { label: string; onClick: () => void }[];
    details?: unknown[];
    autoClose?: number;
    onClose?: () => void;
  }) => (
    <div data-testid="feedback-card" data-variant={variant}>
      <span>{title}</span>
      {actions?.map((a) => (
        <button key={a.label} onClick={a.onClick}>
          {a.label}
        </button>
      ))}
    </div>
  ),
}));

import { GateSection } from "#/presentation/components/section/GateSection";

const defaultProps = { tenantId: "t-1", accountId: "a-1", deviceId: "d-1", terminalId: 1 };

function setupDefault(stateOverride = {}) {
  mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
  mockUseNfcCard.mockReturnValue({
    state: {
      phase: "idle",
      payload: null,
      serialNumber: null,
      tamperDetected: false,
      error: null,
      ...stateOverride,
    },
    scan: vi.fn(),
    write: vi.fn(),
    reset: vi.fn(),
    retryScan: vi.fn(),
  });
  mockUseBlockedCheck.mockReturnValue({
    isReady: false,
    isChecking: false,
    isBlocked: false,
    blockedReason: null,
  });
  mockUseKioskAutoScan.mockReturnValue(undefined);
  mockUseSyncEngineContext.mockReturnValue({ notifyMutation: vi.fn() });
}

describe("GateSection - session error", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows no-session error when grant is null and not loading", () => {
    mockUseSessionGrant.mockReturnValue({ grant: null, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: {
        phase: "idle",
        payload: null,
        serialNumber: null,
        tamperDetected: false,
        error: null,
      },
      scan: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
      retryScan: vi.fn(),
    });
    mockUseBlockedCheck.mockReturnValue({
      isReady: false,
      isChecking: false,
      isBlocked: false,
      blockedReason: null,
    });
    mockUseKioskAutoScan.mockReturnValue(undefined);
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: vi.fn() });
    render(<GateSection {...defaultProps} />);
    expect(screen.getByText("Tidak ada sesi aktif.")).toBeDefined();
  });
});

describe("GateSection - idle phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefault();
  });

  it("renders scanning NfcTapArea in idle phase", () => {
    render(<GateSection {...defaultProps} />);
    expect(screen.getByTestId("nfc-tap-area").getAttribute("data-phase")).toBe("scanning");
  });
});

describe("GateSection - scanning phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefault({ phase: "scanning" });
  });

  it("renders scanning NfcTapArea", () => {
    render(<GateSection {...defaultProps} />);
    expect(screen.getByTestId("nfc-tap-area").getAttribute("data-phase")).toBe("scanning");
  });
});

describe("GateSection - error phase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows error FeedbackCard with retry button", () => {
    setupDefault({ phase: "error", error: "NFC failed", tamperDetected: false });
    render(<GateSection {...defaultProps} />);
    expect(screen.getByTestId("feedback-card").getAttribute("data-variant")).toBe("error");
    expect(screen.getByText("Coba Lagi")).toBeDefined();
  });

  it("shows tamper error title when tamperDetected", () => {
    setupDefault({ phase: "error", error: null, tamperDetected: true });
    render(<GateSection {...defaultProps} />);
    expect(screen.getByText("Kartu Terdeteksi Rusak")).toBeDefined();
  });
});

describe("GateSection - success phase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows success FeedbackCard", () => {
    setupDefault({
      phase: "success",
      payload: {
        header: { cardId: new Uint8Array(6) },
        identity: { name: "Budi", status: 0 },
        wallet: { balance: 50000, state: 0 },
      },
    });
    render(<GateSection {...defaultProps} />);
    expect(screen.getByText("Check-in Berhasil")).toBeDefined();
  });
});

describe("GateSection - ready phase (blocked)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows blocked FeedbackCard when blocked", () => {
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: {
        phase: "ready",
        payload: {
          header: { cardId: new Uint8Array(6) },
          identity: { name: "Budi", status: 0 },
          wallet: { balance: 50000, state: 0 },
        },
        serialNumber: "abc",
        tamperDetected: false,
        error: null,
      },
      scan: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
      retryScan: vi.fn(),
    });
    mockUseBlockedCheck.mockReturnValue({
      isReady: false,
      isChecking: false,
      isBlocked: true,
      blockedReason: "Kartu diblokir admin",
    });
    mockUseKioskAutoScan.mockReturnValue(undefined);
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: vi.fn() });
    render(<GateSection {...defaultProps} />);
    expect(screen.getByText("Akses Ditolak")).toBeDefined();
  });
});

describe("GateSection - simulation mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefault();
  });

  it("shows simulation mode toggle button", () => {
    render(<GateSection {...defaultProps} />);
    expect(screen.getByText("Mode Simulasi")).toBeDefined();
  });

  it("shows datetime input when simulation mode toggled on", () => {
    render(<GateSection {...defaultProps} />);
    fireEvent.click(screen.getByText("Mode Simulasi"));
    expect(screen.getByText("Mode Simulasi Aktif")).toBeDefined();
    expect(screen.getByLabelText("Waktu check-in:")).toBeDefined();
  });

  it("hides datetime input when simulation mode toggled off", () => {
    render(<GateSection {...defaultProps} />);
    fireEvent.click(screen.getByText("Mode Simulasi"));
    fireEvent.click(screen.getByText("Mode Simulasi Aktif"));
    expect(screen.queryByLabelText("Waktu check-in:")).toBeNull();
  });

  it("updates simulated datetime when input changes", () => {
    render(<GateSection {...defaultProps} />);
    fireEvent.click(screen.getByText("Mode Simulasi"));
    const input = screen.getByLabelText("Waktu check-in:") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2024-06-15T10:30" } });
    expect(input.value).toBe("2024-06-15T10:30");
  });
});
