import { CheckCircle2, LogIn, LogOut } from "lucide-react";
import successPhoneImg from "#/assets/images/landing/success_phone.png";
import failedImg from "#/assets/images/nfc/failed.svg";
import tamperImg from "#/assets/images/nfc/tamper.svg";
import type { NfcCardPhase } from "#/presentation/hooks/nfc/useNfcCard";
import type { CardPayload, NfcPhase } from "#/presentation/hooks/types";
import { CardStatus } from "#/presentation/hooks/types";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "../../ui/drawer";
import { Button } from "../../ui/button";
import { CardStatusBadge } from "../CardStatusBadge";
import { NfcTapArea, StepIndicator } from "../UnifiedNfcScanner";

interface NfcScanDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly phase: NfcCardPhase;
  readonly payload: CardPayload | null;
  readonly isCheckedIn: boolean;
  readonly error: string | null;
  readonly tamperDetected: boolean;
  readonly onCheckin: () => void;
  readonly onCheckout: () => void;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onFixCard?: () => void;
  /** When true, card-ready state shows synced info instead of masuk/keluar buttons */
  readonly syncMode?: boolean;
  readonly syncSuccess?: boolean;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface DrawerBodyContentProps {
  readonly payload: CardPayload | null;
  readonly isCheckedIn: boolean;
  readonly error: string | null;
  readonly tamperDetected: boolean;
  readonly onCheckin: () => void;
  readonly onCheckout: () => void;
  readonly onFixCard?: () => void;
  readonly syncMode: boolean;
  readonly syncSuccess: boolean;
  readonly nfcPhase: NfcPhase;
  readonly isScanning: boolean;
  readonly hasCard: boolean;
  readonly isWriting: boolean;
  readonly isSuccess: boolean;
  readonly isError: boolean;
  readonly isBlocked: boolean;
}

function getWalletStateLabel(state: number): string {
  if (state === 1) return "Checked-in";
  if (state === 0) return "Idle";
  return "Lainnya";
}

