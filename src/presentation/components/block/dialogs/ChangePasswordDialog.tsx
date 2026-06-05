import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/presentation/components/ui/dialog.tsx";
import { Button } from "#/presentation/components/ui/button.tsx";
import { Label } from "#/presentation/components/ui/label.tsx";
import { PasswordInput } from "#/presentation/components/ui/password-input.tsx";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountUsername: string;
  onSubmit: (newPassword: string) => void;
  isSubmitting: boolean;
  error: string | null;
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (password.length > 128) {
    return "Password must not exceed 128 characters";
  }
  return null;
}

function validateConfirmPassword(password: string, confirm: string): string | null {
  if (confirm.length === 0) {
    return "Please confirm the new password";
  }
  if (password !== confirm) {
    return "Passwords do not match";
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ChangePasswordDialog({
  open,
  onOpenChange,
  accountUsername,
  onSubmit,
  isSubmitting,
  error,
}: Readonly<ChangePasswordDialogProps>) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setNewPassword("");
      setConfirmPassword("");
      setTouched({});
    }
  }, [open]);

  const handleBlur = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const validationErrors = useMemo(() => {
    return {
      newPassword: validatePassword(newPassword),
      confirmPassword: validateConfirmPassword(newPassword, confirmPassword),
    };
  }, [newPassword, confirmPassword]);

  const hasErrors = Object.values(validationErrors).some((e) => e !== null);

  const getFieldError = useCallback(
    (field: string): string | null => {
      if (touched[field]) {
        return validationErrors[field as keyof typeof validationErrors] ?? null;
      }
      return null;
    },
    [touched, validationErrors],
  );

  const handleSubmit = useCallback(
    (e: React.SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();

      setTouched({ newPassword: true, confirmPassword: true });

      if (hasErrors) return;

      onSubmit(newPassword);
    },
    [newPassword, hasErrors, onSubmit],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>
            Set a new password for <span className="font-semibold">{accountUsername}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {/* New Password */}
          <div className="grid gap-2">
            <Label htmlFor="new-password">New Password</Label>
            <PasswordInput
              id="new-password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onBlur={() => handleBlur("newPassword")}
              aria-invalid={!!getFieldError("newPassword")}
              aria-describedby={getFieldError("newPassword") ? "new-password-error" : undefined}
              autoComplete="new-password"
            />
            {getFieldError("newPassword") && (
              <p id="new-password-error" className="text-sm text-destructive">
                {getFieldError("newPassword")}
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <PasswordInput
              id="confirm-password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => handleBlur("confirmPassword")}
              aria-invalid={!!getFieldError("confirmPassword")}
              aria-describedby={
                getFieldError("confirmPassword") ? "confirm-password-error" : undefined
              }
              autoComplete="new-password"
            />
            {getFieldError("confirmPassword") && (
              <p id="confirm-password-error" className="text-sm text-destructive">
                {getFieldError("confirmPassword")}
              </p>
            )}
          </div>

          {/* Server error */}
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || hasErrors}>
              {isSubmitting ? "Saving..." : "Change Password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
