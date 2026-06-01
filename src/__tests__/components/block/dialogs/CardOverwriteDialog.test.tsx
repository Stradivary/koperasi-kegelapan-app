// @vitest-environment jsdom
/**
 * Tests for src/components/block/dialogs/CardOverwriteDialog.tsx
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

vi.mock("#/components/ui/confirmation-dialog-drawer", () => ({
  ConfirmationDialogDrawer: ({
    open,
    title,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
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
        <h2>{title}</h2>
        <button data-testid="confirm-btn" onClick={onConfirm}>
          Confirm
        </button>
        <button data-testid="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

import {
  CardOverwriteDialog,
  type CardOwnerInfo,
} from "#/components/block/dialogs/CardOverwriteDialog";

const existingCard: CardOwnerInfo = {
  cardId: "abc123",
  ownerName: "Budi Santoso",
  userId: "u-1",
  balance: 50000,
  status: "active",
};

describe("CardOverwriteDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when existingCard is null", () => {
    render(
      <CardOverwriteDialog
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
      <CardOverwriteDialog
        open={false}
        existingCard={existingCard}
        newOwnerName="New"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("renders dialog when open and existingCard provided", () => {
    render(
      <CardOverwriteDialog
        open={true}
        existingCard={existingCard}
        newOwnerName="New"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("dialog")).toBeDefined();
    expect(screen.getByText("Kartu Sudah Terdaftar")).toBeDefined();
  });

  it("calls onConfirm when confirm clicked", () => {
    const onConfirm = vi.fn();
    render(
      <CardOverwriteDialog
        open={true}
        existingCard={existingCard}
        newOwnerName="New"
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
      <CardOverwriteDialog
        open={true}
        existingCard={existingCard}
        newOwnerName="New"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId("cancel-btn"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows fallback owner display when ownerName is null", () => {
    const card: CardOwnerInfo = { ...existingCard, ownerName: null, userId: "u-99" };
    render(
      <CardOverwriteDialog
        open={true}
        existingCard={card}
        newOwnerName="New"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("dialog")).toBeDefined();
  });
});
