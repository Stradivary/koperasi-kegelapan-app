import { useNfcCard } from '../../hooks/useNfcCard'
import { useSessionGrant } from '../../hooks/useSessionGrant'
import { validateTransition, applyCheckin, applyCheckout } from '../../core/state-machine/engine'
import { CardState } from '../../core/payload/types'
import { CardStatusBadge } from '../block/CardStatusBadge'
import { Button } from '../ui/button'
import { KioskLayout } from '../layout/KioskLayout'
import { NfcTapArea, NfcStatusLabel } from '../block/NfcTapArea'
import { LogIn, LogOut } from 'lucide-react'

interface GateSectionProps {
  tenantId: string
  tenantName: string
  accountId: string
  deviceId: string
  terminalId: number
}

export function GateSection({ tenantId, tenantName, accountId, deviceId, terminalId }: GateSectionProps) {
  const { grant, loading } = useSessionGrant(tenantId, accountId, deviceId)
  const { state, scan, write, reset } = useNfcCard(grant, tenantId, terminalId)

  async function handleCheckin() {
    if (!state.payload) return
    const nowSeconds = Math.floor(Date.now() / 1000)
    const result = validateTransition(state.payload, 'gate_checkin', nowSeconds)
    if (!result.valid) { alert(result.reason); return }
    await write(applyCheckin(state.payload, terminalId, nowSeconds))
  }

  async function handleCheckout() {
    if (!state.payload) return
    const nowSeconds = Math.floor(Date.now() / 1000)
    const trigger = state.payload.wallet.state === CardState.IDLE ? 'force_checkout' : 'gate_checkout'
    const result = validateTransition(state.payload, trigger, nowSeconds)
    if (!result.valid) { alert(result.reason); return }
    await write(applyCheckout(state.payload, nowSeconds))
  }

  const cardState = state.payload?.wallet.state
  const isCheckedIn = cardState === CardState.CHECKED_IN || cardState === CardState.TERMINAL_OPERATION

  return (
    <KioskLayout title="Akses Masuk" subtitle="Gate" tenantName={tenantName}>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">

        {!grant && !loading && (
          <div className="w-full max-w-xs rounded-xl bg-signal-bg-error border border-signal-error/30 p-4">
            <p className="type-body1 text-signal-error text-center">Tidak ada sesi aktif.</p>
          </div>
        )}

        {/* Idle */}
        {state.phase === 'idle' && (
          <div className="flex flex-col items-center gap-6">
            <NfcTapArea phase="idle" onClick={scan} disabled={!grant || loading} />
            <Button
              onClick={scan}
              disabled={!grant || loading}
              className="w-full max-w-xs h-12 bg-brand-dark hover:bg-brand-dark/90 text-white type-title-bold"
            >
              {loading ? 'Memuat sesi...' : 'Tap Kartu'}
            </Button>
          </div>
        )}

        {/* Scanning */}
        {state.phase === 'scanning' && (
          <div className="flex flex-col items-center gap-4">
            <NfcTapArea phase="scanning" />
            <NfcStatusLabel phase="scanning" />
          </div>
        )}

        {/* Error */}
        {state.phase === 'error' && (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            <NfcTapArea phase="error" tamperDetected={state.tamperDetected} />
            <NfcStatusLabel phase="error" error={state.error} tamperDetected={state.tamperDetected} />
            <Button variant="outline" onClick={reset} className="w-full">Coba Lagi</Button>
          </div>
        )}

        {/* Card ready */}
        {(state.phase === 'ready' || state.phase === 'writing' || state.phase === 'success') && state.payload && (
          <div className="w-full max-w-xs space-y-4">
            <div className="bg-white rounded-2xl border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="type-title-bold text-foreground">{state.payload.identity.name}</p>
                <CardStatusBadge status={state.payload.identity.status} />
              </div>
              <div className="flex items-center gap-2">
                <span className={[
                  'px-2 py-0.5 rounded-full type-body2-bold',
                  isCheckedIn
                    ? 'bg-signal-bg-valid text-signal-valid'
                    : 'bg-signal-bg-info text-signal-info',
                ].join(' ')}>
                  {isCheckedIn ? 'Sudah Masuk' : 'Belum Masuk'}
                </span>
              </div>
            </div>

            {state.phase === 'success' && (
              <div className="rounded-2xl bg-signal-bg-valid border border-signal-valid/30 p-5 text-center">
                <p className="type-title-bold text-signal-valid">
                  {isCheckedIn ? '✓ Check-in berhasil' : '✓ Check-out berhasil'}
                </p>
              </div>
            )}

            {state.phase !== 'success' && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={handleCheckin}
                  disabled={state.phase === 'writing' || isCheckedIn}
                  className="h-14 flex-col gap-1 bg-brand-dark hover:bg-brand-dark/90 text-white"
                >
                  <LogIn size={20} />
                  <span className="type-body2-bold">Masuk</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCheckout}
                  disabled={state.phase === 'writing' || !isCheckedIn}
                  className="h-14 flex-col gap-1 border-2"
                >
                  <LogOut size={20} />
                  <span className="type-body2-bold">Keluar</span>
                </Button>
              </div>
            )}

            <Button variant="outline" onClick={reset} className="w-full">Selesai</Button>
          </div>
        )}
      </div>
    </KioskLayout>
  )
}
