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
}: CardNotBlankDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onCancel()} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center justify-center mb-2">
            <div className="flex items-center justify-center size-12 rounded-full bg-amber-100">
              <AlertTriangle size={24} className="text-amber-600" />
            </div>
          </div>
          <DrawerTitle>Kartu Tidak Kosong</DrawerTitle>
          <DrawerDescription className="space-y-2">
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
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button variant="destructive" onClick={onConfirm} disabled={isProcessing}>
            {isProcessing ? "Menulis..." : "Timpa & Lanjutkan"}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
            Batal
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
