// @vitest-environment jsdom
/**
 * Tests for src/components/block/dialogs/CardNotBlankDrawer.tsx
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
    isProcessing,
    confirmLabel,
    cancelLabel,
    children,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
    isProcessing?: boolean;
    confirmLabel: string;
    cancelLabel: string;
    children?: React.ReactNode;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    confirmVariant?: string;
    processingLabel?: string;
    onOpenChange?: (o: boolean) => void;
  }) =>
    open ? (
      <div data-testid="dialog">
        <h2>{title}</h2>
        {children}
        <button data-testid="confirm-btn" onClick={onConfirm} disabled={isProcessing}>
          {confirmLabel}
        </button>
        <button data-testid="cancel-btn" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    ) : null,
}));

import { CardNotBlankDrawer } from "#/presentation/components/block/dialogs/CardNotBlankDrawer";

describe("CardNotBlankDrawer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when open is false", () => {
    render(
      <CardNotBlankDrawer open={false} cardSerial={null} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("renders dialog when open is true", () => {
    render(
      <CardNotBlankDrawer open={true} cardSerial={null} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId("dialog")).toBeDefined();
  });

  it("shows the title", () => {
    render(
      <CardNotBlankDrawer open={true} cardSerial={null} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText("Kartu Tidak Kosong")).toBeDefined();
  });

  it("calls onConfirm when confirm button clicked", () => {
    const onConfirm = vi.fn();
    render(
      <CardNotBlankDrawer open={true} cardSerial={null} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("confirm-btn"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button clicked", () => {
    const onCancel = vi.fn();
    render(
      <CardNotBlankDrawer open={true} cardSerial={null} onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByTestId("cancel-btn"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables confirm button when isProcessing is true", () => {
    render(
      <CardNotBlankDrawer
        open={true}
        cardSerial={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isProcessing={true}
      />,
    );
    expect((screen.getByTestId("confirm-btn") as HTMLButtonElement).disabled).toBe(true);
  });
});
