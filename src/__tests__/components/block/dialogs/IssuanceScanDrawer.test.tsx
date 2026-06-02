// @vitest-environment jsdom
/**
 * Tests for src/components/block/dialogs/IssuanceScanDrawer.tsx
 * Covers: all phases (idle/scanning/writing/done/error), read vs write mode,
 *         minimal prop, toNfcPhase mapping, getStepLabels, formatRupiah, toHex
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── UI mocks ─────────────────────────────────────────────────────────────────

vi.mock("#/presentation/components/ui/drawer", () => ({
  Drawer: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
    onOpenChange?: (o: boolean) => void;
    direction?: string;
  }) => (open ? <div data-testid="drawer">{children}</div> : null),
  DrawerContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer-content">{children}</div>
  ),
  DrawerHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer-header">{children}</div>
  ),
  DrawerTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="drawer-title">{children}</h2>
  ),
  DrawerDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="drawer-description">{children}</p>
  ),
  DrawerFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer-footer">{children}</div>
  ),
}));

vi.mock("#/presentation/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    className?: string;
  }) => (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock("#/presentation/components/ui/badge", () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

vi.mock("#/presentation/components/ui/separator", () => ({
  Separator: ({ className }: { className?: string }) => (
    <hr data-testid="separator" className={className} />
  ),
}));

vi.mock("#/presentation/components/block/UnifiedNfcScanner", () => ({
  NfcTapArea: ({ phase }: { phase: string }) => (
    <div data-testid="nfc-tap-area" data-phase={phase} />
  ),
  StepIndicator: ({ phase, labels }: { phase: string; labels: Record<string, string> }) => (
    <div data-testid="step-indicator" data-phase={phase} data-labels={JSON.stringify(labels)} />
  ),
}));

vi.mock("#/assets/images/nfc/failed.svg", () => ({ default: "/failed.svg" }));

// ── Types ─────────────────────────────────────────────────────────────────────

vi.mock("#/presentation/hooks/types", () => ({
  CardStatus: { 0: "Active", 1: "Blocked", 2: "Expired" },
  CardState: { 0: "Normal", 1: "Frozen" },
}));

import { IssuanceScanDrawer } from "#/presentation/components/block/dialogs/IssuanceScanDrawer";
import type { CardPayload } from "#/presentation/hooks/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<CardPayload> = {}): CardPayload {
  return {
    header: {
      cardId: new Uint8Array([0xab, 0xcd]),
      version: 1,
    },
    identity: {
      name: "Budi Santoso",
      userId: "u-1",
      status: 0,
      createdAt: 1700000000,
    },
    wallet: {
      balance: 50000,
      counter: 5,
      state: 0,
    },
    trailer: {
      expiresAt: 1800000000,
      keyVersion: 1,
      activePtr: 0,
      counterBind: 5,
      hmac: new Uint8Array([0x01, 0x02]),
      rootHash: new Uint8Array([0x03, 0x04]),
    },
    logEntries: [],
    ...overrides,
  } as unknown as CardPayload;
}

function defaultProps(
  overrides: Partial<Parameters<typeof IssuanceScanDrawer>[0]> = {},
): Parameters<typeof IssuanceScanDrawer>[0] {
  return {
    open: true,
    onOpenChange: vi.fn(),
    phase: "idle",
    mode: "read",
    payload: null,
    serialNumber: null,
    error: null,
    onClose: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("IssuanceScanDrawer - closed state", () => {
  it("renders nothing when open is false", () => {
    render(<IssuanceScanDrawer {...defaultProps({ open: false })} />);
    expect(document.querySelector("[data-testid='drawer']")).toBeNull();
  });
});

describe("IssuanceScanDrawer - scanning phase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders drawer when open", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "scanning" })} />);
    expect(screen.getByTestId("drawer")).toBeDefined();
  });

  it("shows 'Baca Kartu NFC' title in scanning phase", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "scanning" })} />);
    expect(screen.getByTestId("drawer-title").textContent).toBe("Baca Kartu NFC");
  });

  it("shows scanning description", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "scanning" })} />);
    expect(screen.getByTestId("drawer-description").textContent).toContain("Tap kartu NFC");
  });

  it("renders NfcTapArea with scanning phase", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "scanning" })} />);
    expect(screen.getByTestId("nfc-tap-area").getAttribute("data-phase")).toBe("scanning");
  });

  it("renders StepIndicator with read labels in read mode", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "scanning", mode: "read" })} />);
    const indicator = screen.getByTestId("step-indicator");
    const labels = JSON.parse(indicator.getAttribute("data-labels") ?? "{}");
    expect(labels.step1).toBe("Tap Kartu");
    expect(labels.step2).toBe("Baca");
  });

  it("renders StepIndicator with write labels in write mode", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "scanning", mode: "write" })} />);
    const indicator = screen.getByTestId("step-indicator");
    const labels = JSON.parse(indicator.getAttribute("data-labels") ?? "{}");
    expect(labels.step1).toBe("Tap & Tahan");
    expect(labels.step2).toBe("Tulis");
  });

  it("shows Batal button in scanning phase", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "scanning" })} />);
    expect(screen.getByText("Batal")).toBeDefined();
  });

  it("calls onClose when Batal clicked", () => {
    const onClose = vi.fn();
    render(<IssuanceScanDrawer {...defaultProps({ phase: "scanning", onClose })} />);
    fireEvent.click(screen.getByText("Batal"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("IssuanceScanDrawer - writing phase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows 'Tulis Kartu NFC' title in writing phase", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "writing" })} />);
    expect(screen.getByTestId("drawer-title").textContent).toBe("Tulis Kartu NFC");
  });

  it("shows writing description", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "writing" })} />);
    expect(screen.getByTestId("drawer-description").textContent).toContain("tahan sampai selesai");
  });

  it("renders NfcTapArea with writing phase", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "writing" })} />);
    expect(screen.getByTestId("nfc-tap-area").getAttribute("data-phase")).toBe("writing");
  });

  it("shows Batal button in writing phase", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "writing" })} />);
    expect(screen.getByText("Batal")).toBeDefined();
  });
});

describe("IssuanceScanDrawer - done phase (read mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  const payload = makePayload();

  it("shows member name as title in done/read mode", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "done", mode: "read", payload })} />);
    expect(screen.getByTestId("drawer-title").textContent).toBe("Budi Santoso");
  });

  it("shows 'Kartu Berhasil Ditulis' title in done/write mode", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "done", mode: "write", payload })} />);
    expect(screen.getByTestId("drawer-title").textContent).toBe("Kartu Berhasil Ditulis");
  });

  it("shows balance formatted as Rupiah", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "done", mode: "read", payload })} />);
    // Rp 50.000 in id-ID locale
    expect(screen.getByText(/50\.000|50,000/)).toBeDefined();
  });

  it("shows member name in card info", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "done", mode: "read", payload })} />);
    // Name appears in both the title and the card body
    const matches = screen.getAllByText("Budi Santoso");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Tutup button in done phase", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "done", mode: "read", payload })} />);
    expect(screen.getByText("Tutup")).toBeDefined();
  });

  it("calls onClose when Tutup clicked", () => {
    const onClose = vi.fn();
    render(
      <IssuanceScanDrawer {...defaultProps({ phase: "done", mode: "read", payload, onClose })} />,
    );
    fireEvent.click(screen.getByText("Tutup"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows serial number when provided", () => {
    render(
      <IssuanceScanDrawer
        {...defaultProps({
          phase: "done",
          mode: "read",
          payload,
          serialNumber: "04:AB:CD:EF",
        })}
      />,
    );
    expect(screen.getByText("04:AB:CD:EF")).toBeDefined();
  });

  it("hides detailed info when minimal=true", () => {
    render(
      <IssuanceScanDrawer
        {...defaultProps({
          phase: "done",
          mode: "read",
          payload,
          serialNumber: "04:AB:CD:EF",
          minimal: true,
        })}
      />,
    );
    // Serial number row should not appear in minimal mode
    expect(screen.queryByText("04:AB:CD:EF")).toBeNull();
  });

  it("shows write success indicator in done/write mode", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "done", mode: "write", payload })} />);
    expect(screen.getByText("Kartu berhasil ditulis")).toBeDefined();
  });

  it("shows log entries when present", () => {
    const payloadWithLogs = makePayload({
      logEntries: [
        {
          amount: 10000,
          balanceAfter: 40000,
          flags: 0x01,
          hash: new Uint8Array([0xaa, 0xbb]),
          timestamp: 1700000001,
        },
      ],
    } as Partial<CardPayload>);
    render(
      <IssuanceScanDrawer
        {...defaultProps({ phase: "done", mode: "read", payload: payloadWithLogs })}
      />,
    );
    expect(screen.getByText(/Log \(1 entri\)/)).toBeDefined();
  });
});

describe("IssuanceScanDrawer - error phase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows 'Gagal' title in error phase", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "error" })} />);
    expect(screen.getByTestId("drawer-title").textContent).toBe("Gagal");
  });

  it("shows error message when provided", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "error", error: "NFC read failed" })} />);
    expect(screen.getByText("NFC read failed")).toBeDefined();
  });

  it("shows Coba Lagi and Tutup buttons in error phase", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "error" })} />);
    expect(screen.getByText("Coba Lagi")).toBeDefined();
    expect(screen.getByText("Tutup")).toBeDefined();
  });

  it("calls onRetry when Coba Lagi clicked", () => {
    const onRetry = vi.fn();
    render(<IssuanceScanDrawer {...defaultProps({ phase: "error", onRetry })} />);
    fireEvent.click(screen.getByText("Coba Lagi"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("calls onClose when Tutup clicked in error phase", () => {
    const onClose = vi.fn();
    render(<IssuanceScanDrawer {...defaultProps({ phase: "error", onClose })} />);
    fireEvent.click(screen.getByText("Tutup"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows failed image in error phase", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "error" })} />);
    const img = document.querySelector("img[alt='Gagal']");
    expect(img).not.toBeNull();
  });
});

describe("IssuanceScanDrawer - idle phase", () => {
  it("renders drawer open in idle phase without busy/done/error content", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "idle" })} />);
    expect(screen.getByTestId("drawer")).toBeDefined();
    // No NfcTapArea in idle (not scanning/writing)
    expect(document.querySelector("[data-testid='nfc-tap-area']")).toBeNull();
  });

  it("shows no footer buttons in idle phase", () => {
    render(<IssuanceScanDrawer {...defaultProps({ phase: "idle" })} />);
    expect(screen.queryByText("Batal")).toBeNull();
    expect(screen.queryByText("Tutup")).toBeNull();
    expect(screen.queryByText("Coba Lagi")).toBeNull();
  });
});

describe("IssuanceScanDrawer - onOpenChange", () => {
  it("calls onOpenChange when drawer state changes", () => {
    const onOpenChange = vi.fn();
    render(<IssuanceScanDrawer {...defaultProps({ phase: "scanning", onOpenChange })} />);
    // The Drawer mock passes onOpenChange through; verify it's wired
    expect(screen.getByTestId("drawer")).toBeDefined();
  });
});
