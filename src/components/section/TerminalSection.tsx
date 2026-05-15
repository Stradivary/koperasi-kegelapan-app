import { useNfcCard } from "../../hooks/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { useReconciliation } from "../../hooks/useReconciliation";
import { applyDebit, isWriteEligible } from "../../core/state-machine/engine";
import { CardStatus } from "../../core/payload/types";
import { CardStatusBadge } from "../block/CardStatusBadge";
import { TransactionList } from "../block/TransactionList";
import { OfflineIndicator } from "../block/OfflineIndicator";
import { Button } from "../ui/button";
import { KioskLayout } from "../layout/KioskLayout";
import { NfcTapArea, NfcStatusLabel } from "../block/NfcTapArea";
import { useState } from "react";

interface TerminalSectionProps {
  tenantId: string;
  tenantName: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
}

const MAX_TRANSACTION_AMOUNT = 1_000_000;

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
  } = useSessionGrant(tenantId, accountId, deviceId);
  const { state, scan, write, reset } = useNfcCard(grant, tenantId, terminalId);
  const { status: syncStatus, pendingCount, sync } = useReconciliation(tenantId, terminalId);
  const [amountInput, setAmountInput] = useState("");
  const [txError, setTxError] = useState<string | null>(null);

  async function handleDebit() {
    if (!state.payload || !grant) return;
    const amount = parseInt(amountInput, 10);
    if (isNaN(amount) || amount <= 0) {
      setTxError("Nominal tidak valid");
      return;
    }
    if (amount > MAX_TRANSACTION_AMOUNT) {
      setTxError(`Maks Rp ${MAX_TRANSACTION_AMOUNT.toLocaleString("id-ID")}`);
      return;
    }
    if (state.payload.wallet.balance < amount) {
      setTxError("Saldo tidak cukup");
      return;
    }
    const eligibility = isWriteEligible(
      state.payload,
      grant,
      "debit",
      Math.floor(Date.now() / 1000),
    );
    if (!eligibility.eligible) {
      setTxError(eligibility.reason ?? "Tidak dapat diproses");
      return;
    }
    setTxError(null);
    const nowSeconds = Math.floor(Date.now() / 1000);
    await write(applyDebit(state.payload, amount, nowSeconds));
    setAmountInput("");
  }

  const syncTrailing = (
    <OfflineIndicator pendingCount={pendingCount} onSync={sync} syncStatus={syncStatus} />
  );

  return (
    <KioskLayout title="Terminal" tenantName={tenantName} trailing={syncTrailing}>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        {grantLoading && <p className="type-body2 text-white/70 animate-pulse">Memuat sesi...</p>}
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

        {/* Card ready */}
        {(state.phase === "ready" || state.phase === "writing" || state.phase === "success") &&
          state.payload && (
            <div className="w-full max-w-xs space-y-4">
              <div className="bg-white rounded-2xl border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="type-title-bold text-foreground">{state.payload.identity.name}</p>
                  <CardStatusBadge status={state.payload.identity.status} />
                </div>
                <div>
                  <p className="type-body2 text-signal-text-secondary">Saldo</p>
                  <p className="type-h4 text-brand font-heading">
                    Rp {state.payload.wallet.balance.toLocaleString("id-ID")}
                  </p>
                </div>
                <p className="type-body2 font-mono text-muted-foreground">
                  {Array.from(state.payload.header.cardId)
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("")}
                </p>
              </div>

              {state.phase === "success" && (
                <div className="rounded-2xl bg-signal-bg-valid border border-signal-valid/30 p-4 text-center">
                  <p className="type-title-bold text-signal-valid">Transaksi selesai</p>
                </div>
              )}

              {state.payload.identity.status === CardStatus.ACTIVE && state.phase !== "success" && (
                <div className="space-y-2">
                  <input
                    type="number"
                    placeholder="Nominal (IDR)"
                    className="flex h-12 w-full rounded-xl border-2 border-input bg-background px-4 type-body1 focus:border-brand focus:outline-none"
                    value={amountInput}
                    onChange={(e) => {
                      setAmountInput(e.target.value);
                      setTxError(null);
                    }}
                    disabled={state.phase === "writing"}
                  />
                  {txError && <p className="type-body2 text-signal-error">{txError}</p>}
                  <Button
                    onClick={handleDebit}
                    disabled={state.phase === "writing" || !amountInput}
                    className="w-full h-12 bg-brand hover:bg-brand/90 text-white type-title-bold"
                  >
                    {state.phase === "writing" ? "Memproses..." : "Bayar"}
                  </Button>
                </div>
              )}

              <TransactionList
                entries={state.payload.logEntries}
                sessionStart={state.payload.session.startTime}
              />

              <Button variant="outline" onClick={reset} className="w-full">
                Selesai
              </Button>
            </div>
          )}
      </div>
    </KioskLayout>
  );
}
