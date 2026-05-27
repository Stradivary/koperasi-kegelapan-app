// @vitest-environment jsdom
/**
 * Tests for src/components/block/dialogs/TopupDrawer.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockValidateTopup = vi.fn();

vi.mock("#/core/state-machine/engine", () => ({
  validateTopup: (...args: unknown[]) => mockValidateTopup(...args),
  MAX_TOPUP_AMOUNT: 1_000_000,
  MAX_BALANCE: 5_000_000,
}));

// Stub heavy UI components
vi.mock("../../../ui/drawer", () => ({
  Drawer: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="drawer">{children}</div> : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DrawerFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../UnifiedNfcScanner", () => ({
  NfcTapArea: () => <div data-testid="nfc-tap-area" />,
  StepIndicator: () => <div data-testid="step-indicator" />,
}));

vi.mock("../../../ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("../../../ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("../../../ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock("lucide-react", () => ({
  CreditCard: () => null,
}));

import { TopupDrawer } from "../TopupDrawer";
import type { CardPayload } from "#/core/payload/types";

function makePayload(balance = 100000): CardPayload {
  return {
    identity: { name: "Alice", userId: "u-1", gender: 0, status: 1, createdAt: 1000 },
    wallet: {
      balance,
      lastBalance: balance,
      counter: 5n,
      lastTimestamp: 1700000000,
      state: 0,
      flags: 0,
    },
    header: {
      magic: 0,
      version: 1,
      type: 0,
      cardId: new Uint8Array(6),
      tenantBind: new Uint8Array(4),
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

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  phase: "scanning" as const,
  payload: null,
  error: null,
  onTopup: vi.fn(),
  onClose: vi.fn(),
  onRetry: vi.fn(),
};

describe("TopupDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateTopup.mockReturnValue({ valid: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<TopupDrawer {...defaultProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows scanning title when phase is scanning", () => {
    render(<TopupDrawer {...defaultProps} phase="scanning" />);
    expect(screen.getByText("Scan Kartu untuk Top-up")).toBeDefined();
  });

  it("shows writing title when phase is writing", () => {
    render(<TopupDrawer {...defaultProps} phase="writing" />);
    expect(screen.getByText("Menulis Top-up...")).toBeDefined();
  });

  it("shows success title when phase is success", () => {
    render(<TopupDrawer {...defaultProps} phase="success" payload={makePayload()} />);
    expect(screen.getByText("Top-up Berhasil!")).toBeDefined();
  });

  it("shows error title when phase is error", () => {
    render(<TopupDrawer {...defaultProps} phase="error" error="Gagal menulis" />);
    expect(screen.getAllByText("Gagal").length).toBeGreaterThan(0);
  });

  it("shows card name as title when phase is ready", () => {
    render(<TopupDrawer {...defaultProps} phase="ready" payload={makePayload()} />);
    expect(screen.getByText("Alice")).toBeDefined();
  });

  it("shows current balance when card is ready", () => {
    render(<TopupDrawer {...defaultProps} phase="ready" payload={makePayload(100000)} />);
    expect(screen.getByText(/100\.000/)).toBeDefined();
  });

  it("confirm button is disabled when amount is empty", () => {
    render(<TopupDrawer {...defaultProps} phase="ready" payload={makePayload()} />);
    // Find the Top-up button (the confirm button)
    const buttons = screen.getAllByRole("button");
    const confirmBtn = buttons.find((b) => b.textContent?.includes("Top-up"));
    expect(confirmBtn).toBeDefined();
    expect(confirmBtn?.hasAttribute("disabled")).toBe(true);
  });

  it("confirm button is enabled when valid amount is entered", async () => {
    render(<TopupDrawer {...defaultProps} phase="ready" payload={makePayload()} />);
    const input = screen.getByPlaceholderText("100000");
    await userEvent.type(input, "50000");

    const buttons = screen.getAllByRole("button");
    const confirmBtn = buttons.find((b) => b.textContent?.includes("Top-up"));
    expect(confirmBtn?.hasAttribute("disabled")).toBe(false);
  });

  it("calls onTopup with parsed amount when confirmed", async () => {
    const onTopup = vi.fn();
    render(
      <TopupDrawer {...defaultProps} phase="ready" payload={makePayload()} onTopup={onTopup} />,
    );

    const input = screen.getByPlaceholderText("100000");
    await userEvent.type(input, "50000");

    const buttons = screen.getAllByRole("button");
    const confirmBtn = buttons.find((b) => b.textContent?.includes("Top-up"));
    await userEvent.click(confirmBtn!);

    expect(onTopup).toHaveBeenCalledWith(50000);
  });

  it("quick-select buttons set amount", async () => {
    render(<TopupDrawer {...defaultProps} phase="ready" payload={makePayload()} />);

    const btn50k = screen.getByRole("button", { name: "50k" });
    await userEvent.click(btn50k);

    const input = screen.getByPlaceholderText("100000") as HTMLInputElement;
    expect(input.value).toBe("50000");
  });

  it("shows validation error when topup is invalid", async () => {
    mockValidateTopup.mockReturnValue({ valid: false, reason: "Saldo melebihi batas" });
    render(<TopupDrawer {...defaultProps} phase="ready" payload={makePayload()} />);

    const input = screen.getByPlaceholderText("100000");
    await userEvent.type(input, "9999999");

    expect(screen.getByText("Saldo melebihi batas")).toBeDefined();
  });

  it("calls onClose when cancel button is clicked", async () => {
    const onClose = vi.fn();
    render(<TopupDrawer {...defaultProps} phase="scanning" onClose={onClose} />);

    const cancelBtn = screen.getByRole("button", { name: "Batalkan" });
    await userEvent.click(cancelBtn);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onRetry when retry button is clicked in error state", async () => {
    const onRetry = vi.fn();
    render(<TopupDrawer {...defaultProps} phase="error" error="Error" onRetry={onRetry} />);

    const retryBtn = screen.getByRole("button", { name: "Coba Lagi" });
    await userEvent.click(retryBtn);

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows error message in error state", () => {
    render(<TopupDrawer {...defaultProps} phase="error" error="NFC write failed" />);
    expect(screen.getByText("NFC write failed")).toBeDefined();
  });

  it("shows success balance in success state", () => {
    render(<TopupDrawer {...defaultProps} phase="success" payload={makePayload(150000)} />);
    expect(screen.getByText(/150\.000/)).toBeDefined();
  });
});
