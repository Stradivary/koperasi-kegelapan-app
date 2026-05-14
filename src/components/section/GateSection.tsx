import { useState, useEffect } from 'react'
import { useNfcCard } from '../../hooks/useNfcCard'
import { useSessionGrant } from '../../hooks/useSessionGrant'
import { validateTransition, applyCheckin, applyCheckout } from '../../core/state-machine/engine'
import { CardState } from '../../core/payload/types'
import { Button } from '../ui/button'
import { KioskLayout } from '../layout/KioskLayout'
import { NfcTapArea } from '../block/NfcTapArea'
import { NfcScanDrawer } from '../block/NfcScanDrawer'

interface GateSectionProps {
  tenantId: string
  tenantName: string
  accountId: string
  deviceId: string
  terminalId: number
}

export function GateSection({ tenantId, tenantName, accountId, deviceId, terminalId }: GateSectionProps) {
  const { grant, loading } = useSessionGrant(tenantId, accountId, deviceId)
  const { state, scan, write, reset, cancel } = useNfcCard(grant, tenantId, terminalId)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Auto-close drawer after success
  useEffect(() => {
    if (state.phase === 'success') {
      const timer = setTimeout(() => {
        reset()
        setIsDrawerOpen(false)
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [state.phase, reset])

  function handleScan() {
    setIsDrawerOpen(true)
    scan()
  }

  function handleDrawerClose() {
    if (state.phase === 'scanning' || state.phase === 'validating') {
      cancel()
    } else {
      reset()
    }
    setIsDrawerOpen(false)
  }

  function handleDrawerOpenChange(open: boolean) {
    if (!open) handleDrawerClose()
  }

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

        <div className="flex flex-col items-center gap-6">
          <NfcTapArea phase="idle" onClick={handleScan} disabled={!grant || loading} />
          <Button
            onClick={handleScan}
            disabled={!grant || loading}
            className="w-full max-w-xs h-12 bg-brand-dark hover:bg-brand-dark/90 text-white type-title-bold"
          >
            {loading ? 'Memuat sesi...' : 'Tap Kartu'}
          </Button>
        </div>
      </div>

      <NfcScanDrawer
        open={isDrawerOpen}
        onOpenChange={handleDrawerOpenChange}
        phase={state.phase}
        payload={state.payload}
        isCheckedIn={isCheckedIn}
        error={state.error}
        tamperDetected={state.tamperDetected}
        onCheckin={handleCheckin}
        onCheckout={handleCheckout}
        onClose={handleDrawerClose}
        onRetry={scan}
      />
    </KioskLayout>
  )
}
