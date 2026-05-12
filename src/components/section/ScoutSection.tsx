import { useNfcCard } from '../../hooks/useNfcCard'
import { useSessionGrant } from '../../hooks/useSessionGrant'
import { CardStatusBadge } from '../block/CardStatusBadge'
import { TransactionList } from '../block/TransactionList'
import { Button } from '../ui/button'

interface ScoutSectionProps {
  tenantId: string
  accountId: string
  deviceId: string
  terminalId: number
}

export function ScoutSection({ tenantId, accountId, deviceId, terminalId }: ScoutSectionProps) {
  const { grant, loading } = useSessionGrant(tenantId, accountId, deviceId)
  const { state, scan, reset } = useNfcCard(grant, tenantId, terminalId)

  return (
    <div className="max-w-sm mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cek Saldo</h1>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">Scout</span>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Memuat sesi...</p>}
      {!grant && !loading && <p className="text-sm text-destructive">Tidak ada sesi aktif.</p>}

      {state.phase === 'idle' && (
        <Button onClick={scan} disabled={!grant} className="w-full h-16 text-base">
          📳 Tempelkan Kartu
        </Button>
      )}

      {state.phase === 'scanning' && (
        <div className="text-center py-10">
          <p className="animate-pulse text-sm text-muted-foreground">Menunggu kartu...</p>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="rounded-lg border border-destructive p-4 space-y-2">
          <p className="text-sm text-destructive">
            {state.tamperDetected ? '⚠️ Kartu terdeteksi rusak' : state.error}
          </p>
          <Button variant="outline" onClick={reset} className="w-full">Coba Lagi</Button>
        </div>
      )}

      {(state.phase === 'ready' || state.phase === 'success') && state.payload && (
        <div className="space-y-4">
          <div className="rounded-xl border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-lg">{state.payload.identity.name}</span>
              <CardStatusBadge status={state.payload.identity.status} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo</p>
              <p className="text-3xl font-bold text-primary">
                Rp {state.payload.wallet.balance.toLocaleString()}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Kartu ID</p>
                <p className="font-mono text-xs">
                  {Array.from(state.payload.header.cardId).map((b) => b.toString(16).padStart(2, '0')).join('')}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Transaksi ke-</p>
                <p className="font-semibold">{state.payload.wallet.counter.toString()}</p>
              </div>
            </div>
          </div>

          <TransactionList
            entries={state.payload.logEntries}
            sessionStart={state.payload.session.startTime}
          />

          <Button variant="outline" onClick={reset} className="w-full">Selesai</Button>
        </div>
      )}
    </div>
  )
}
