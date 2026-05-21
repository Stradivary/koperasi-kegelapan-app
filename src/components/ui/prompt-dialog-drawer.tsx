import * as React from "react";
import { useIsMobile } from "#/hooks/use-mobile.ts";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
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

export interface PromptDialogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Label displayed above the input field */
  inputLabel?: string;
  inputPlaceholder?: string;
  /** Default value for the input */
  defaultValue?: string;
  /** Input type (text, number, email, etc.) */
  inputType?: React.HTMLInputTypeAttribute;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  onConfirm: (value: string) => void;
  onCancel?: () => void;
  isProcessing?: boolean;
  processingLabel?: string;
  /** Icon or media element displayed above the title */
  icon?: React.ReactNode;
  /** Validate input — return error message or undefined if valid */
  validate?: (value: string) => string | undefined;
}

export function PromptDialogDrawer({
  open,
  onOpenChange,
  title,
  description,
  inputLabel,
  inputPlaceholder,
  defaultValue = "",
  inputType = "text",
  confirmLabel = "Submit",
  cancelLabel = "Cancel",
  confirmVariant = "default",
  onConfirm,
  onCancel,
  isProcessing = false,
  processingLabel,
  icon,
  validate,
}: PromptDialogDrawerProps) {
  const isMobile = useIsMobile();
  const [value, setValue] = React.useState(defaultValue);
  const [error, setError] = React.useState<string | undefined>();

  // Reset value when dialog opens
  React.useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setError(undefined);
    }
  }, [open, defaultValue]);

  const handleConfirm = () => {
    if (validate) {
      const err = validate(value);
      if (err) {
        setError(err);
        return;
      }
    }
    setError(undefined);
    onConfirm(value);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isProcessing) {
      e.preventDefault();
      handleConfirm();
    }
  };

  const inputContent = (
    <div className="space-y-2">
      {inputLabel && <label className="text-sm font-medium text-foreground">{inputLabel}</label>}
      <Input
        type={inputType}
        placeholder={inputPlaceholder}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(undefined);
        }}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );

  const footerContent = (
    <>
      <Button variant={confirmVariant} onClick={handleConfirm} disabled={isProcessing}>
        {isProcessing ? (processingLabel ?? confirmLabel) : confirmLabel}
      </Button>
      <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
        {cancelLabel}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="bottom" repositionInputs={false}>
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
          <div className="px-4 pb-4">{inputContent}</div>
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
        {inputContent}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={handleConfirm} disabled={isProcessing}>
            {isProcessing ? (processingLabel ?? confirmLabel) : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
