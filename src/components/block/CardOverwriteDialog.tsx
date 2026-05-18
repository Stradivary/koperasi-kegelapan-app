import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";

export interface CardOwnerInfo {
  cardId: string;
  ownerName: string | null;
  userId: number | null;
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
}: CardOverwriteDialogProps) {
  if (!existingCard) return null;

  const ownerDisplay =
    existingCard.ownerName ?? (existingCard.userId ? `User #${existingCard.userId}` : "Tanpa Pemilik");

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <div className="flex items-center justify-center size-12 rounded-full bg-amber-100">
              <AlertTriangle size={24} className="text-amber-600" />
            </div>
          </AlertDialogMedia>
          <AlertDialogTitle>Kartu Sudah Terdaftar</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
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
                <span className="text-muted-foreground">Saldo:</span>{" "}
                Rp {existingCard.balance.toLocaleString("id-ID")}
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
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
            Batal
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isProcessing}>
            {isProcessing ? "Menimpa..." : "Timpa Kartu"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
