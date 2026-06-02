// @vitest-environment jsdom
/**
 * Tests for src/components/block/UnifiedNfcScanner/UnifiedNfcScanner.tsx
 * Covers: DEFAULT_LABELS, inline/drawer display modes, NFC not supported,
 *         all phase states, auto-scan, auto-close, continuous scan,
 *         render props (renderReady, renderSuccess, renderError, renderHeader, renderFooter),
 *         cancel/retry/skip/fixCard handlers, write_pending_retry phase.
 */
import { render, screen, act, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// ── useUnifiedNfc mock ────────────────────────────────────────────────────────

const mockScan = vi.fn();
const mockReset = vi.fn();
const mockCancel = vi.fn();
const mockRetryWrite = vi.fn();
const mockUseUnifiedNfc = vi.fn();

vi.mock("#/presentation/hooks/useUnifiedNfc.ts", () => ({
  useUnifiedNfc: (...args: unknown[]) => mockUseUnifiedNfc(...args),
}));

// ── Sub-component mocks ───────────────────────────────────────────────────────

vi.mock("#/presentation/components/block/UnifiedNfcScanner/index.ts", () => ({
  NfcTapArea: ({ phase }: { phase: string }) => (
    <div data-testid="nfc-tap-area" data-phase={phase} />
  ),
  StepIndicator: ({ phase }: { phase: string }) => (
    <div data-testid="step-indicator" data-phase={phase} />
  ),
  CardInfoDisplay: ({ classification }: { classification: string | null }) => (
    <div data-testid="card-info-display" data-classification={classification ?? ""} />
  ),
  ActionButtons: ({ phase }: { phase: string }) => (
    <div data-testid="action-buttons" data-phase={phase} />
  ),
  RawDataInspector: () => <div data-testid="raw-data-inspector" />,
}));

// ── UI mocks ──────────────────────────────────────────────────────────────────

vi.mock("#/presentation/components/ui/button.tsx", () => ({
  Button: ({
    children,
    onClick,
    "aria-label": ariaLabel,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} aria-label={ariaLabel} data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock("#/presentation/components/ui/drawer.tsx", () => ({
  Drawer: ({
    open,
    children,
    onOpenChange,
  }: {
    open?: boolean;
    children: React.ReactNode;
    onOpenChange?: (o: boolean) => void;
    direction?: string;
  }) =>
    open ? (
      <div data-testid="drawer" onClick={() => onOpenChange?.(false)}>
        {children}
      </div>
    ) : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer-content">{children}</div>
  ),
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => <span data-testid="icon-alert-triangle" />,
  CheckCircle2: () => <span data-testid="icon-check-circle" />,
  WifiOff: () => <span data-testid="icon-wifi-off" />,
  Wrench: () => <span data-testid="icon-wrench" />,
  XCircle: () => <span data-testid="icon-x-circle" />,
}));

import {
  UnifiedNfcScanner,
  DEFAULT_LABELS,
} from "#/presentation/components/block/UnifiedNfcScanner/UnifiedNfcScanner";

// ── Helpers ───────────────────────────────────────────────────────────────────

interface NfcState {
  phase: string;
  payload: unknown;
  rawResult: unknown;
  classification: string | null;
  isCheckedIn: boolean;
  tamperDetected: boolean;
  error: unknown;
}

function makeState(overrides: Partial<NfcState> = {}): NfcState {
  return {
    phase: "idle",
    payload: null,
    rawResult: null,
    classification: null,
    isCheckedIn: false,
    tamperDetected: false,
    error: null,
    ...overrides,
  };
}

function setupHook(stateOverrides = {}, supported = false) {
  mockUseUnifiedNfc.mockReturnValue({
    state: makeState(stateOverrides),
    scan: mockScan,
    reset: mockReset,
    cancel: mockCancel,
    retryWrite: mockRetryWrite,
    isNfcSupported: supported,
  });
}

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    displayMode: "inline" as const,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DEFAULT_LABELS", () => {
  it("has Indonesian idle label", () => {
    expect(DEFAULT_LABELS.idle).toBe("Tempelkan Kartu");
  });
  it("has Indonesian success label", () => {
    expect(DEFAULT_LABELS.success).toBe("Berhasil!");
  });
  it("has Indonesian error label", () => {
    expect(DEFAULT_LABELS.error).toBe("Gagal");
  });
  it("has nfcNotSupported label", () => {
    expect(DEFAULT_LABELS.nfcNotSupported).toContain("NFC");
  });
  it("has continuousScanCountdown with {countdown} placeholder", () => {
    expect(DEFAULT_LABELS.continuousScanCountdown).toContain("{countdown}");
  });
});

describe("UnifiedNfcScanner - NFC not supported", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHook({}, false);
  });

  it("shows WifiOff icon when NFC not supported", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByTestId("icon-wifi-off")).toBeDefined();
  });

  it("shows nfcNotSupported label", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByText(DEFAULT_LABELS.nfcNotSupported)).toBeDefined();
  });

  it("has role=alert for accessibility", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByRole("alert")).toBeDefined();
  });
});

