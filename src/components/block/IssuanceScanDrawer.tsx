import { Wifi, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { CardPayload } from "../../core/payload/types";
import { CardState, CardStatus } from "../../core/payload/types";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "../ui/drawer";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";

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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right break-all font-mono">{value}</span>
    </div>
  );
}

type Phase = IssuanceScanDrawerProps["phase"];

const READ_STEPS = ["Tap Kartu", "Baca", "Selesai"] as const;
const WRITE_STEPS = ["Tap & Tahan", "Tulis", "Selesai"] as const;

function readStepIndex(phase: Phase): number {
  if (phase === "scanning") return 0;
  if (phase === "done") return 2;
  return -1;
}

function writeStepIndex(phase: Phase): number {
  if (phase === "writing") return 0;
  if (phase === "done") return 2;
  return -1;
}

function StepIndicator({ phase, mode }: { phase: Phase; mode: "read" | "write" }) {
  const steps = mode === "read" ? READ_STEPS : WRITE_STEPS;
  const active = mode === "read" ? readStepIndex(phase) : writeStepIndex(phase);
  if (active < 0) return null;
  return (
    <div className="flex items-center justify-center gap-1 px-4 py-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-1">
          <div className={["flex flex-col items-center gap-0.5"].join(" ")}>
            <div
              className={[
                "w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0",
                i < active
                  ? "bg-primary text-primary-foreground"
                  : i === active
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "bg-muted text-muted-foreground",
              ].join(" ")}
            >
              {i < active ? "✓" : i + 1}
            </div>
            <span
              className={[
                "text-[9px] whitespace-nowrap",
                i === active ? "text-primary font-semibold" : "text-muted-foreground",
              ].join(" ")}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={["h-0.5 w-8 shrink-0 mb-3", i < active ? "bg-primary" : "bg-muted"].join(
                " ",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function NfcPulse({ color = "primary" }: { color?: "primary" | "warning" }) {
  const ring = color === "warning" ? "border-signal-warning" : "border-primary";
  const bg =
    color === "warning"
      ? "bg-signal-bg-warning border-signal-warning"
      : "bg-primary/10 border-primary";
  const icon = color === "warning" ? "text-signal-warning" : "text-primary";
  return (
    <div className="relative flex items-center justify-center w-40 h-40">
      <span className={`absolute inset-0 rounded-full border-2 ${ring}/20 animate-ping`} />
      <span
        className={`absolute inset-4 rounded-full border-2 ${ring}/30 animate-ping [animation-delay:300ms]`}
      />
      <span
        className={`absolute inset-8 rounded-full border-2 ${ring}/40 animate-ping [animation-delay:600ms]`}
      />
      <span
        className={`relative z-10 w-24 h-24 rounded-full ${bg} border-2 flex items-center justify-center`}
      >
        <Wifi size={40} className={`${icon} animate-pulse`} />
      </span>
    </div>
  );
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
}: IssuanceScanDrawerProps) {
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

        <StepIndicator phase={phase} mode={mode} />

        <div className="px-4 overflow-y-auto max-h-[60vh]">
          {/* Scanning state */}
          {isScanning && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <NfcPulse color="primary" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-foreground">Menunggu kartu...</p>
                <p className="text-xs text-muted-foreground">
                  Dekatkan kartu ke bagian belakang perangkat
                </p>
              </div>
            </div>
          )}

          {/* Writing state */}
          {isWriting && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="relative flex items-center justify-center w-40 h-40">
                <span className="absolute inset-0 rounded-full border-2 border-signal-warning/20 animate-ping" />
                <span className="absolute inset-4 rounded-full border-2 border-signal-warning/30 animate-ping [animation-delay:300ms]" />
                <span className="absolute inset-8 rounded-full border-2 border-signal-warning/40 animate-ping [animation-delay:600ms]" />
                <span className="relative z-10 w-24 h-24 rounded-full bg-signal-bg-warning border-2 border-signal-warning flex items-center justify-center">
                  <Loader2 size={40} className="text-signal-warning animate-spin" />
                </span>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-signal-warning">
                  Tap & tahan kartu ke perangkat
                </p>
                <p className="text-xs text-muted-foreground">
                  Jangan pindahkan kartu sampai proses selesai
                </p>
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

              <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                {serialNumber && <InfoRow label="Serial number" value={serialNumber} />}
                <InfoRow label="Card ID" value={toHex(payload.header.cardId)} />
                <InfoRow label="Version" value={String(payload.header.version)} />
                <InfoRow label="User ID" value={String(payload.identity.userId)} />
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
                      <div key={i} className="pl-2 border-l space-y-0.5">
                        <InfoRow label={`[${i}] amount`} value={String(e.amount)} />
                        <InfoRow label={`[${i}] balance`} value={String(e.balanceAfter)} />
                        <InfoRow label={`[${i}] flags`} value={`0x${e.flags.toString(16)}`} />
                        <InfoRow label={`[${i}] hash`} value={toHex(e.hash)} />
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-24 h-24 rounded-full bg-destructive/10 border-2 border-destructive flex items-center justify-center">
                <XCircle size={48} className="text-destructive" />
              </div>
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
