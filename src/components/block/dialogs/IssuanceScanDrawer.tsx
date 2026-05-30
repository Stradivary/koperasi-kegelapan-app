import { CheckCircle2 } from "lucide-react";
import failedImg from "#/assets/images/nfc/failed.svg";
import type { CardPayload } from "#/core/payload/types";
import { CardState, CardStatus } from "#/core/payload/types";
import type { NfcPhase } from "#/core/nfc/stateMachine";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "../../ui/drawer";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Separator } from "../../ui/separator";
import { NfcTapArea, StepIndicator } from "../UnifiedNfcScanner";

interface IssuanceScanDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: "idle" | "scanning" | "writing" | "done" | "error";
  mode: "read" | "write";
  payload: CardPayload | null;
  serialNumber: string | null;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  minimal?: boolean;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(":");
}

function InfoRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right break-all font-mono">{value}</span>
    </div>
  );
}

/**
 * Maps the issuance-specific phase to NfcPhase for sub-component compatibility.
 */
function toNfcPhase(phase: IssuanceScanDrawerProps["phase"]): NfcPhase {
  switch (phase) {
    case "idle":
      return "idle";
    case "scanning":
      return "scanning";
    case "writing":
      return "writing";
    case "done":
      return "success";
    case "error":
      return "error";
  }
}

/**
 * Custom step labels for read vs write mode.
 */
function getStepLabels(mode: "read" | "write") {
  if (mode === "read") {
    return { step1: "Tap Kartu", step2: "Baca", step3: "Proses", step4: "Selesai" };
  }
  return { step1: "Tap & Tahan", step2: "Tulis", step3: "Proses", step4: "Selesai" };
}

export function IssuanceScanDrawer({
  open,
  onOpenChange,
  phase,
  mode,
  payload,
  serialNumber,
  error,
  onClose,
  onRetry,
  minimal = false,
}: Readonly<IssuanceScanDrawerProps>) {
  const nfcPhase = toNfcPhase(phase);

  const isScanning = phase === "scanning";
  const isWriting = phase === "writing";
  const isBusy = isScanning || isWriting;
  const isDone = phase === "done";
  const isError = phase === "error";

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {isScanning && "Baca Kartu NFC"}
            {isWriting && "Tulis Kartu NFC"}
            {isDone &&
              (mode === "write"
                ? "Kartu Berhasil Ditulis"
                : (payload?.identity.name ?? "Kartu Dibaca"))}
            {isError && "Gagal"}
          </DrawerTitle>
          <DrawerDescription>
            {isScanning && "Tap kartu NFC ke perangkat untuk dibaca"}
            {isWriting && "Tap kartu NFC ke perangkat dan tahan sampai selesai"}
            {isDone && payload && (
              <Badge variant="secondary">
                {CardStatus[payload.identity.status] ?? String(payload.identity.status)}
              </Badge>
            )}
          </DrawerDescription>
        </DrawerHeader>

        {/* Step Indicator — uses shared sub-component */}
        <div className="px-4 py-2">
          <StepIndicator phase={nfcPhase} labels={getStepLabels(mode)} />
        </div>

        <div className="px-4 overflow-y-auto max-h-[60vh]">
          {/* Scanning / Writing — uses shared NfcTapArea */}
          {(isScanning || isWriting) && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <NfcTapArea phase={nfcPhase} />
              <div className="text-center space-y-1">
                {isScanning && (
                  <>
                    <p className="text-sm font-medium text-foreground">Menunggu kartu...</p>
                    <p className="text-xs text-muted-foreground">
                      Dekatkan kartu ke bagian belakang perangkat
                    </p>
                  </>
                )}
                {isWriting && (
                  <>
                    <p className="text-sm font-medium text-signal-warning">
                      Tap & tahan kartu ke perangkat
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Jangan pindahkan kartu sampai proses selesai
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Done state */}
          {isDone && payload && (
            <div className="space-y-4 py-2">
              <div className="rounded-xl bg-muted/40 border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{payload.identity.name}</span>
                  <Badge variant="outline">
                    {CardState[payload.wallet.state] ?? String(payload.wallet.state)}
                  </Badge>
                </div>
                <p className="text-2xl font-bold">{formatRupiah(payload.wallet.balance)}</p>
                <p className="text-xs text-muted-foreground">
                  Counter: {String(payload.wallet.counter)}
                </p>
              </div>

              {mode === "write" && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 size={16} />
                  <span>Kartu berhasil ditulis</span>
                </div>
              )}

              <Separator />
              {!minimal && (
                <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                  {serialNumber && <InfoRow label="Serial number" value={serialNumber} />}
                  <InfoRow label="Card ID" value={toHex(payload.header.cardId)} />
                  <InfoRow label="Version" value={String(payload.header.version)} />
                  <InfoRow label="User ID" value={payload.identity.userId || "—"} />
                  <InfoRow
                    label="Dibuat"
                    value={new Date(payload.identity.createdAt * 1000).toLocaleString("id-ID")}
                  />
                  <Separator className="my-1" />
                  <InfoRow
                    label="Berlaku s/d"
                    value={new Date(payload.trailer.expiresAt * 1000).toLocaleString("id-ID")}
                  />
                  <InfoRow label="Key version" value={String(payload.trailer.keyVersion)} />
                  <InfoRow label="Active ptr" value={String(payload.trailer.activePtr)} />
                  <InfoRow label="Counter bind" value={String(payload.trailer.counterBind)} />
                  <InfoRow label="HMAC" value={toHex(payload.trailer.hmac)} />
                  <InfoRow label="Root hash" value={toHex(payload.trailer.rootHash)} />
                  {payload.logEntries.length > 0 && (
                    <>
                      <Separator className="my-1" />
                      <p className="text-xs text-muted-foreground">
                        Log ({payload.logEntries.length} entri)
                      </p>
                      {payload.logEntries.map((e, i) => (
                        <div
                          key={`${e.timestamp}-${e.flags}-${i}`}
                          className="pl-2 border-l space-y-0.5"
                        >
                          <InfoRow label={`[${i}] amount`} value={String(e.amount)} />
                          <InfoRow label={`[${i}] balance`} value={String(e.balanceAfter)} />
                          <InfoRow label={`[${i}] flags`} value={`0x${e.flags.toString(16)}`} />
                          <InfoRow label={`[${i}] hash`} value={toHex(e.hash)} />
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div className="flex flex-col items-center py-6 gap-4">
              <img
                src={failedImg}
                alt="Gagal"
                className="w-44 h-44 object-contain drop-shadow-md"
              />
              <div className="text-center">
                <p className="font-bold text-destructive">Gagal</p>
                {error && <p className="text-sm text-muted-foreground mt-1">{error}</p>}
              </div>
            </div>
          )}
        </div>

        <DrawerFooter>
          {isBusy && (
            <Button variant="outline" onClick={onClose} className="w-full">
              Batal
            </Button>
          )}
          {isDone && (
            <Button variant="outline" onClick={onClose} className="w-full">
              Tutup
            </Button>
          )}
          {isError && (
            <>
              <Button onClick={onRetry} className="w-full">
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
