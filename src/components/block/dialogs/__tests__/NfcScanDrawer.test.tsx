// @vitest-environment jsdom
/**
 * Tests for NfcScanDrawer.tsx
 * Covers: all phases (scanning, ready, writing, success, error),
 *         check-in/out buttons, sync mode, tamper detection, footer actions
 */
import { createElement } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { CardPayload } from "#/core/payload/types";
import { CardStatus } from "#/core/payload/types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("#/assets/images/landing/success_phone.png", () => ({ default: "success.png" }));
vi.mock("#/assets/images/nfc/failed.svg", () => ({ default: "failed.svg" }));
vi.mock("#/assets/images/nfc/tamper.svg", () => ({ default: "tamper.svg" }));

vi.mock("../../../ui/drawer", () => ({
  Drawer: ({ children, open }: any) =>
    open ? createElement("div", { "data-testid": "drawer" }, children) : null,
  DrawerContent: ({ children }: any) =>
    createElement("div", { "data-testid": "drawer-content" }, children),
  DrawerHeader: ({ children }: any) =>
    createElement("div", { "data-testid": "drawer-header" }, children),
  DrawerTitle: ({ children }: any) =>
    createElement("h2", { "data-testid": "drawer-title" }, children),
  DrawerDescription: ({ children, asChild: _asc }: any) =>
    createElement("div", { "data-testid": "drawer-description" }, children),
  DrawerFooter: ({ children }: any) =>
    createElement("div", { "data-testid": "drawer-footer" }, children),
}));

vi.mock("../../../ui/button", () => ({
  Button: ({ children, onClick, disabled, variant, className }: any) =>
    createElement(
      "button",
      { onClick, disabled, "data-variant": variant, "data-testid": "button", className },
      children,
    ),
}));

vi.mock("../../CardStatusBadge", () => ({
  CardStatusBadge: ({ status }: any) =>
    createElement("span", { "data-testid": "card-status-badge" }, `status-${status}`),
}));

vi.mock("../../UnifiedNfcScanner", () => ({
  NfcTapArea: ({ phase }: any) =>
    createElement("div", { "data-testid": "nfc-tap-area", "data-phase": phase }),
  StepIndicator: ({ phase }: any) =>
    createElement("div", { "data-testid": "step-indicator", "data-phase": phase }),
}));

import { NfcScanDrawer } from "../NfcScanDrawer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePayload(overrides?: Partial<CardPayload>): CardPayload {
  return {
    header: {
      magic: 0,
      version: 4,
      type: 0,
      cardId: new Uint8Array(6),
      tenantBind: new Uint8Array(4),
    },
    identity: {
      name: "Test User",
      userId: "u-1",
      gender: 0,
      status: CardStatus.ACTIVE,
      createdAt: 1000,
    },
    wallet: {
      balance: 50000,
      lastBalance: 40000,
      counter: 5n,
      lastTimestamp: 1000,
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
    ...overrides,
  } as CardPayload;
}

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  phase: "scanning" as const,
  payload: null as CardPayload | null,
  isCheckedIn: false,
  error: null as string | null,
  tamperDetected: false,
  onCheckin: vi.fn(),
  onCheckout: vi.fn(),
  onClose: vi.fn(),
  onRetry: vi.fn(),
};

afterEach(() => {
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("NfcScanDrawer - closed state", () => {
  it("does not render when open=false", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, open: false }));
    expect(screen.queryByTestId("drawer")).toBeNull();
  });
});

describe("NfcScanDrawer - scanning phase", () => {
  it("renders drawer title 'Scan Kartu NFC'", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "scanning" }));
    expect(screen.getByText("Scan Kartu NFC")).toBeDefined();
  });

  it("renders NfcTapArea", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "scanning" }));
    expect(screen.getByTestId("nfc-tap-area")).toBeDefined();
  });

  it("renders description text", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "scanning" }));
    expect(screen.getByText("Dekatkan kartu NFC ke perangkat")).toBeDefined();
  });

  it("renders Batalkan button in footer", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "scanning" }));
    expect(screen.getByText("Batalkan")).toBeDefined();
  });

  it("calls onClose when Batalkan clicked", () => {
    const onClose = vi.fn();
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "scanning", onClose }));
    fireEvent.click(screen.getByText("Batalkan"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("NfcScanDrawer - validating phase", () => {
  it("renders NfcTapArea (same as scanning)", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "validating" }));
    expect(screen.getByTestId("nfc-tap-area")).toBeDefined();
  });
});

