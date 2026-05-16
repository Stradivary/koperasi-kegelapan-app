import { useNfcCard } from "../../hooks/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { useReconciliation } from "../../hooks/useReconciliation";
import {
  applyCheckout,
  validateTransition,
  PARKING_RATE_PER_HOUR,
} from "../../core/state-machine/engine";
import { CardState } from "../../core/payload/types";
import { TransactionList } from "../block/TransactionList";
import { OfflineIndicator } from "../block/OfflineIndicator";
import { Button } from "../ui/button";
import { LoadingState } from "../block/LoadingState";
import { KioskLayout } from "../layout/KioskLayout";
import { NfcTapArea, NfcStatusLabel } from "../block/NfcTapArea";
import { CheckoutConfirmCard } from "../block/CheckoutConfirmCard";
import { formatDuration } from "../../lib/formatters";
import { useState } from "react";

interface TerminalSectionProps {
  tenantId: string;
  tenantName: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
}

export function TerminalSection({
  tenantId,
  tenantName,
  accountId,
  deviceId,
  terminalId,
}: TerminalSectionProps) {
  const {
    grant,
    loading: grantLoading,
    error: grantError,
  } = useSessionGrant(tenantId, accountId, deviceId, "terminal");
  const { state, scan, write, reset } = useNfcCard(grant, tenantId, terminalId);
  const { status: syncStatus, pendingCount, sync } = useReconciliation(tenantId, terminalId);
  const [lastTx, setLastTx] = useState<{ durationSeconds: number; fee: number } | null>(null);

  async function handleCheckout() {
    if (!state.payload || !grant) return;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const cardState = state.payload.wallet.state;
    const trigger = cardState === CardState.STATION_OPERATION ? "force_checkout" : "gate_checkout";
    const result = validateTransition(state.payload, trigger, nowSeconds);
    if (!result.valid) return;
    const durationSeconds = nowSeconds - state.payload.session.startTime;
    const hours = Math.ceil(durationSeconds / 3600);
    const fee = Math.min(hours * PARKING_RATE_PER_HOUR, state.payload.wallet.balance);
    setLastTx({ durationSeconds, fee });
    await write(applyCheckout(state.payload, nowSeconds));
  }

  const previewFee = (() => {
    if (!state.payload) return null;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const durationSeconds = nowSeconds - state.payload.session.startTime;
    const hours = Math.ceil(durationSeconds / 3600);
    return {
      durationSeconds,
      fee: Math.min(hours * PARKING_RATE_PER_HOUR, state.payload.wallet.balance),
    };
  })();

  const cardState = state.payload?.wallet.state;
  const canCheckout =
    cardState === CardState.CHECKED_IN || cardState === CardState.STATION_OPERATION;

  const syncTrailing = (
    <OfflineIndicator pendingCount={pendingCount} onSync={sync} syncStatus={syncStatus} />
  );

  return (
    <KioskLayout
      title="Terminal"
      tenantName={tenantName}
      tenantId={tenantId}
      currentMode="terminal"
      trailing={syncTrailing}
    >
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        {grantLoading && (
          <LoadingState variant="inline" text="Memuat sesi..." className="text-white/70" />
        )}
        {!grant && !grantLoading && (
          <div className="w-full max-w-xs rounded-xl bg-signal-bg-error border border-signal-error/30 p-4">
            <p className="type-body1 text-signal-error text-center">
              {grantError ? `Error: ${grantError}` : "Tidak ada sesi aktif. Hubungi petugas."}
            </p>
          </div>
        )}

        {/* Idle */}
        {state.phase === "idle" && (
          <div className="flex flex-col items-center gap-6">
            <NfcTapArea phase="idle" onClick={scan} disabled={!grant || grantLoading} />
            <Button
              onClick={scan}
              disabled={!grant || grantLoading}
              className="w-full max-w-xs h-12 bg-brand hover:bg-brand/90 text-white type-title-bold"
            >
              Tap Kartu untuk Mulai
            </Button>
          </div>
        )}

        {/* Scanning */}
        {state.phase === "scanning" && (
          <div className="flex flex-col items-center gap-4">
            <NfcTapArea phase="scanning" />
            <NfcStatusLabel phase="scanning" />
          </div>
        )}

        {/* Error */}
        {state.phase === "error" && (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            <NfcTapArea phase="error" tamperDetected={state.tamperDetected} />
            <NfcStatusLabel
              phase="error"
              error={state.error}
              tamperDetected={state.tamperDetected}
            />
            <Button variant="outline" onClick={reset} className="w-full">
              Coba Lagi
            </Button>
          </div>
        )}

        {/* Card ready / writing */}
        {(state.phase === "ready" || state.phase === "writing") && state.payload && (
          <div className="w-full max-w-xs space-y-4">
            {canCheckout && previewFee ? (
              <CheckoutConfirmCard
                payload={state.payload}
                durationSeconds={previewFee.durationSeconds}
                fee={previewFee.fee}
                onConfirm={handleCheckout}
                phase={state.phase}
              />
            ) : cardState === CardState.IDLE ? (
              <div className="bg-white rounded-2xl border p-4 space-y-3 text-center">
                <p className="type-body1 text-muted-foreground">Anggota belum check-in</p>
                <Button variant="outline" onClick={reset} className="w-full">
                  Selesai
                </Button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border p-4 space-y-3 text-center">
                <p className="type-body1 text-muted-foreground">Anggota sudah checkout</p>
                <Button variant="outline" onClick={reset} className="w-full">
                  Selesai
                </Button>
              </div>
            )}
            <TransactionList
              entries={state.payload.logEntries}
              sessionStart={state.payload.session.startTime}
            />
          </div>
        )}

        {/* Success */}
        {state.phase === "success" && state.payload && lastTx && (
          <div className="w-full max-w-xs space-y-4">
            <div className="bg-white rounded-2xl border p-4 space-y-3">
              <p className="type-title-bold text-signal-valid">✓ Checkout Berhasil</p>
              <p className="type-title-bold text-foreground">{state.payload.identity.name}</p>
              <div className="space-y-1">
                <div className="flex justify-between type-body2">
                  <span className="text-muted-foreground">Durasi</span>
                  <span>{formatDuration(lastTx.durationSeconds)}</span>
                </div>
                <div className="flex justify-between type-body2">
                  <span className="text-muted-foreground">Biaya</span>
                  <span>Rp {lastTx.fee.toLocaleString("id-ID")}</span>
                </div>
                <div className="flex justify-between type-body2">
                  <span className="text-muted-foreground">Saldo</span>
                  <span className="text-brand font-medium">
                    Rp {state.payload.wallet.balance.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>
            </div>
            <Button
              onClick={reset}
              className="w-full h-12 bg-brand hover:bg-brand/90 text-white type-title-bold"
            >
              Scan Berikutnya
            </Button>
          </div>
        )}
      </div>
    </KioskLayout>
  );
}
