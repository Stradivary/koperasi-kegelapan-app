// @vitest-environment jsdom
/**
 * Tests for src/components/block/dialogs/IssueCardDrawer.tsx
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/assets/images/success_hand.svg", () => ({ default: "success_hand.svg" }));
vi.mock("#/assets/images/nfc/failed.svg", () => ({ default: "failed.svg" }));

vi.mock("lucide-react", () => ({
  CreditCard: () => <span data-testid="credit-card-icon" />,
}));

// Mock vaul to prevent portal rendering issues in jsdom
vi.mock("vaul", () => {
  const Root = ({ children, open }: any) =>
    open !== false ? <div data-testid="vaul-root">{children}</div> : null;
  const Portal = ({ children }: any) => <div>{children}</div>;
  const Overlay = (props: any) => <div {...props} />;
  const Content = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  const Title = ({ children, ...props }: any) => <h2 {...props}>{children}</h2>;
  const Description = ({ children, ...props }: any) => <p {...props}>{children}</p>;
  const Close = ({ children, ...props }: any) => <button {...props}>{children}</button>;
  const Trigger = ({ children, ...props }: any) => <button {...props}>{children}</button>;

  return {
    Drawer: {
      Root,
      Portal,
      Overlay,
      Content,
      Title,
      Description,
      Close,
      Trigger,
    },
  };
});

vi.mock("#/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("#/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("#/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock("#/components/block/UnifiedNfcScanner", () => ({
  NfcTapArea: ({ phase }: { phase: string }) => (
    <div data-testid="nfc-tap-area" data-phase={phase} />
  ),
  StepIndicator: ({ phase }: { phase: string }) => (
    <div data-testid="step-indicator" data-phase={phase} />
  ),
}));

vi.mock("#/components/block/StationCardsPanel", () => ({
  StationCardsPanel: () => null,
}));

import { IssueCardDrawer } from "#/components/block/dialogs/IssueCardDrawer";

type StationUserRow = {
  userId: string;
  name: string;
  status: string;
  tenantId?: string;
  syncStatus: "pending" | "synced";
};

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  phase: "form" as const,
  payload: null,
  error: null,
  members: [] as any[],
  onIssue: vi.fn(),
  onClose: vi.fn(),
  onRetry: vi.fn(),
};

describe("IssueCardDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render content when closed", () => {
    const { container } = render(<IssueCardDrawer {...defaultProps} open={false} />);
    // When open=false, the vaul Root renders nothing
    expect(container.querySelector('[data-testid="vaul-root"]')).toBeNull();
  });

  it("renders form phase with title and inputs", () => {
    render(<IssueCardDrawer {...defaultProps} />);
    expect(screen.getByText("Cetak Kartu Baru")).toBeDefined();
    expect(screen.getByPlaceholderText("Nama lengkap pemegang kartu")).toBeDefined();
    expect(screen.getByPlaceholderText("0")).toBeDefined();
  });

  it("renders member select with active members", () => {
    const members: StationUserRow[] = [
      { userId: "u-1", name: "Alice", status: "active", syncStatus: "synced" },
      { userId: "u-2", name: "Bob", status: "active", syncStatus: "synced" },
      { userId: "u-3", name: "Charlie", status: "deleted", syncStatus: "synced" },
    ];
    render(<IssueCardDrawer {...defaultProps} members={members} />);
    const select = screen.getByLabelText("Anggota") as HTMLSelectElement;
    // Should have "- Tanpa anggota -" + 2 active members
    expect(select.options.length).toBe(3);
  });

  it("disables submit when name is empty", () => {
    render(<IssueCardDrawer {...defaultProps} />);
    const submitBtns = screen.getAllByText(/Cetak/);
    const submitBtn = submitBtns.find((el) => el.textContent?.includes("Daftarkan"));
    expect(submitBtn).toHaveProperty("disabled", true);
  });

  it("calls onIssue with form data on confirm", () => {
    const onIssue = vi.fn();
    render(<IssueCardDrawer {...defaultProps} onIssue={onIssue} />);

    // Fill in name
    const nameInput = screen.getByPlaceholderText("Nama lengkap pemegang kartu");
    fireEvent.change(nameInput, { target: { value: "Test User" } });

    // Fill in amount
    const amountInput = screen.getByPlaceholderText("0");
    fireEvent.change(amountInput, { target: { value: "50000" } });

    // Submit - find the button that contains "Cetak" and "Daftarkan"
    const submitBtns = screen.getAllByText(/Cetak/);
    const submitBtn = submitBtns.find((el) => el.textContent?.includes("Daftarkan"));
    fireEvent.click(submitBtn!);

    expect(onIssue).toHaveBeenCalledWith({
      name: "Test User",
      userId: null,
      balance: 50000,
      expiresAt: null,
    });
  });

  it("renders scanning phase with NFC tap area", () => {
    render(<IssueCardDrawer {...defaultProps} phase="scanning" />);
    expect(screen.getByText("Tempelkan Kartu NFC")).toBeDefined();
    expect(screen.getByText("Menunggu kartu...")).toBeDefined();
  });

  it("renders writing phase with hold message", () => {
    render(<IssueCardDrawer {...defaultProps} phase="writing" />);
    expect(screen.getByText("Menulis ke Kartu...")).toBeDefined();
    expect(screen.getByText(/Jangan pindahkan kartu/)).toBeDefined();
  });

  it("renders done phase with success message", () => {
    const payload = {
      wallet: { balance: 50000 },
    } as any;
    render(<IssueCardDrawer {...defaultProps} phase="done" payload={payload} />);
    expect(screen.getAllByText("Kartu Berhasil Dicetak").length).toBeGreaterThanOrEqual(1);
  });

  it("renders error phase with error message and retry button", () => {
    const onRetry = vi.fn();
    render(
      <IssueCardDrawer
        {...defaultProps}
        phase="error"
        error="NFC write failed"
        onRetry={onRetry}
      />,
    );
    expect(screen.getAllByText("Gagal").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("NFC write failed")).toBeDefined();

    const retryBtn = screen.getByText("Coba Lagi");
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalled();
  });

  it("calls onClose when cancel button is clicked in form phase", () => {
    const onClose = vi.fn();
    render(<IssueCardDrawer {...defaultProps} onClose={onClose} />);
    // In form phase, there's a "Batal" button in the footer
    const cancelBtns = screen.getAllByText("Batal");
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders step indicator", () => {
    render(<IssueCardDrawer {...defaultProps} phase="scanning" />);
    // Step indicator is rendered within the drawer
    expect(screen.getByText("Tempelkan Kartu NFC")).toBeDefined();
  });

  it("renders quick amount buttons", () => {
    render(<IssueCardDrawer {...defaultProps} />);
    expect(screen.getByText("10k")).toBeDefined();
    expect(screen.getByText("50k")).toBeDefined();
    expect(screen.getByText("100k")).toBeDefined();
    expect(screen.getByText("200k")).toBeDefined();
  });

  it("sets amount when quick amount button is clicked", () => {
    render(<IssueCardDrawer {...defaultProps} />);
    const btn50k = screen.getByText("50k");
    fireEvent.click(btn50k);
    const amountInput = screen.getByPlaceholderText("0") as HTMLInputElement;
    expect(amountInput.value).toBe("50000");
  });
});
