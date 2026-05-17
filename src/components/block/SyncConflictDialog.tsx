import { AlertTriangle } from "lucide-react";
import type { SyncConflict } from "../../hooks/useTenantSync";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "../ui/alert-dialog";

export interface SyncConflictDialogProps {
  conflict: SyncConflict;
  onDismiss: () => void;
  open: boolean;
}

function getConflictMessage(conflict: SyncConflict): string {
  switch (conflict.conflictType) {
    case "slug_and_admin":
      return `Slug '${conflict.existingSlug}' dan username admin sudah digunakan oleh tenant '${conflict.existingTenantName}' di server.`;
    case "slug_only":
      return `Slug '${conflict.existingSlug}' sudah digunakan oleh tenant '${conflict.existingTenantName}' di server.`;
    case "admin_only":
      return `Username admin sudah digunakan oleh tenant '${conflict.existingTenantName}' (${conflict.existingSlug}) di server.`;
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

export function SyncConflictDialog({ conflict, onDismiss, open }: SyncConflictDialogProps) {
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
        <AlertDialogFooter>
          <AlertDialogAction onClick={onDismiss}>Tutup</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