describe("NfcScanDrawer - ready phase", () => {
  it("renders card name as title", () => {
    const payload = makePayload();
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "ready", payload }));
    expect(screen.getByText("Test User")).toBeDefined();
  });

  it("renders balance in Rupiah format", () => {
    const payload = makePayload();
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "ready", payload }));
    // Should contain "50.000" (Indonesian format)
    const balanceEl = screen.getByText(/50\.000/);
    expect(balanceEl).toBeDefined();
  });

  it("renders Masuk and Keluar buttons", () => {
    const payload = makePayload();
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "ready", payload }));
    expect(screen.getByText("Masuk")).toBeDefined();
    expect(screen.getByText("Keluar")).toBeDefined();
  });

  it("disables Masuk when isCheckedIn=true", () => {
    const payload = makePayload();
    render(
      createElement(NfcScanDrawer, { ...defaultProps, phase: "ready", payload, isCheckedIn: true }),
    );
    const masukBtn = screen.getByText("Masuk").closest("button");
    expect(masukBtn?.disabled).toBe(true);
  });

  it("disables Keluar when isCheckedIn=false", () => {
    const payload = makePayload();
    render(
      createElement(NfcScanDrawer, {
        ...defaultProps,
        phase: "ready",
        payload,
        isCheckedIn: false,
      }),
    );
    const keluarBtn = screen.getByText("Keluar").closest("button");
    expect(keluarBtn?.disabled).toBe(true);
  });

  it("calls onCheckin when Masuk clicked", () => {
    const onCheckin = vi.fn();
    const payload = makePayload();
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "ready", payload, onCheckin }));
    fireEvent.click(screen.getByText("Masuk"));
    expect(onCheckin).toHaveBeenCalled();
  });

  it("calls onCheckout when Keluar clicked", () => {
    const onCheckout = vi.fn();
    const payload = makePayload();
    render(
      createElement(NfcScanDrawer, {
        ...defaultProps,
        phase: "ready",
        payload,
        isCheckedIn: true,
        onCheckout,
      }),
    );
    fireEvent.click(screen.getByText("Keluar"));
    expect(onCheckout).toHaveBeenCalled();
  });

  it("disables buttons when card is blocked", () => {
    const payload = makePayload({
      identity: {
        name: "Blocked",
        userId: "u-1",
        gender: 0,
        status: CardStatus.BLOCKED_ADMIN,
        createdAt: 1000,
      },
    });
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "ready", payload }));
    const masukBtn = screen.getByText("Masuk").closest("button");
    expect(masukBtn?.disabled).toBe(true);
  });

  it("renders CardStatusBadge", () => {
    const payload = makePayload();
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "ready", payload }));
    expect(screen.getByTestId("card-status-badge")).toBeDefined();
  });

  it("shows 'Belum Masuk' when not checked in", () => {
    const payload = makePayload();
    render(
      createElement(NfcScanDrawer, {
        ...defaultProps,
        phase: "ready",
        payload,
        isCheckedIn: false,
      }),
    );
    expect(screen.getByText("Belum Masuk")).toBeDefined();
  });

  it("shows 'Sudah Masuk' when checked in", () => {
    const payload = makePayload();
    render(
      createElement(NfcScanDrawer, { ...defaultProps, phase: "ready", payload, isCheckedIn: true }),
    );
    expect(screen.getByText("Sudah Masuk")).toBeDefined();
  });
});

describe("NfcScanDrawer - ready phase (sync mode)", () => {
  it("renders sync info instead of check-in/out buttons", () => {
    const payload = makePayload();
    render(
      createElement(NfcScanDrawer, {
        ...defaultProps,
        phase: "ready",
        payload,
        syncMode: true,
        syncSuccess: true,
      }),
    );
    expect(screen.getByText("Data kartu disinkronkan")).toBeDefined();
    expect(screen.queryByText("Masuk")).toBeNull();
  });

  it("shows 'Menyinkronkan...' when syncSuccess=false", () => {
    const payload = makePayload();
    render(
      createElement(NfcScanDrawer, {
        ...defaultProps,
        phase: "ready",
        payload,
        syncMode: true,
        syncSuccess: false,
      }),
    );
    expect(screen.getByText("Menyinkronkan...")).toBeDefined();
  });

  it("renders name and wallet state in sync mode", () => {
    const payload = makePayload();
    render(
      createElement(NfcScanDrawer, { ...defaultProps, phase: "ready", payload, syncMode: true }),
    );
    // Name appears in title and in the grid
    expect(screen.getAllByText("Test User").length).toBeGreaterThan(0);
    expect(screen.getByText("Idle")).toBeDefined();
  });
});

