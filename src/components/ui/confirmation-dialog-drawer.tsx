import * as React from "react";
import { useIsMobile } from "#/hooks/use-mobile.ts";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";

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
  const isMobile = useIsMobile();

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const footerContent = (
    <>
      <Button variant={confirmVariant} onClick={onConfirm} disabled={isProcessing}>
        {isProcessing ? (processingLabel ?? confirmLabel) : confirmLabel}
      </Button>
      <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
        {cancelLabel}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
        <DrawerContent>
          <DrawerHeader>
            {icon && <div className="flex items-center justify-center mb-2">{icon}</div>}
            <DrawerTitle>{title}</DrawerTitle>
            {description && (
              <DrawerDescription asChild>
                <div>{description}</div>
              </DrawerDescription>
            )}
          </DrawerHeader>
          {children && <div className="px-4 pb-4">{children}</div>}
          <DrawerFooter>{footerContent}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          {icon && (
            <div className="flex items-center justify-center sm:justify-start mb-2">{icon}</div>
          )}
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription asChild>
              <div>{description}</div>
            </DialogDescription>
          )}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={isProcessing}>
            {isProcessing ? (processingLabel ?? confirmLabel) : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
