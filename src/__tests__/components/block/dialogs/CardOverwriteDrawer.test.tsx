// @vitest-environment jsdom
/**
 * Tests for src/components/block/dialogs/CardOverwriteDrawer.tsx
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

vi.mock("#/presentation/components/ui/confirmation-dialog-drawer", () => ({
  ConfirmationDialogDrawer: ({
    open,
    title,
    onConfirm,
    onCancel,
    children,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
    children?: React.ReactNode;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmVariant?: string;
    isProcessing?: boolean;
    processingLabel?: string;
    onOpenChange?: (o: boolean) => void;
  }) =>
    open ? (
      <div data-testid="dialog">
        <h2 data-testid="title">{title}</h2>
        {children}
        <button data-testid="confirm-btn" onClick={onConfirm}>
          Confirm
        </button>
        <button data-testid="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

import { CardOverwriteDrawer } from "#/presentation/components/block/dialogs/CardOverwriteDrawer";
import type { CardOwnerInfo } from "#/presentation/components/block/dialogs/CardOverwriteDialog";

const existingCard: CardOwnerInfo = {
  cardId: "abc123",
  ownerName: "Budi",
  userId: "u-1",
  balance: 50000,
  status: "active",
};

describe("CardOverwriteDrawer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when existingCard is null", () => {
    render(
      <CardOverwriteDrawer
        open={true}
        existingCard={null}
        newOwnerName="New"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("renders nothing when open is false", () => {
    render(
      <CardOverwriteDrawer
        open={false}
        existingCard={existingCard}
        newOwnerName="New"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("shows overwrite title for different user", () => {
    render(
      <CardOverwriteDrawer
        open={true}
        existingCard={existingCard}
        newOwnerName="Other User"
        newUserId="u-2"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("title").textContent).toBe("Kartu Sudah Terdaftar");
  });

  it("shows reprint title for same user (same userId)", () => {
    render(
      <CardOverwriteDrawer
        open={true}
        existingCard={existingCard}
        newOwnerName="Budi"
        newUserId="u-1"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("title").textContent).toBe("Cetak Ulang Kartu");
  });

  it("shows reprint title for same name when userId is null", () => {
    const card: CardOwnerInfo = { ...existingCard, userId: null };
    render(
      <CardOverwriteDrawer
        open={true}
        existingCard={card}
        newOwnerName="Budi"
        newUserId={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("title").textContent).toBe("Cetak Ulang Kartu");
  });

  it("calls onConfirm when confirm clicked", () => {
    const onConfirm = vi.fn();
    render(
      <CardOverwriteDrawer
        open={true}
        existingCard={existingCard}
        newOwnerName="Other"
        newUserId="u-2"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("confirm-btn"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel clicked", () => {
    const onCancel = vi.fn();
    render(
      <CardOverwriteDrawer
        open={true}
        existingCard={existingCard}
        newOwnerName="Other"
        newUserId="u-2"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId("cancel-btn"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
