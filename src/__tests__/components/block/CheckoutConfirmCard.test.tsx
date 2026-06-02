// @vitest-environment jsdom
/**
 * Tests for src/components/block/CheckoutConfirmCard.tsx
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/presentation/components/block/CardStatusBadge", () => ({
  CardStatusBadge: ({ status }: { status: number }) => (
    <span data-testid="status-badge">{status}</span>
  ),
}));

vi.mock("#/presentation/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("#/presentation/lib/formatters", () => ({
  formatTime: (t: number) => `time:${t}`,
  formatDuration: (d: number) => `dur:${d}`,
}));

import { CheckoutConfirmCard } from "#/presentation/components/block/CheckoutConfirmCard";
import type { CardPayload } from "#/presentation/hooks/types";

const mockPayload = {
  identity: { name: "Budi", status: 0, userId: "u-1", createdAt: 0 },
  wallet: { balance: 100000, counter: 5n, state: 0 },
  session: { startTime: 1700000000 },
  header: { cardId: new Uint8Array(6), version: 2 },
  trailer: {
    expiresAt: 0,
    keyVersion: 1,
    activePtr: 0,
    counterBind: 0n,
    hmac: new Uint8Array(8),
    rootHash: new Uint8Array(4),
  },
  logEntries: [],
} as unknown as CardPayload;

describe("CheckoutConfirmCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders member name", () => {
    render(
      <CheckoutConfirmCard
        payload={mockPayload}
        durationSeconds={3600}
        fee={5000}
        onConfirm={vi.fn()}
        phase="ready"
      />,
    );
    expect(screen.getByText("Budi")).toBeDefined();
  });

  it("renders formatted duration", () => {
    render(
      <CheckoutConfirmCard
        payload={mockPayload}
        durationSeconds={3600}
        fee={5000}
        onConfirm={vi.fn()}
        phase="ready"
      />,
    );
    expect(screen.getByText("dur:3600")).toBeDefined();
  });

  it("renders balance after fee deduction", () => {
    render(
      <CheckoutConfirmCard
        payload={mockPayload}
        durationSeconds={3600}
        fee={5000}
        onConfirm={vi.fn()}
        phase="ready"
      />,
    );
    // balance 100000 - fee 5000 = 95000
    expect(screen.getByText("Rp 95.000")).toBeDefined();
  });

  it("shows Konfirmasi Checkout when phase is ready", () => {
    render(
      <CheckoutConfirmCard
        payload={mockPayload}
        durationSeconds={3600}
        fee={5000}
        onConfirm={vi.fn()}
        phase="ready"
      />,
    );
    expect(screen.getByText("Konfirmasi Checkout")).toBeDefined();
  });

  it("shows Memproses... when phase is writing", () => {
    render(
      <CheckoutConfirmCard
        payload={mockPayload}
        durationSeconds={3600}
        fee={5000}
        onConfirm={vi.fn()}
        phase="writing"
      />,
    );
    expect(screen.getByText("Memproses...")).toBeDefined();
  });

  it("disables button when phase is writing", () => {
    render(
      <CheckoutConfirmCard
        payload={mockPayload}
        durationSeconds={3600}
        fee={5000}
        onConfirm={vi.fn()}
        phase="writing"
      />,
    );
    const btn = screen.getByText("Memproses...").closest("button");
    expect(btn?.disabled).toBe(true);
  });

  it("calls onConfirm when button clicked in ready phase", () => {
    const onConfirm = vi.fn();
    render(
      <CheckoutConfirmCard
        payload={mockPayload}
        durationSeconds={3600}
        fee={5000}
        onConfirm={onConfirm}
        phase="ready"
      />,
    );
    fireEvent.click(screen.getByText("Konfirmasi Checkout"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