describe("UnifiedNfcScanner - inline mode, idle phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHook({ phase: "idle" }, true);
  });

  it("renders NfcTapArea in idle phase", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByTestId("nfc-tap-area")).toBeDefined();
  });

  it("does not render drawer in inline mode", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(document.querySelector("[data-testid='drawer']")).toBeNull();
  });

  it("renders StepIndicator when showSteps=true", () => {
    render(<UnifiedNfcScanner {...defaultProps({ showSteps: true })} />);
    expect(screen.getByTestId("step-indicator")).toBeDefined();
  });

  it("does not render StepIndicator when showSteps=false (default)", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(document.querySelector("[data-testid='step-indicator']")).toBeNull();
  });

  it("passes correct phase to NfcTapArea", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByTestId("nfc-tap-area").getAttribute("data-phase")).toBe("idle");
  });
});

describe("UnifiedNfcScanner - scanning phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHook({ phase: "scanning" }, true);
  });

  it("renders NfcTapArea in scanning phase", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByTestId("nfc-tap-area").getAttribute("data-phase")).toBe("scanning");
  });

  it("shows cancel button during scanning", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByRole("button", { name: DEFAULT_LABELS.cancel })).toBeDefined();
  });

  it("calls cancel when cancel button clicked", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    screen.getByRole("button", { name: DEFAULT_LABELS.cancel }).click();
    expect(mockCancel).toHaveBeenCalledOnce();
  });
});

describe("UnifiedNfcScanner - success phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHook({ phase: "success" }, true);
  });

  it("shows success icon", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByTestId("icon-check-circle")).toBeDefined();
  });

  it("shows success label", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByText(DEFAULT_LABELS.success)).toBeDefined();
  });

  it("has role=status for accessibility", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("uses custom renderSuccess when provided", () => {
    const renderSuccess = vi.fn().mockReturnValue(<div data-testid="custom-success" />);
    render(<UnifiedNfcScanner {...defaultProps({ renderSuccess })} />);
    expect(screen.getByTestId("custom-success")).toBeDefined();
    expect(renderSuccess).toHaveBeenCalledOnce();
  });

  it("passes renderContext to renderSuccess", () => {
    const renderSuccess = vi.fn().mockReturnValue(null);
    render(<UnifiedNfcScanner {...defaultProps({ renderSuccess })} />);
    const ctx = renderSuccess.mock.calls[0][0];
    expect(ctx.phase).toBe("success");
    expect(ctx.defaultContent).toBeDefined();
  });
});