function DrawerBodyContent({
  payload,
  isCheckedIn,
  error,
  tamperDetected,
  onCheckin,
  onCheckout,
  onFixCard,
  syncMode,
  syncSuccess,
  nfcPhase,
  isScanning,
  hasCard,
  isWriting,
  isSuccess,
  isError,
  isBlocked,
}: DrawerBodyContentProps) {
  return (
    <div className="px-4">
      {/* Scanning / Validating / Writing - uses shared NfcTapArea */}
      {(isScanning || isWriting) && (
        <div className="flex flex-col items-center justify-center py-8 gap-6">
          <NfcTapArea phase={nfcPhase} />
        </div>
      )}

      {/* Card ready */}
      {hasCard && payload && (
        <div className="space-y-4 py-4">
          <div className="rounded-2xl bg-brand/5 border border-brand/20 p-4 text-center">
            <p className="text-sm text-muted-foreground">Saldo</p>
            <p className="text-2xl font-bold text-brand">{formatRupiah(payload.wallet.balance)}</p>
          </div>
          {syncMode ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-signal-bg-valid border border-signal-valid/30 p-3 text-center">
                <CheckCircle2 size={24} className="text-signal-valid mx-auto mb-1" />
                <p className="text-sm font-medium text-signal-valid">
                  {syncSuccess ? "Data kartu disinkronkan" : "Menyinkronkan..."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <p className="text-xs text-muted-foreground">Nama</p>
                  <p className="font-medium truncate">{payload.identity.name}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium">{getWalletStateLabel(payload.wallet.state)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={onCheckin}
                disabled={isCheckedIn || isBlocked}
                className="h-14 flex-col gap-1 bg-brand-dark hover:bg-brand-dark/90 text-white"
              >
                <LogIn size={20} />
                <span className="text-xs font-bold">Masuk</span>
              </Button>
              <Button
                variant="outline"
                onClick={onCheckout}
                disabled={!isCheckedIn || isBlocked}
                className="h-14 flex-col gap-1 border-2"
              >
                <LogOut size={20} />
                <span className="text-xs font-bold">Keluar</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Success */}
      {isSuccess && (
        <div className="flex flex-col items-center py-6 gap-4">
          <img
            src={successPhoneImg}
            alt="Berhasil"
            className="w-44 h-44 object-contain drop-shadow-md"
          />
          <div className="text-center">
            <p className="text-lg font-bold text-signal-valid">
              {isCheckedIn ? "Check-in Berhasil" : "Check-out Berhasil"}
            </p>
            {payload && (
              <p className="text-sm text-muted-foreground mt-1">{payload.identity.name}</p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Menutup otomatis...</p>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex flex-col items-center py-6 gap-4">
          <img
            src={tamperDetected ? tamperImg : failedImg}
            alt={tamperDetected ? "Kartu rusak" : "Gagal"}
            className="w-44 h-44 object-contain drop-shadow-md"
          />
          <div className="text-center">
            <p className="font-bold text-signal-error">
              {tamperDetected ? "⚠ Kartu Terdeteksi Rusak" : "Gagal"}
            </p>
            {tamperDetected ? (
              <p className="text-sm text-muted-foreground mt-1">
                {onFixCard ? "Kartu perlu diperbaiki" : "Hubungi petugas"}
              </p>
            ) : (
              error && <p className="text-sm text-muted-foreground mt-1">{error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface DrawerFooterContentProps {
  readonly isScanning: boolean;
  readonly hasCard: boolean;
  readonly isWriting: boolean;
  readonly isSuccess: boolean;
  readonly isError: boolean;
  readonly tamperDetected: boolean;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onFixCard?: () => void;
}

function DrawerFooterContent({
  isScanning,
  hasCard,
  isWriting,
  isSuccess,
  isError,
  tamperDetected,
  onClose,
  onRetry,
  onFixCard,
}: DrawerFooterContentProps) {
  return (
    <DrawerFooter>
      {(isScanning || hasCard) && (
        <Button variant="outline" onClick={onClose} className="w-full">
          Batalkan
        </Button>
      )}
      {isWriting && (
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
          {!tamperDetected && (
            <Button
              onClick={onRetry}
              className="w-full bg-brand-dark hover:bg-brand-dark/90 text-white"
            >
              Coba Lagi
            </Button>
          )}
          {tamperDetected && onFixCard && (
            <Button
              onClick={onFixCard}
              className="w-full bg-brand-dark hover:bg-brand-dark/90 text-white"
            >
              Perbaiki Kartu
            </Button>
          )}
          <Button variant="outline" onClick={onClose} className="w-full">
            Tutup
          </Button>
        </>
      )}
    </DrawerFooter>
  );
}

export function NfcScanDrawer({
  open,
  onOpenChange,
  phase,
  payload,
  isCheckedIn,
  error,
  tamperDetected,
  onCheckin,
  onCheckout,
  onClose,
  onRetry,
  onFixCard,
  syncMode = false,
  syncSuccess = false,
}: NfcScanDrawerProps) {
  // Cast NfcCardPhase to NfcPhase (compatible subset)
  const nfcPhase = phase as NfcPhase;

  const isScanning = phase === "scanning" || phase === "validating";
  const hasCard = phase === "ready";
  const isWriting = phase === "writing";
  const isSuccess = phase === "success";
  const isError = phase === "error";
  const isBlocked = payload ? payload.identity.status !== CardStatus.ACTIVE : false;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {isScanning && "Scan Kartu NFC"}
            {hasCard && (payload?.identity.name ?? "Kartu Ditemukan")}
            {isWriting && "Tulis Kartu"}
            {isSuccess && "Berhasil!"}
            {isError && "Gagal"}
          </DrawerTitle>
          {isScanning && <DrawerDescription>Dekatkan kartu NFC ke perangkat</DrawerDescription>}
          {hasCard && payload && (
            <DrawerDescription asChild>
              <div className="flex items-center gap-2 mt-1">
                <CardStatusBadge status={payload.identity.status} />
                <span
                  className={
                    isCheckedIn
                      ? "text-xs font-medium text-signal-valid"
                      : "text-xs font-medium text-signal-info"
                  }
                >
                  {isCheckedIn ? "Sudah Masuk" : "Belum Masuk"}
                </span>
              </div>
            </DrawerDescription>
          )}
          {isWriting && (
            <DrawerDescription>
              Tap kartu lagi ke perangkat dan tahan sampai selesai
            </DrawerDescription>
          )}
        </DrawerHeader>

        {/* Step Indicator - uses shared sub-component */}
        <div className="px-4 py-2">
          <StepIndicator phase={nfcPhase} />
        </div>

        <DrawerBodyContent
          payload={payload}
          isCheckedIn={isCheckedIn}
          error={error}
          tamperDetected={tamperDetected}
          onCheckin={onCheckin}
          onCheckout={onCheckout}
          onFixCard={onFixCard}
          syncMode={syncMode}
          syncSuccess={syncSuccess}
          nfcPhase={nfcPhase}
          isScanning={isScanning}
          hasCard={hasCard}
          isWriting={isWriting}
          isSuccess={isSuccess}
          isError={isError}
          isBlocked={isBlocked}
        />

        <DrawerFooterContent
          isScanning={isScanning}
          hasCard={hasCard}
          isWriting={isWriting}
          isSuccess={isSuccess}
          isError={isError}
          tamperDetected={tamperDetected}
          onClose={onClose}
          onRetry={onRetry}
          onFixCard={onFixCard}
        />
      </DrawerContent>
    </Drawer>
  );
}
