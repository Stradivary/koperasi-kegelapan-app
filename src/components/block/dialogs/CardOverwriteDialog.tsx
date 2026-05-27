import { AlertTriangle } from "lucide-react";
import { ConfirmationDialogDrawer } from "../../ui/confirmation-dialog-drawer";

export interface CardOwnerInfo {
  cardId: string;
  ownerName: string | null;
  userId: string | null;
  balance: number;
  status: string;
}

interface CardOverwriteDialogProps {
  open: boolean;
  existingCard: CardOwnerInfo | null;
  newOwnerName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

export function CardOverwriteDialog({
  open,
  existingCard,
  newOwnerName,
  onConfirm,
  onCancel,
  isProcessing,
}: Readonly<CardOverwriteDialogProps>) {
  if (!existingCard) return null;

  const ownerDisplay =
    existingCard.ownerName ??
    (existingCard.userId ? `User #${existingCard.userId}` : "Tanpa Pemilik");

  return (
    <ConfirmationDialogDrawer
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      title="Kartu Sudah Terdaftar"
      description={
        <div className="space-y-2">
          <p>
            Kartu ini sudah terdaftar atas nama <strong>{ownerDisplay}</strong>.
          </p>
          <div className="rounded-lg bg-muted p-3 text-sm space-y-1 text-left">
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
          <p className="text-destructive font-medium">
            Menimpa kartu ini akan menghapus data {ownerDisplay} dan menggantinya dengan{" "}
            <strong>{newOwnerName || "pemilik baru"}</strong>. Saldo yang tersimpan di kartu akan
            hilang.
          </p>
        </div>
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
    />
  );
}
