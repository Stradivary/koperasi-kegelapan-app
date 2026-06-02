// @vitest-environment jsdom
/**
 * Tests for src/components/block/UnifiedNfcScanner/ActionButtons.tsx
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/presentation/lib/utils", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("#/presentation/components/ui/button.tsx", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

vi.mock("#/presentation/hooks/types.ts", () => ({
  CardStatus: {
    ACTIVE: 0,
    BLOCKED_TAMPER: 1,
    BLOCKED_FRAUD: 2,
    BLOCKED_EXPIRED: 3,
    BLOCKED_ADMIN: 4,
  },
}));

import { ActionButtons } from "#/presentation/components/block/UnifiedNfcScanner/ActionButtons";
import type { CardPayload } from "#/presentation/hooks/types";

const activePayload = {
  identity: { status: 0 },
} as unknown as CardPayload;

const blockedPayload = {
  identity: { status: 1 },
} as unknown as CardPayload;

describe("ActionButtons", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null for non-empty, non-valid_payload classification", () => {
    const { container } = render(
      <ActionButtons phase="ready" classification="foreign" payload={null} isCheckedIn={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null for empty classification without onInitializeCard", () => {
    const { container } = render(
      <ActionButtons phase="ready" classification="empty" payload={null} isCheckedIn={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders initialize button for empty card with onInitializeCard", () => {
    const onInitializeCard = vi.fn();
    render(
      <ActionButtons
        phase="ready"
        classification="empty"
        payload={null}
        isCheckedIn={false}
        onInitializeCard={onInitializeCard}
      />,
    );
    const btn = screen.getByRole("button", { name: "Inisialisasi Kartu" });
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    expect(onInitializeCard).toHaveBeenCalledOnce();
  });

  it("renders checkin and checkout buttons for valid_payload active card", () => {
    render(
      <ActionButtons
        phase="ready"
        classification="valid_payload"
        payload={activePayload}
        isCheckedIn={false}
        onCheckin={vi.fn()}
        onCheckout={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Masuk" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Keluar" })).toBeDefined();
  });

  it("disables checkin when already checked in", () => {
    render(
      <ActionButtons
        phase="ready"
        classification="valid_payload"
        payload={activePayload}
        isCheckedIn={true}
        onCheckin={vi.fn()}
        onCheckout={vi.fn()}
      />,
    );
    expect((screen.getByRole("button", { name: "Masuk" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("disables checkout when not checked in", () => {
    render(
      <ActionButtons
        phase="ready"
        classification="valid_payload"
        payload={activePayload}
        isCheckedIn={false}
        onCheckin={vi.fn()}
        onCheckout={vi.fn()}
      />,
    );
    expect((screen.getByRole("button", { name: "Keluar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("disables both buttons when card is blocked", () => {
    render(
      <ActionButtons
        phase="ready"
        classification="valid_payload"
        payload={blockedPayload}
        isCheckedIn={false}
        onCheckin={vi.fn()}
        onCheckout={vi.fn()}
      />,
    );
    expect((screen.getByRole("button", { name: "Masuk" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: "Keluar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("calls onCheckin when checkin button clicked", () => {
    const onCheckin = vi.fn();
    render(
      <ActionButtons
        phase="ready"
        classification="valid_payload"
        payload={activePayload}
        isCheckedIn={false}
        onCheckin={onCheckin}
        onCheckout={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
    expect(onCheckin).toHaveBeenCalledOnce();
  });

  it("uses custom renderActions when provided", () => {
    const renderActions = vi.fn().mockReturnValue(<div data-testid="custom-actions" />);
    render(
      <ActionButtons
        phase="ready"
        classification="valid_payload"
        payload={activePayload}
        isCheckedIn={false}
        renderActions={renderActions}
      />,
    );
    expect(screen.getByTestId("custom-actions")).toBeDefined();
    expect(renderActions).toHaveBeenCalledOnce();
  });

  it("uses custom labels", () => {
    render(
      <ActionButtons
        phase="ready"
        classification="valid_payload"
        payload={activePayload}
        isCheckedIn={false}
        onCheckin={vi.fn()}
        onCheckout={vi.fn()}
        labels={{ checkin: "Check In", checkout: "Check Out" }}
      />,
    );
    expect(screen.getByRole("button", { name: "Check In" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Check Out" })).toBeDefined();
  });
});