describe("UnifiedNfcScanner - error phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHook(
      {
        phase: "error",
        error: { message: "Scan failed", recoverable: true, code: "SCAN_FAILED" },
      },
      true,
    );
  });

  it("shows XCircle icon for non-tamper error", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByTestId("icon-x-circle")).toBeDefined();
  });

  it("shows error message", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByText("Scan failed")).toBeDefined();
  });

  it("shows retry button for recoverable error", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByRole("button", { name: DEFAULT_LABELS.retry })).toBeDefined();
  });

  it("calls reset and scan when retry clicked", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    screen.getByRole("button", { name: DEFAULT_LABELS.retry }).click();
    expect(mockReset).toHaveBeenCalledOnce();
    expect(mockScan).toHaveBeenCalledOnce();
  });

  it("shows skip button when allowSkip=true", () => {
    render(<UnifiedNfcScanner {...defaultProps({ allowSkip: true })} />);
    expect(screen.getByRole("button", { name: DEFAULT_LABELS.skip })).toBeDefined();
  });

  it("calls onSkip and reset when skip clicked", () => {
    const onSkip = vi.fn();
    render(<UnifiedNfcScanner {...defaultProps({ allowSkip: true, onSkip })} />);
    screen.getByRole("button", { name: DEFAULT_LABELS.skip }).click();
    expect(onSkip).toHaveBeenCalledOnce();
    expect(mockReset).toHaveBeenCalledOnce();
  });

  it("does not show retry button for non-recoverable error", () => {
    setupHook(
      {
        phase: "error",
        error: { message: "Fatal", recoverable: false, code: "FATAL" },
      },
      true,
    );
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.queryByRole("button", { name: DEFAULT_LABELS.retry })).toBeNull();
  });

  it("shows AlertTriangle and tamperDetected label when tamperDetected=true", () => {
    setupHook({ phase: "error", tamperDetected: true, error: null }, true);
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByTestId("icon-alert-triangle")).toBeDefined();
    expect(screen.getByText(DEFAULT_LABELS.tamperDetected)).toBeDefined();
  });

  it("shows fix card button when tamperDetected and onFixCard provided", () => {
    const onFixCard = vi.fn();
    setupHook({ phase: "error", tamperDetected: true, error: null }, true);
    render(<UnifiedNfcScanner {...defaultProps({ onFixCard })} />);
    expect(screen.getByRole("button", { name: DEFAULT_LABELS.fixCard })).toBeDefined();
  });

  it("calls onFixCard when fix card button clicked", () => {
    const onFixCard = vi.fn();
    setupHook(
      {
        phase: "error",
        tamperDetected: true,
        error: null,
        rawResult: { serialNumber: "abc", classification: "tampered", raw: new Uint8Array(0) },
      },
      true,
    );
    render(<UnifiedNfcScanner {...defaultProps({ onFixCard })} />);
    screen.getByRole("button", { name: DEFAULT_LABELS.fixCard }).click();
    expect(onFixCard).toHaveBeenCalledOnce();
  });

  it("uses custom renderError when provided", () => {
    const renderError = vi.fn().mockReturnValue(<div data-testid="custom-error" />);
    render(<UnifiedNfcScanner {...defaultProps({ renderError })} />);
    expect(screen.getByTestId("custom-error")).toBeDefined();
  });

  it("passes onRetry, onSkip, onFixCard to renderError", () => {
    const renderError = vi.fn().mockReturnValue(null);
    render(<UnifiedNfcScanner {...defaultProps({ renderError })} />);
    const ctx = renderError.mock.calls[0][0];
    expect(typeof ctx.onRetry).toBe("function");
    expect(typeof ctx.onSkip).toBe("function");
    expect(typeof ctx.onFixCard).toBe("function");
  });
});

describe("UnifiedNfcScanner - ready phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHook({ phase: "ready", classification: "valid_payload" }, true);
  });

  it("renders CardInfoDisplay in ready phase", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByTestId("card-info-display")).toBeDefined();
  });

  it("renders ActionButtons in ready phase", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByTestId("action-buttons")).toBeDefined();
  });

  it("uses custom renderReady when provided", () => {
    const renderReady = vi.fn().mockReturnValue(<div data-testid="custom-ready" />);
    render(<UnifiedNfcScanner {...defaultProps({ renderReady })} />);
    expect(screen.getByTestId("custom-ready")).toBeDefined();
  });

  it("passes defaultCardInfo and defaultActions to renderReady", () => {
    const renderReady = vi.fn().mockReturnValue(null);
    render(<UnifiedNfcScanner {...defaultProps({ renderReady })} />);
    const ctx = renderReady.mock.calls[0][0];
    expect(ctx.defaultCardInfo).toBeDefined();
    expect(ctx.defaultActions).toBeDefined();
  });
});

describe("UnifiedNfcScanner - write_pending_retry phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHook({ phase: "write_pending_retry" }, true);
  });

  it("shows write pending retry message", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByText("Penulisan gagal - kartu dipindahkan terlalu cepat")).toBeDefined();
  });

  it("shows Tap Ulang Kartu button", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByRole("button", { name: "Tap ulang kartu" })).toBeDefined();
  });

  it("calls retryWrite when Tap Ulang Kartu clicked", () => {
    mockRetryWrite.mockResolvedValue(true);
    render(<UnifiedNfcScanner {...defaultProps()} />);
    screen.getByRole("button", { name: "Tap ulang kartu" }).click();
    expect(mockRetryWrite).toHaveBeenCalledOnce();
  });

  it("shows cancel button in write_pending_retry phase", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByRole("button", { name: DEFAULT_LABELS.cancel })).toBeDefined();
  });

  it("shows data corruption warning", () => {
    render(<UnifiedNfcScanner {...defaultProps()} />);
    expect(screen.getByText(/Membatalkan saat ini/)).toBeDefined();
  });
});

