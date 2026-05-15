import { Wifi, CheckCircle2, XCircle, Loader2, LogIn, LogOut } from "lucide-react";
import type { NfcCardPhase } from "../../hooks/useNfcCard";
import type { CardPayload } from "../../core/payload/types";
import { CardStatus } from "../../core/payload/types";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "../ui/drawer";
import { Button } from "../ui/button";
import { CardStatusBadge } from "./CardStatusBadge";

interface NfcScanDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: NfcCardPhase;
  payload: CardPayload | null;
  isCheckedIn: boolean;
  error: string | null;
  tamperDetected: boolean;
  onCheckin: () => void;
  onCheckout: () => void;
  onClose: () => void;
  onRetry: () => void;
  onFixCard?: () => void;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

const STEPS = ["Tap Kartu", "Kartu Ditemukan", "Tulis Kartu", "Selesai"] as const;

function stepIndex(phase: NfcCardPhase): number {
  if (phase === "idle") return -1;
  if (phase === "scanning" || phase === "validating") return 0;
  if (phase === "ready") return 1;
  if (phase === "writing") return 2;
  if (phase === "success") return 3;
  return -1;
}

function StepIndicator({ phase }: { phase: NfcCardPhase }) {
  const active = stepIndex(phase);
  if (active < 0) return null;
  return (
    <div className="flex items-center justify-center gap-1 px-4 py-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1">
          <div
            className={[
              "w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0",
              i < active
                ? "bg-brand text-white"
                : i === active
                  ? "bg-brand text-white ring-2 ring-brand/30"
                  : "bg-muted text-muted-foreground",
            ].join(" ")}
          >
            {i < active ? "✓" : i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={["h-0.5 w-6 shrink-0", i < active ? "bg-brand" : "bg-muted"].join(" ")}
            />
          )}
        </div>
      ))}
    </div>
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
}: NfcScanDrawerProps) {
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

        <StepIndicator phase={phase} />

        <div className="px-4">
          {/* Scanning / Validating */}
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

          {/* Card ready */}
          {hasCard && payload && (
            <div className="space-y-4 py-4">
              <div className="rounded-2xl bg-brand/5 border border-brand/20 p-4 text-center">
                <p className="text-sm text-muted-foreground">Saldo</p>
                <p className="text-2xl font-bold text-brand">
                  {formatRupiah(payload.wallet.balance)}
                </p>
              </div>
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
            </div>
          )}

          {/* Writing — user must tap card again */}
          {isWriting && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="relative flex items-center justify-center w-40 h-40">
                <span className="absolute inset-0 rounded-full border-2 border-signal-warning/30 animate-ping" />
                <span className="absolute inset-4 rounded-full border-2 border-signal-warning/40 animate-ping [animation-delay:300ms]" />
                <span className="absolute inset-8 rounded-full border-2 border-signal-warning/50 animate-ping [animation-delay:600ms]" />
                <span className="relative z-10 w-24 h-24 rounded-full bg-signal-bg-warning border-2 border-signal-warning flex items-center justify-center">
                  <Wifi size={40} className="text-signal-warning animate-pulse" />
                </span>
              </div>
              <div className="text-center space-y-1">
                <p className="type-body1-bold text-signal-warning">Tap kartu ke perangkat</p>
                <p className="text-sm text-muted-foreground">Tahan kartu sampai proses selesai</p>
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
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-24 h-24 rounded-full bg-signal-bg-error border-2 border-signal-error flex items-center justify-center">
                <XCircle size={48} className="text-signal-error" />
              </div>
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
      </DrawerContent>
    </Drawer>
  );
}
