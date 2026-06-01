import type { CardPayload } from "#/hooks/types";
import { CardStatusBadge } from "./CardStatusBadge";
import { Button } from "../ui/button";
import { formatTime, formatDuration } from "#/lib/utils/formatters";

interface CheckoutConfirmCardProps {
  payload: CardPayload;
  durationSeconds: number;
  fee: number;
  onConfirm: () => void;
  phase: "ready" | "writing";
}

export function CheckoutConfirmCard({
  payload,
  durationSeconds,
  fee,
  onConfirm,
  phase,
}: Readonly<CheckoutConfirmCardProps>) {
  const balanceAfter = payload.wallet.balance - fee;
  return (
    <div className="bg-white rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="type-title-bold text-foreground">{payload.identity.name}</p>
        <CardStatusBadge status={payload.identity.status} />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between type-body2">
          <span className="text-muted-foreground">Waktu Masuk</span>
          <span>{formatTime(payload.session.startTime)}</span>
        </div>
        <div className="flex justify-between type-body2">
          <span className="text-muted-foreground">Durasi</span>
          <span>{formatDuration(durationSeconds)}</span>
        </div>
        <div className="flex justify-between type-body2">
          <span className="text-muted-foreground">Biaya</span>
          <span>Rp {fee.toLocaleString("id-ID")}</span>
        </div>
        <div className="flex justify-between type-body2">
          <span className="text-muted-foreground">Saldo saat ini</span>
          <span>Rp {payload.wallet.balance.toLocaleString("id-ID")}</span>
        </div>
        <div className="flex justify-between type-body2">
          <span className="text-muted-foreground">Saldo setelah</span>
          <span className="text-brand font-medium">Rp {balanceAfter.toLocaleString("id-ID")}</span>
        </div>
      </div>
      <Button
        onClick={onConfirm}
        disabled={phase === "writing"}
        className="w-full h-12 bg-brand hover:bg-brand/90 text-white type-title-bold"
      >
        {phase === "writing" ? "Memproses..." : "Konfirmasi Checkout"}
      </Button>
    </div>
  );
}
