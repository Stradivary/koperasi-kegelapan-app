import { useNfcCard } from '../../hooks/useNfcCard'
import { useSessionGrant } from '../../hooks/useSessionGrant'
import { validateTransition, applyCheckin, applyCheckout } from '../../core/state-machine/engine'
import { CardState } from '../../core/payload/types'
import { CardStatusBadge } from '../block/CardStatusBadge'
import { Button } from '../ui/button'

interface GateSectionProps {
  tenantId: string
  accountId: string
  deviceId: string
  terminalId: number
}

export function GateSection({ tenantId, accountId, deviceId, terminalId }: GateSectionProps) {
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
    <div className="max-w-sm mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Gate</h1>

      {loading && <p className="text-sm text-muted-foreground">Loading session grant...</p>}
      {!grant && !loading && <p className="text-sm text-destructive">No active session grant.</p>}

      {state.phase === 'idle' && (
        <Button onClick={scan} disabled={!grant} className="w-full h-16 text-lg">
          Tap Card
        </Button>
      )}

      {state.phase === 'scanning' && (
        <p className="text-center text-sm text-muted-foreground animate-pulse py-8">Waiting for card...</p>
      )}

      {state.phase === 'error' && (
        <div className="rounded-lg border border-destructive p-4 space-y-2">
          <p className="text-sm text-destructive">{state.tamperDetected ? 'Tamper detected' : state.error}</p>
          <Button variant="outline" onClick={reset} className="w-full">Retry</Button>
        </div>
      )}

      {(state.phase === 'ready' || state.phase === 'writing' || state.phase === 'success') && state.payload && (
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{state.payload.identity.name}</span>
              <CardStatusBadge status={state.payload.identity.status} />
            </div>
            <div className="text-sm text-muted-foreground">
              State: {CardState[cardState ?? 0]}
            </div>
          </div>

          {state.phase === 'success' && (
            <div className="rounded-lg border border-green-500 bg-green-50 p-3 text-sm text-green-700">
              {isCheckedIn ? 'Checked in' : 'Checked out'}
            </div>
          )}

          {state.phase !== 'success' && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleCheckin}
                disabled={state.phase === 'writing' || isCheckedIn}
              >
                Check In
              </Button>
              <Button
                variant="outline"
                onClick={handleCheckout}
                disabled={state.phase === 'writing' || !isCheckedIn}
              >
                Check Out
              </Button>
            </div>
          )}

          <Button variant="outline" onClick={reset} className="w-full">Done</Button>
        </div>
      )}
    </div>
  )
}
