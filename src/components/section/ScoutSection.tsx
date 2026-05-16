import { useNfcCard } from "../../hooks/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { CardStatusBadge } from "../block/CardStatusBadge";
import { TransactionList } from "../block/TransactionList";
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
  const { state, scan, reset } = useNfcCard(grant, tenantId, terminalId);

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

        {/* Card info */}
        {(state.phase === "ready" || state.phase === "success") && state.payload && (
          <div className="w-full max-w-xs space-y-4">
            <div className="bg-white rounded-2xl border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="type-title-bold text-foreground text-lg">
                  {state.payload.identity.name}
                </p>
                <CardStatusBadge status={state.payload.identity.status} />
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
                    {state.payload.wallet.counter.toString()}
                  </p>
                </div>
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
      </div>
    </KioskLayout>
  );
}
