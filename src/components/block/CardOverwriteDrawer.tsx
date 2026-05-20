import { AlertTriangle } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "../ui/drawer";
import { Button } from "../ui/button";
import type { CardOwnerInfo } from "./CardOverwriteDialog";

interface CardOverwriteDrawerProps {
  open: boolean;
  existingCard: CardOwnerInfo | null;
  newOwnerName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

export function CardOverwriteDrawer({
  open,
  existingCard,
  newOwnerName,
  onConfirm,
  onCancel,
  isProcessing,
}: CardOverwriteDrawerProps) {
  if (!existingCard) return null;

  const ownerDisplay =
    existingCard.ownerName ??
    (existingCard.userId ? `User #${existingCard.userId}` : "Tanpa Pemilik");

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onCancel()} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center justify-center mb-2">
            <div className="flex items-center justify-center size-12 rounded-full bg-amber-100">
              <AlertTriangle size={24} className="text-amber-600" />
            </div>
          </div>
          <DrawerTitle>Kartu Sudah Terdaftar</DrawerTitle>
          <DrawerDescription className="space-y-2">
            <p>
              Kartu ini sudah terdaftar atas nama <strong>{ownerDisplay}</strong>.
            </p>
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4">
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
        </div>

        <DrawerFooter>
          <Button variant="destructive" onClick={onConfirm} disabled={isProcessing}>
            {isProcessing ? "Menimpa..." : "Timpa Kartu"}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
            Batal
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
