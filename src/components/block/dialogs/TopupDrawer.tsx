import { useState } from "react";
import { CreditCard } from "lucide-react";
import successHandImg from "#/assets/images/success_hand.svg";
import failedImg from "#/assets/images/nfc/failed.svg";
import type { NfcCardPhase } from "#/hooks/nfc/useNfcCard";
import type { CardPayload } from "#/core/payload/types";
import type { NfcPhase } from "#/core/nfc/stateMachine";
import { validateTopup, MAX_TOPUP_AMOUNT, MAX_BALANCE } from "#/core/state-machine/engine";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "../../ui/drawer";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { NfcTapArea, StepIndicator } from "../UnifiedNfcScanner";

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

  // Cast NfcCardPhase to NfcPhase (compatible subset)
  const nfcPhase = phase as NfcPhase;

  const isScanning = phase === "scanning" || phase === "validating";
  const hasCard = phase === "ready";
  const isWriting = phase === "writing";
  const isSuccess = phase === "success";
  const isError = phase === "error";

  const parsedAmount = Number.parseInt(amount, 10);
  const isValidAmount = !Number.isNaN(parsedAmount) && parsedAmount > 0;

  const topupValidation = isValidAmount && payload ? validateTopup(payload, parsedAmount) : null;
  const canConfirm = isValidAmount && (!topupValidation || topupValidation.valid);

  function handleConfirm() {
    if (!canConfirm) return;
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
      repositionInputs={false}
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

        {/* Step Indicator — uses shared sub-component */}
        <div className="px-4 py-2">
          <StepIndicator
            phase={nfcPhase}
            labels={{
              step1: "Scan Kartu",
              step2: "Isi Nominal",
              step3: "Tulis Kartu",
              step4: "Selesai",
            }}
          />
        </div>

        <div className="px-4 overflow-y-auto flex-1 min-h-0">
          {/* Scanning / Writing — uses shared NfcTapArea */}
          {(isScanning || isWriting) && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <NfcTapArea phase={nfcPhase} />
              {isWriting && (
                <div className="text-center space-y-1">
                  <p className="type-body1-bold text-signal-warning">Jangan lepas kartu!</p>
                  <p className="type-body1 text-muted-foreground">
                    Tahan kartu sampai proses selesai
                  </p>
                </div>
              )}
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
                  max={MAX_TOPUP_AMOUNT}
                />
                <p className="text-xs text-muted-foreground">
                  Maks. top-up: {formatRupiah(MAX_TOPUP_AMOUNT)} · Maks. saldo:{" "}
                  {formatRupiah(MAX_BALANCE)}
                </p>
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
                <div
                  className={`rounded-lg p-3 text-sm text-center ${topupValidation && !topupValidation.valid ? "bg-destructive/10 border border-destructive/20" : "bg-muted/50"}`}
                >
                  {topupValidation && !topupValidation.valid ? (
                    <span className="text-destructive font-medium">{topupValidation.reason}</span>
                  ) : (
                    <>
                      <span className="text-muted-foreground">Saldo setelah top-up: </span>
                      <span className="font-bold">
                        {formatRupiah(payload.wallet.balance + parsedAmount)}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Success */}
          {isSuccess && (
            <div className="flex flex-col items-center py-6 gap-4">
              <img
                src={successHandImg}
                alt="Top-up Berhasil"
                className="w-44 h-44 object-contain drop-shadow-md"
              />
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
            <div className="flex flex-col items-center py-6 gap-4">
              <img
                src={failedImg}
                alt="Gagal"
                className="w-44 h-44 object-contain drop-shadow-md"
              />
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
              disabled={!canConfirm}
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
