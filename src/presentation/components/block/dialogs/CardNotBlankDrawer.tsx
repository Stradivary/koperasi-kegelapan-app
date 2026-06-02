import { AlertTriangle } from "lucide-react";
import { ConfirmationDialogDrawer } from "../../ui/confirmation-dialog-drawer";

interface CardNotBlankDrawerProps {
  open: boolean;
  cardSerial: string | null;
  isProcessing?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CardNotBlankDrawer({
  open,
  cardSerial,
  isProcessing,
  onConfirm,
  onCancel,
}: Readonly<CardNotBlankDrawerProps>) {
  return (
    <ConfirmationDialogDrawer
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      title="Kartu Tidak Kosong"
      description={
        <div className="space-y-2">
          <p>
            Kartu ini sudah berisi data (kemungkinan dari tenant lain atau penulisan sebelumnya).
            Melanjutkan akan menimpa semua data yang ada di kartu.
          </p>
          {cardSerial && (
            <p className="text-xs">
              Serial: <code className="bg-muted px-1 rounded">{cardSerial}</code>
            </p>
          )}
          <p className="text-destructive font-medium">
            Data yang tersimpan di kartu akan hilang dan diganti dengan data baru.
          </p>
        </div>
      }
      icon={
        <div className="flex items-center justify-center size-12 rounded-full bg-amber-100">
          <AlertTriangle size={24} className="text-amber-600" />
        </div>
      }
      confirmLabel="Timpa & Lanjutkan"
      cancelLabel="Batal"
      confirmVariant="destructive"
      onConfirm={onConfirm}
      onCancel={onCancel}
      isProcessing={isProcessing}
      processingLabel="Menulis..."
    />
  );
}
