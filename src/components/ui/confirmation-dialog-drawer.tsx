import * as React from "react";
import { Button } from "#/components/ui/button.tsx";
import { BaseDialogDrawer } from "#/components/ui/base-dialog-drawer.tsx";

export interface ConfirmationDialogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Additional content rendered between description and footer */
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  onConfirm: () => void;
  onCancel?: () => void;
  isProcessing?: boolean;
  processingLabel?: string;
  /** Icon or media element displayed above the title */
  icon?: React.ReactNode;
}

export function ConfirmationDialogDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "default",
  onConfirm,
  onCancel,
  isProcessing = false,
  processingLabel,
  icon,
}: ConfirmationDialogDrawerProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const footer = (
    <>
      <Button variant={confirmVariant} onClick={onConfirm} disabled={isProcessing}>
        {isProcessing ? (processingLabel ?? confirmLabel) : confirmLabel}
      </Button>
      <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
        {cancelLabel}
      </Button>
    </>
  );

  return (
    <BaseDialogDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      icon={icon}
      footer={footer}
    >
      {children}
    </BaseDialogDrawer>
  );
}
