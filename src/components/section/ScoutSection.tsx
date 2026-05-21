import { useNfcCard } from "../../hooks/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { useBlockedCheck } from "../../hooks/useBlockedCheck";
import { CardStatusBadge } from "../block/CardStatusBadge";
import { TransactionList } from "../block/TransactionList";
import { FeedbackCard } from "../block/FeedbackCard";
import { Button } from "../ui/button";
import { LoadingState } from "../block/LoadingState";
import { KioskLayout } from "../layout/KioskLayout";
import { NfcTapArea, NfcStatusLabel } from "../block/NfcTapArea";

interface ScoutSectionProps {
  tenantId: string;
  tenantName: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
}

export function ScoutSection({
  tenantId,
  tenantName,
  accountId,
  deviceId,
  terminalId,
}: ScoutSectionProps) {
  const { grant, loading } = useSessionGrant(tenantId, accountId, deviceId, "scout");
  const { state, scan, reset } = useNfcCard(grant, tenantId, terminalId, { lenient: true });

  const blockedCheck = useBlockedCheck({
    tenantId,
    serialNumber: state.serialNumber,
    phase: state.phase,
    payload: state.payload,
  });

  return (
    <KioskLayout title="Cek Saldo" tenantName={tenantName} tenantId={tenantId} currentMode="scout">
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        {!grant && !loading && (
          <div className="w-full max-w-xs rounded-xl bg-signal-bg-error border border-signal-error/30 p-4">
            <p className="type-body1 text-signal-error text-center">Tidak ada sesi aktif.</p>
          </div>
        )}

        {/* Idle */}
        {state.phase === "idle" && (
          <div className="flex flex-col items-center gap-6">
            <NfcTapArea
              phase="idle"
              onClick={scan}
              disabled={!grant || loading}
              label="Cek Saldo"
            />
            <Button
              onClick={scan}
              disabled={!grant || loading}
              className="w-full max-w-xs h-12 bg-signal-info hover:bg-signal-info/90 text-white type-title-bold"
            >
              {loading ? (
                <LoadingState variant="button" text="Memuat sesi..." />
              ) : (
                "Tempelkan Kartu"
              )}
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
            {blockedCheck.notInLocalDb && (
              <div className="rounded-xl bg-amber-50 border border-amber-300/50 p-3">
                <p className="type-body2 text-amber-700 text-center">
                  ⚠️ Kartu tidak ditemukan di database lokal. Data mungkin belum tersinkronisasi.
                </p>
              </div>
            )}

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
    </KioskLayout>
  );
}
