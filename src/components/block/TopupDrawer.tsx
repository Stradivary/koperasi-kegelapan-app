import { useState } from "react";
import { Wifi, CheckCircle2, XCircle, Loader2, CreditCard } from "lucide-react";
import type { NfcCardPhase } from "../../hooks/useNfcCard";
import type { CardPayload } from "../../core/payload/types";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "../ui/drawer";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface TopupDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: NfcCardPhase;
  payload: CardPayload | null;
  error: string | null;
  onTopup: (amount: number) => void;
  onClose: () => void;
  onRetry: () => void;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function TopupDrawer({
  open,
  onOpenChange,
  phase,
  payload,
  error,
  onTopup,
  onClose,
  onRetry,
}: TopupDrawerProps) {
  const [amount, setAmount] = useState("");

  const isScanning = phase === "scanning" || phase === "validating";
  const hasCard = phase === "ready";
  const isWriting = phase === "writing";
  const isSuccess = phase === "success";
  const isError = phase === "error";

  const parsedAmount = parseInt(amount, 10);
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;

  function handleConfirm() {
    if (!isValidAmount) return;
    onTopup(parsedAmount);
    setAmount("");
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) setAmount("");
        onOpenChange(o);
      }}
      direction="bottom"
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {isScanning && "Scan Kartu untuk Top-up"}
            {hasCard && (payload?.identity.name ?? "Kartu Ditemukan")}
            {isWriting && "Menulis Top-up..."}
            {isSuccess && "Top-up Berhasil!"}
            {isError && "Gagal"}
          </DrawerTitle>
          {isScanning && (
            <DrawerDescription>
              Dekatkan kartu NFC ke perangkat untuk membaca saldo
            </DrawerDescription>
          )}
          {hasCard && payload && <DrawerDescription>Masukkan nominal top-up</DrawerDescription>}
          {isWriting && (
            <DrawerDescription>Tempelkan kartu NFC untuk menyimpan top-up</DrawerDescription>
          )}
        </DrawerHeader>

        <div className="px-4">
          {/* Scanning */}
          {isScanning && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="relative flex items-center justify-center w-40 h-40">
                <span className="absolute inset-0 rounded-full border-2 border-brand/20 animate-ping" />
                <span className="absolute inset-4 rounded-full border-2 border-brand/30 animate-ping [animation-delay:300ms]" />
                <span className="absolute inset-8 rounded-full border-2 border-brand/40 animate-ping [animation-delay:600ms]" />
                <span className="relative z-10 w-24 h-24 rounded-full bg-brand/10 border-2 border-brand flex items-center justify-center">
                  {phase === "validating" ? (
                    <Loader2 size={40} className="text-brand animate-spin" />
                  ) : (
                    <Wifi size={40} className="text-brand animate-pulse" />
                  )}
                </span>
              </div>
              <p className="type-body1 text-muted-foreground text-center">
                {phase === "validating" ? "Memvalidasi kartu..." : "Menunggu kartu..."}
              </p>
            </div>
          )}

          {/* Card ready — show balance + amount input */}
          {hasCard && payload && (
            <div className="space-y-4 py-4">
              <div className="rounded-2xl bg-brand/5 border border-brand/20 p-4 text-center">
                <p className="text-sm text-muted-foreground">Saldo Saat Ini</p>
                <p className="text-2xl font-bold text-brand">
                  {formatRupiah(payload.wallet.balance)}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Nominal Top-up (IDR)</Label>
                <Input
                  type="number"
                  placeholder="100000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[50_000, 100_000, 200_000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(String(v))}
                    className="rounded-lg border p-2 text-sm hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    {v / 1000}k
                  </button>
                ))}
              </div>

              {isValidAmount && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm text-center">
                  <span className="text-muted-foreground">Saldo setelah top-up: </span>
                  <span className="font-bold">
                    {formatRupiah(payload.wallet.balance + parsedAmount)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Writing */}
          {isWriting && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="relative flex items-center justify-center w-40 h-40">
                <span className="absolute inset-0 rounded-full border-2 border-signal-warning/30 animate-ping" />
                <span className="absolute inset-4 rounded-full border-2 border-signal-warning/40 animate-ping [animation-delay:300ms]" />
                <span className="absolute inset-8 rounded-full border-2 border-signal-warning/50 animate-ping [animation-delay:600ms]" />
                <span className="relative z-10 w-24 h-24 rounded-full bg-signal-bg-warning border-2 border-signal-warning flex items-center justify-center">
                  <CreditCard size={40} className="text-signal-warning animate-pulse" />
                </span>
              </div>
              <div className="text-center space-y-1">
                <p className="type-body1-bold text-signal-warning">Tempelkan kartu untuk menulis</p>
                <p className="type-body1 text-muted-foreground">
                  Dekatkan kartu NFC ke perangkat dan tahan sampai selesai
                </p>
              </div>
            </div>
          )}

          {/* Success */}
          {isSuccess && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-24 h-24 rounded-full bg-signal-bg-valid border-2 border-signal-valid flex items-center justify-center">
                <CheckCircle2 size={48} className="text-signal-valid" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-signal-valid">Top-up Berhasil</p>
                {payload && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Saldo baru: {formatRupiah(payload.wallet.balance)}
                  </p>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Menutup otomatis...</p>
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-24 h-24 rounded-full bg-signal-bg-error border-2 border-signal-error flex items-center justify-center">
                <XCircle size={48} className="text-signal-error" />
              </div>
              <div className="text-center">
                <p className="font-bold text-signal-error">Gagal</p>
                {error && <p className="text-sm text-muted-foreground mt-1">{error}</p>}
              </div>
            </div>
          )}
        </div>

        <DrawerFooter>
          {hasCard && (
            <Button
              onClick={handleConfirm}
              disabled={!isValidAmount}
              className="w-full bg-brand-dark hover:bg-brand-dark/90 text-white"
            >
              <CreditCard size={16} />
              Top-up {isValidAmount ? formatRupiah(parsedAmount) : ""}
            </Button>
          )}
          {(isScanning || hasCard || isWriting) && (
            <Button variant="outline" onClick={onClose} className="w-full">
              Batalkan
            </Button>
          )}
          {isSuccess && (
            <Button variant="outline" onClick={onClose} className="w-full">
              Tutup
            </Button>
          )}
          {isError && (
            <>
              <Button
                onClick={onRetry}
                className="w-full bg-brand-dark hover:bg-brand-dark/90 text-white"
              >
                Coba Lagi
              </Button>
              <Button variant="outline" onClick={onClose} className="w-full">
                Tutup
              </Button>
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
