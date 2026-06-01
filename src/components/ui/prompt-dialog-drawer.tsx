import * as React from "react";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { BaseDialogDrawer } from "#/components/ui/base-dialog-drawer.tsx";

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
  /** Validate input - return error message or undefined if valid */
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

  const footer = (
    <>
      <Button variant={confirmVariant} onClick={handleConfirm} disabled={isProcessing}>
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
      {inputContent}
    </BaseDialogDrawer>
  );
}
