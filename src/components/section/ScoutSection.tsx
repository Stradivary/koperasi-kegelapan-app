import { useEffect } from "react";
import { useNfcCard } from "#/hooks/nfc/useNfcCard";
import { useSessionGrant } from "#/hooks/useSessionGrant";
import { useBlockedCheck } from "#/hooks/useBlockedCheck";
import { useKioskAutoScan } from "#/hooks/useKioskAutoScan";
import { updateLocalCardRecord, updateLocalUserFromCard } from "#/hooks/nfc/updateLocalCardRecord";
import { CardStatusBadge } from "../block/CardStatusBadge";
import { TransactionList } from "../block/TransactionList";
import { FeedbackCard } from "../block/FeedbackCard";
import { Button } from "../ui/button";
import { NfcTapArea, NfcStatusLabel } from "../block/NfcTapArea";

interface ScoutSectionProps {
  tenantId: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
}

export function ScoutSection({ tenantId, accountId, deviceId, terminalId }: ScoutSectionProps) {
  const { grant, loading } = useSessionGrant(tenantId, accountId, deviceId, "scout");
  const { state, scan, reset } = useNfcCard(grant, tenantId, terminalId, { lenient: true });

  const blockedCheck = useBlockedCheck({
    tenantId,
    serialNumber: state.serialNumber,
    phase: state.phase,
    payload: state.payload,
  });

  // Auto-scan on mount and after each cycle completes
  useKioskAutoScan({
    enabled: true,
    grant,
    loading,
    phase: state.phase,
    scan,
    autoStart: true,
  });

  // Update local card and user records when a card is successfully read.
  // This ensures the local DB reflects the latest physical card state (balance,
  // counter, status) even from a read-only scout operation — enabling accurate
  // blocked-status checks and data recovery from card history without server sync.
  useEffect(() => {
    if (state.phase === "ready" && state.payload) {
      void updateLocalCardRecord(tenantId, state.payload);
      void updateLocalUserFromCard(tenantId, state.payload);
    }
  }, [state.phase, state.payload, tenantId]);

  // Auto-reset after displaying card info so the scan loop continues
  useEffect(() => {
    if (state.phase === "ready" && state.payload && !blockedCheck.isChecking) {
      const timer = setTimeout(() => {
        reset();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [state.phase, state.payload, blockedCheck.isChecking, reset]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
      {!grant && !loading && (
        <div className="w-full max-w-xs rounded-xl bg-signal-bg-error border border-signal-error/30 p-4">
          <p className="type-body1 text-signal-error text-center">Tidak ada sesi aktif.</p>
        </div>
      )}

      {/* Idle — waiting for auto-scan */}
      {state.phase === "idle" && (
        <div className="flex flex-col items-center gap-4">
          <NfcTapArea phase="scanning" />
          <NfcStatusLabel phase="scanning" />
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
        <FeedbackCard
          variant="error"
          title="Gagal Membaca Kartu"
          subtitle={state.error ?? "Terjadi kesalahan"}
          actions={[{ label: "Coba Lagi", onClick: reset, variant: "outline" }]}
        />
      )}

      {/* Ready — blocked check in progress */}
      {state.phase === "ready" && state.payload && blockedCheck.isChecking && (
        <div className="flex flex-col items-center gap-4 w-full max-w-xs">
          <NfcTapArea phase="validating" />
          <p className="type-body2 text-muted-foreground animate-pulse">Memproses...</p>
        </div>
      )}

      {/* Ready — card info display (after blocked check completes) */}
      {state.phase === "ready" && state.payload && !blockedCheck.isChecking && (
        <div className="w-full max-w-xs space-y-4">
          {/* Blocked reason warning */}
          {blockedCheck.isBlocked && blockedCheck.blockedReason && (
            <FeedbackCard
              variant="warning"
              title="Kartu Diblokir"
              subtitle={blockedCheck.blockedReason}
            />
          )}

          {/* Not in local DB warning */}

          {/* Card info — always shown regardless of blocked status */}
          <div className="bg-white rounded-2xl border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="type-title-bold text-foreground text-lg">
                {state.payload.identity.name}
              </p>
              <CardStatusBadge
                status={state.payload.identity.status}
                localBlockedReason={blockedCheck.blockedReason}
              />
            </div>

            <div className="text-center py-2">
              <p className="type-body2 text-signal-text-secondary">Saldo</p>
              <p className="type-h2 text-signal-info font-heading">
                Rp {state.payload.wallet.balance.toLocaleString("id-ID")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div>
                <p className="type-body2 text-signal-text-secondary">Kartu ID</p>
                <p className="type-body2 font-mono text-foreground">
                  {Array.from(state.payload.header.cardId)
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("")}
                </p>
              </div>
              <div>
                <p className="type-body2 text-signal-text-secondary">Transaksi ke-</p>
                <p className="type-title-bold text-foreground">
                  {(state.payload.wallet.counter - 1n).toString()}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t">
              <p className="type-body2 text-signal-text-secondary">Status</p>
              <CardStatusBadge
                status={state.payload.identity.status}
                localBlockedReason={blockedCheck.blockedReason}
              />
            </div>
          </div>

          <TransactionList
            entries={state.payload.logEntries}
            sessionStart={state.payload.session.startTime}
          />

          <Button variant="outline" onClick={reset} className="w-full h-12">
            Selesai
          </Button>
        </div>
      )}

      {/* Success phase (shouldn't normally occur in Scout since no write, but handle gracefully) */}
      {state.phase === "success" && state.payload && (
        <div className="w-full max-w-xs space-y-4">
          <div className="bg-white rounded-2xl border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="type-title-bold text-foreground text-lg">
                {state.payload.identity.name}
              </p>
              <CardStatusBadge
                status={state.payload.identity.status}
                localBlockedReason={blockedCheck.blockedReason}
              />
            </div>

            <div className="text-center py-2">
              <p className="type-body2 text-signal-text-secondary">Saldo</p>
              <p className="type-h2 text-signal-info font-heading">
                Rp {state.payload.wallet.balance.toLocaleString("id-ID")}
              </p>
            </div>
          </div>

          <Button variant="outline" onClick={reset} className="w-full h-12">
            Selesai
          </Button>
        </div>
      )}
    </div>
  );
}
