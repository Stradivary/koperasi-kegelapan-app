import { AlertTriangle } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import type { SyncConflict } from "#/presentation/hooks/useTenantSync";
import { validateSlugFormat } from "#/core/validation/slugValidation";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

export interface SyncConflictDialogProps {
  conflict: SyncConflict;
  onDismiss: () => void;
  onRetryWithChanges: (newSlug: string, newAdminUsername: string) => void;
  isRetrying?: boolean;
  open: boolean;
}

function getConflictMessage(conflict: SyncConflict): string {
  switch (conflict.conflictType) {
    case "slug_and_admin":
      return `Slug '${conflict.existingSlug}' dan username admin sudah digunakan oleh tenant '${conflict.existingTenantName}' di server. Silakan ganti dengan yang lain.`;
    case "slug_only":
      return `Slug '${conflict.existingSlug}' sudah digunakan oleh tenant '${conflict.existingTenantName}' di server. Silakan ganti slug.`;
    case "admin_only":
      return `Username admin sudah digunakan oleh tenant '${conflict.existingTenantName}' (${conflict.existingSlug}) di server. Silakan ganti username admin.`;
  }
}

function getConflictTitle(conflictType: SyncConflict["conflictType"]): string {
  switch (conflictType) {
    case "slug_and_admin":
      return "Slug & Admin Sudah Digunakan";
    case "slug_only":
      return "Slug Sudah Digunakan";
    case "admin_only":
      return "Username Admin Sudah Digunakan";
  }
}

export function SyncConflictDialog({
  conflict,
  onDismiss,
  onRetryWithChanges,
  isRetrying,
  open,
}: Readonly<SyncConflictDialogProps>) {
  const [newSlug, setNewSlug] = useState(conflict.currentSlug);
  const [newAdminUsername, setNewAdminUsername] = useState(conflict.currentAdminUsername);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Reset fields when conflict changes
  useEffect(() => {
    setNewSlug(conflict.currentSlug);
    setNewAdminUsername(conflict.currentAdminUsername);
    setSlugError(null);
    setUsernameError(null);
  }, [conflict]);

  const showSlugField =
    conflict.conflictType === "slug_and_admin" || conflict.conflictType === "slug_only";
  const showUsernameField =
    conflict.conflictType === "slug_and_admin" || conflict.conflictType === "admin_only";

  const validateAndRetry = useCallback(() => {
    let hasError = false;

    if (showSlugField) {
      const err = validateSlugFormat(newSlug);
      if (err) {
        setSlugError(err);
        hasError = true;
      } else if (newSlug === conflict.currentSlug) {
        setSlugError("Slug harus berbeda dari yang sebelumnya");
        hasError = true;
      } else {
        setSlugError(null);
      }
    }

    if (showUsernameField) {
      if (newAdminUsername.length < 3 || newAdminUsername.length > 50) {
        setUsernameError("Username harus antara 3 dan 50 karakter");
        hasError = true;
      } else if (/\s/.test(newAdminUsername)) {
        setUsernameError("Username tidak boleh mengandung spasi");
        hasError = true;
      } else if (!/^[a-z0-9_-]+$/.test(newAdminUsername)) {
        setUsernameError(
          "Username hanya boleh berisi huruf kecil, angka, underscore, dan tanda hubung",
        );
        hasError = true;
      } else if (newAdminUsername === conflict.currentAdminUsername) {
        setUsernameError("Username harus berbeda dari yang sebelumnya");
        hasError = true;
      } else {
        setUsernameError(null);
      }
    }

    if (hasError) return;

    onRetryWithChanges(
      showSlugField ? newSlug : conflict.currentSlug,
      showUsernameField ? newAdminUsername : conflict.currentAdminUsername,
    );
  }, [newSlug, newAdminUsername, conflict, showSlugField, showUsernameField, onRetryWithChanges]);

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onDismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-signal-bg-error">
            <AlertTriangle className="text-signal-error" />
          </AlertDialogMedia>
          <AlertDialogTitle>{getConflictTitle(conflict.conflictType)}</AlertDialogTitle>
          <AlertDialogDescription>{getConflictMessage(conflict)}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-4 py-2">
          {showSlugField && (
            <div className="grid gap-1.5">
              <Label htmlFor="conflict-slug" className="text-sm font-medium">
                Slug Baru
              </Label>
              <Input
                id="conflict-slug"
                value={newSlug}
                onChange={(e) => {
                  setNewSlug(e.target.value.toLowerCase().replaceAll(/[^a-z0-9-]/g, ""));
                  setSlugError(null);
                }}
                placeholder="slug-baru"
                aria-invalid={!!slugError}
              />
              {slugError && <p className="text-xs text-destructive">{slugError}</p>}
            </div>
          )}

          {showUsernameField && (
            <div className="grid gap-1.5">
              <Label htmlFor="conflict-username" className="text-sm font-medium">
                Username Admin Baru
              </Label>
              <Input
                id="conflict-username"
                value={newAdminUsername}
                onChange={(e) => {
                  setNewAdminUsername(e.target.value.toLowerCase().replaceAll(/[^a-z0-9_-]/g, ""));
                  setUsernameError(null);
                }}
                placeholder="username-baru"
                aria-invalid={!!usernameError}
              />
              {usernameError && <p className="text-xs text-destructive">{usernameError}</p>}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={onDismiss} disabled={isRetrying}>
            Batal
          </Button>
          <Button onClick={validateAndRetry} disabled={isRetrying}>
            {isRetrying ? "Menyinkronkan..." : "Coba Lagi"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