describe("UnifiedNfcScanner - showRawData", () => {
  it("shows RawDataInspector when showRawData=true and rawResult exists", () => {
    setupHook(
      {
        phase: "idle",
        rawResult: { serialNumber: "abc", classification: "blank", raw: new Uint8Array(0) },
      },
      true,
    );
    render(<UnifiedNfcScanner {...defaultProps({ showRawData: true })} />);
    expect(screen.getByTestId("raw-data-inspector")).toBeDefined();
  });

  it("does not show RawDataInspector when showRawData=false", () => {
    setupHook(
      {
        phase: "idle",
        rawResult: { serialNumber: "abc", classification: "blank", raw: new Uint8Array(0) },
      },
      true,
    );
    render(<UnifiedNfcScanner {...defaultProps({ showRawData: false })} />);
    expect(document.querySelector("[data-testid='raw-data-inspector']")).toBeNull();
  });

  it("does not show RawDataInspector when rawResult is null", () => {
    setupHook({ phase: "idle", rawResult: null }, true);
    render(<UnifiedNfcScanner {...defaultProps({ showRawData: true })} />);
    expect(document.querySelector("[data-testid='raw-data-inspector']")).toBeNull();
  });
});

describe("UnifiedNfcScanner - drawer mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHook({ phase: "idle" }, true);
  });

  it("renders Drawer when displayMode=drawer and open=true", () => {
    render(<UnifiedNfcScanner displayMode="drawer" open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("drawer")).toBeDefined();
  });

  it("does not render Drawer when open=false", () => {
    render(<UnifiedNfcScanner displayMode="drawer" open={false} onOpenChange={vi.fn()} />);
    expect(document.querySelector("[data-testid='drawer']")).toBeNull();
  });

  it("calls onOpenChange and onClose when drawer closes", () => {
    const onOpenChange = vi.fn();
    const onClose = vi.fn();
    render(
      <UnifiedNfcScanner
        displayMode="drawer"
        open={true}
        onOpenChange={onOpenChange}
        onClose={onClose}
      />,
    );
    // Simulate drawer close by clicking the drawer (our mock triggers onOpenChange(false))
    screen.getByTestId("drawer").click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders renderHeader content when provided", () => {
    const renderHeader = vi.fn().mockReturnValue(<div data-testid="custom-header" />);
    render(
      <UnifiedNfcScanner
        displayMode="drawer"
        open={true}
        onOpenChange={vi.fn()}
        renderHeader={renderHeader}
      />,
    );
    expect(screen.getByTestId("custom-header")).toBeDefined();
  });

  it("renders renderFooter content when provided", () => {
    const renderFooter = vi.fn().mockReturnValue(<div data-testid="custom-footer" />);
    render(
      <UnifiedNfcScanner
        displayMode="drawer"
        open={true}
        onOpenChange={vi.fn()}
        renderFooter={renderFooter}
      />,
    );
    expect(screen.getByTestId("custom-footer")).toBeDefined();
  });

  it("passes onClose and onRetry to renderFooter", () => {
    const renderFooter = vi.fn().mockReturnValue(null);
    render(
      <UnifiedNfcScanner
        displayMode="drawer"
        open={true}
        onOpenChange={vi.fn()}
        renderFooter={renderFooter}
      />,
    );
    const ctx = renderFooter.mock.calls[0][0];
    expect(typeof ctx.onClose).toBe("function");
    expect(typeof ctx.onRetry).toBe("function");
  });

  it("passes labels to renderHeader", () => {
    const renderHeader = vi.fn().mockReturnValue(null);
    render(
      <UnifiedNfcScanner
        displayMode="drawer"
        open={true}
        onOpenChange={vi.fn()}
        renderHeader={renderHeader}
      />,
    );
    const ctx = renderHeader.mock.calls[0][0];
    expect(ctx.labels).toBeDefined();
    expect(ctx.labels.idle).toBe(DEFAULT_LABELS.idle);
  });
});

describe("UnifiedNfcScanner - auto-scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHook({ phase: "idle" }, true);
  });

  it("calls scan on mount in inline mode when autoScan=true", async () => {
    render(<UnifiedNfcScanner displayMode="inline" autoScan={true} />);
    await waitFor(() => expect(mockScan).toHaveBeenCalledOnce());
  });

  it("does not call scan when autoScan=false (default)", () => {
    render(<UnifiedNfcScanner displayMode="inline" />);
    expect(mockScan).not.toHaveBeenCalled();
  });

  it("does not call scan when NFC not supported", () => {
    setupHook({ phase: "idle" }, false);
    render(<UnifiedNfcScanner displayMode="inline" autoScan={true} />);
    expect(mockScan).not.toHaveBeenCalled();
  });

  it("calls scan when drawer opens with autoScan=true", async () => {
    render(
      <UnifiedNfcScanner displayMode="drawer" open={true} onOpenChange={vi.fn()} autoScan={true} />,
    );
    await waitFor(() => expect(mockScan).toHaveBeenCalledOnce());
  });
});