describe("NfcScanDrawer - writing phase", () => {
  it("renders title 'Tulis Kartu'", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "writing" }));
    expect(screen.getByText("Tulis Kartu")).toBeDefined();
  });

  it("renders NfcTapArea", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "writing" }));
    expect(screen.getByTestId("nfc-tap-area")).toBeDefined();
  });

  it("renders description about holding card", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "writing" }));
    expect(screen.getByText(/Tap kartu lagi/)).toBeDefined();
  });
});

describe("NfcScanDrawer - success phase", () => {
  it("renders title 'Berhasil!'", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "success" }));
    const title = screen.getByTestId("drawer-title");
    expect(title.textContent).toContain("Berhasil");
  });

  it("renders success image", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "success" }));
    const img = screen.getByAltText("Berhasil");
    expect(img).toBeDefined();
  });

  it("shows Check-out Berhasil when not checked in", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "success", isCheckedIn: false }));
    expect(screen.getByText("Check-out Berhasil")).toBeDefined();
  });

  it("shows Check-in Berhasil when checked in", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "success", isCheckedIn: true }));
    expect(screen.getByText("Check-in Berhasil")).toBeDefined();
  });

  it("renders Tutup button", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "success" }));
    expect(screen.getByText("Tutup")).toBeDefined();
  });

  it("shows payload name when available", () => {
    const payload = makePayload();
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "success", payload }));
    expect(screen.getByText("Test User")).toBeDefined();
  });
});

describe("NfcScanDrawer - error phase", () => {
  it("renders title 'Gagal'", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "error" }));
    const title = screen.getByTestId("drawer-title");
    expect(title.textContent).toBe("Gagal");
  });

  it("renders error message", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "error", error: "NFC timeout" }));
    expect(screen.getByText("NFC timeout")).toBeDefined();
  });

  it("renders Coba Lagi button", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "error" }));
    expect(screen.getByText("Coba Lagi")).toBeDefined();
  });

  it("calls onRetry when Coba Lagi clicked", () => {
    const onRetry = vi.fn();
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "error", onRetry }));
    fireEvent.click(screen.getByText("Coba Lagi"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders Tutup button", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "error" }));
    expect(screen.getByText("Tutup")).toBeDefined();
  });
});

describe("NfcScanDrawer - tamper detection", () => {
  it("renders tamper image", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "error", tamperDetected: true }));
    const img = screen.getByAltText("Kartu rusak");
    expect(img).toBeDefined();
  });

  it("renders tamper warning text", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "error", tamperDetected: true }));
    expect(screen.getByText(/Kartu Terdeteksi Rusak/)).toBeDefined();
  });

  it("does not render Coba Lagi when tamper detected", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "error", tamperDetected: true }));
    expect(screen.queryByText("Coba Lagi")).toBeNull();
  });

  it("renders Perbaiki Kartu button when onFixCard provided", () => {
    const onFixCard = vi.fn();
    render(
      createElement(NfcScanDrawer, {
        ...defaultProps,
        phase: "error",
        tamperDetected: true,
        onFixCard,
      }),
    );
    expect(screen.getByText("Perbaiki Kartu")).toBeDefined();
  });

  it("calls onFixCard when Perbaiki Kartu clicked", () => {
    const onFixCard = vi.fn();
    render(
      createElement(NfcScanDrawer, {
        ...defaultProps,
        phase: "error",
        tamperDetected: true,
        onFixCard,
      }),
    );
    fireEvent.click(screen.getByText("Perbaiki Kartu"));
    expect(onFixCard).toHaveBeenCalled();
  });

  it("shows 'Hubungi petugas' when onFixCard not provided", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "error", tamperDetected: true }));
    expect(screen.getByText("Hubungi petugas")).toBeDefined();
  });
});

describe("NfcScanDrawer - step indicator", () => {
  it("renders StepIndicator with current phase", () => {
    render(createElement(NfcScanDrawer, { ...defaultProps, phase: "scanning" }));
    const indicator = screen.getByTestId("step-indicator");
    expect(indicator.getAttribute("data-phase")).toBe("scanning");
  });
});
