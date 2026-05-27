import { AlertTriangle, RefreshCw } from "lucide-react";
import { ConfirmationDialogDrawer } from "../../ui/confirmation-dialog-drawer";
import type { CardOwnerInfo } from "./CardOverwriteDialog";

interface CardOverwriteDrawerProps {
  open: boolean;
  existingCard: CardOwnerInfo | null;
  newOwnerName: string;
  newUserId?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

export function CardOverwriteDrawer({
  open,
  existingCard,
  newOwnerName,
  newUserId,
  onConfirm,
  onCancel,
  isProcessing,
}: Readonly<CardOverwriteDrawerProps>) {
  if (!existingCard) return null;

  const ownerDisplay =
    existingCard.ownerName ??
    (existingCard.userId ? `User #${existingCard.userId}` : "Tanpa Pemilik");

  // Detect same-user re-issuance: same userId or same name when userId is not available
  const isSameUser =
    (existingCard.userId != null && newUserId != null && existingCard.userId === newUserId) ||
    (existingCard.userId == null &&
      newUserId == null &&
      existingCard.ownerName != null &&
      existingCard.ownerName === newOwnerName);

  if (isSameUser) {
    return (
      <ConfirmationDialogDrawer
        open={open}
        onOpenChange={(o) => !o && onCancel()}
        title="Cetak Ulang Kartu"
        description={
          <p>
            Kartu ini sudah terdaftar untuk <strong>{ownerDisplay}</strong>. Melanjutkan akan
            mereset data kartu dan mencetak ulang.
          </p>
        }
        icon={
          <div className="flex items-center justify-center size-12 rounded-full bg-blue-100">
            <RefreshCw size={24} className="text-blue-600" />
          </div>
        }
        confirmLabel="Cetak Ulang"
        cancelLabel="Batal"
        confirmVariant="default"
        onConfirm={onConfirm}
        onCancel={onCancel}
        isProcessing={isProcessing}
        processingLabel="Mencetak..."
      >
        <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Serial:</span>{" "}
            <span className="font-mono">{existingCard.cardId}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Pemilik:</span> {ownerDisplay}
          </p>
          <p>
            <span className="text-muted-foreground">Saldo saat ini:</span> Rp{" "}
            {existingCard.balance.toLocaleString("id-ID")}
          </p>
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          Saldo yang tersimpan di kartu akan direset sesuai saldo awal yang dipilih.
        </p>
      </ConfirmationDialogDrawer>
    );
  }

  return (
    <ConfirmationDialogDrawer
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      title="Kartu Sudah Terdaftar"
      description={
        <p>
          Kartu ini sudah terdaftar atas nama <strong>{ownerDisplay}</strong>.
        </p>
      }
      icon={
        <div className="flex items-center justify-center size-12 rounded-full bg-amber-100">
          <AlertTriangle size={24} className="text-amber-600" />
        </div>
      }
      confirmLabel="Timpa Kartu"
      cancelLabel="Batal"
      confirmVariant="destructive"
      onConfirm={onConfirm}
      onCancel={onCancel}
      isProcessing={isProcessing}
      processingLabel="Menimpa..."
    >
      <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
        <p>
          <span className="text-muted-foreground">Serial:</span>{" "}
          <span className="font-mono">{existingCard.cardId}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Pemilik saat ini:</span> {ownerDisplay}
        </p>
        <p>
          <span className="text-muted-foreground">Saldo:</span> Rp{" "}
          {existingCard.balance.toLocaleString("id-ID")}
        </p>
        <p>
          <span className="text-muted-foreground">Status:</span>{" "}
          {existingCard.status === "active" ? "Aktif" : existingCard.status}
        </p>
      </div>
      <p className="text-sm text-destructive font-medium mt-3">
        Menimpa kartu ini akan menghapus data {ownerDisplay} dan menggantinya dengan{" "}
        <strong>{newOwnerName || "pemilik baru"}</strong>. Saldo yang tersimpan di kartu akan
        hilang.
      </p>
    </ConfirmationDialogDrawer>
  );
}