describe("UnifiedNfcScanner - auto-close on success", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupHook({ phase: "success" }, true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onOpenChange(false) and onClose after autoCloseDelay", async () => {
    const onOpenChange = vi.fn();
    const onClose = vi.fn();
    render(
      <UnifiedNfcScanner
        displayMode="drawer"
        open={true}
        onOpenChange={onOpenChange}
        onClose={onClose}
        autoCloseOnSuccess={true}
        autoCloseDelay={1000}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not auto-close in inline mode", () => {
    const onClose = vi.fn();
    render(
      <UnifiedNfcScanner
        displayMode="inline"
        autoCloseOnSuccess={true}
        autoCloseDelay={500}
        onClose={onClose}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not auto-close when autoCloseOnSuccess=false", () => {
    const onOpenChange = vi.fn();
    render(
      <UnifiedNfcScanner
        displayMode="drawer"
        open={true}
        onOpenChange={onOpenChange}
        autoCloseOnSuccess={false}
        autoCloseDelay={500}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("UnifiedNfcScanner - continuous scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupHook({ phase: "success" }, true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows countdown when continuousScan=true in success phase", () => {
    render(
      <UnifiedNfcScanner displayMode="inline" continuousScan={true} continuousScanDelay={3000} />,
    );
    // Countdown starts at 3
    expect(screen.getByText(/3 detik/)).toBeDefined();
  });

  it("shows Scan Sekarang button during countdown", () => {
    render(
      <UnifiedNfcScanner displayMode="inline" continuousScan={true} continuousScanDelay={3000} />,
    );
    expect(screen.getByRole("button", { name: DEFAULT_LABELS.scanNow })).toBeDefined();
  });

  it("calls reset and scan when Scan Sekarang clicked", () => {
    render(
      <UnifiedNfcScanner displayMode="inline" continuousScan={true} continuousScanDelay={3000} />,
    );
    screen.getByRole("button", { name: DEFAULT_LABELS.scanNow }).click();
    expect(mockReset).toHaveBeenCalledOnce();
    expect(mockScan).toHaveBeenCalledOnce();
  });

  it("auto-resets after continuousScanDelay", () => {
    render(
      <UnifiedNfcScanner displayMode="inline" continuousScan={true} continuousScanDelay={2000} />,
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(mockReset).toHaveBeenCalledOnce();
    expect(mockScan).toHaveBeenCalledOnce();
  });

  it("does not show countdown when continuousScan=false", () => {
    render(<UnifiedNfcScanner displayMode="inline" continuousScan={false} />);
    expect(screen.queryByText(/detik/)).toBeNull();
  });
});

describe("UnifiedNfcScanner - custom labels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHook({ phase: "scanning" }, true);
  });

  it("merges custom labels with defaults", () => {
    render(<UnifiedNfcScanner displayMode="inline" labels={{ cancel: "Batalkan Sekarang" }} />);
    expect(screen.getByRole("button", { name: "Batalkan Sekarang" })).toBeDefined();
  });
});

describe("UnifiedNfcScanner - useUnifiedNfc wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHook({ phase: "idle" }, true);
  });

  it("passes sessionGrant, tenantId, terminalId, scanMode to useUnifiedNfc", () => {
    const sessionGrant = { keyVersion: 1 } as never;
    render(
      <UnifiedNfcScanner
        displayMode="inline"
        sessionGrant={sessionGrant}
        tenantId="t-1"
        terminalId={5}
        scanMode="raw"
      />,
    );
    expect(mockUseUnifiedNfc).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionGrant,
        tenantId: "t-1",
        terminalId: 5,
        scanMode: "raw",
      }),
    );
  });

  it("passes onRawScan, onCardRead, onWriteSuccess, onError callbacks", () => {
    const onRawScan = vi.fn();
    const onCardRead = vi.fn();
    const onWriteSuccess = vi.fn();
    const onError = vi.fn();
    render(
      <UnifiedNfcScanner
        displayMode="inline"
        onRawScan={onRawScan}
        onCardRead={onCardRead}
        onWriteSuccess={onWriteSuccess}
        onError={onError}
      />,
    );
    expect(mockUseUnifiedNfc).toHaveBeenCalledWith(
      expect.objectContaining({ onRawScan, onCardRead, onWriteSuccess, onError }),
    );
  });
});
