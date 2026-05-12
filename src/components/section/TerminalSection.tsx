import { useNfcCard } from '../../hooks/useNfcCard'
import { useSessionGrant } from '../../hooks/useSessionGrant'
import { useReconciliation } from '../../hooks/useReconciliation'
import { applyDebit } from '../../core/state-machine/engine'
import { isWriteEligible } from '../../core/state-machine/engine'
import { CardStatus } from '../../core/payload/types'
import { CardStatusBadge } from '../block/CardStatusBadge'
import { TransactionList } from '../block/TransactionList'
import { OfflineIndicator } from '../block/OfflineIndicator'
import { Button } from '../ui/button'
import { useState } from 'react'

interface TerminalSectionProps {
  tenantId: string
  accountId: string
  deviceId: string
  terminalId: number
}

const MAX_TRANSACTION_AMOUNT = 1_000_000

export function TerminalSection({ tenantId, accountId, deviceId, terminalId }: TerminalSectionProps) {
  const { grant, loading: grantLoading, error: grantError } = useSessionGrant(tenantId, accountId, deviceId)
  const { state, scan, write, reset } = useNfcCard(grant, tenantId, terminalId)
  const { status: syncStatus, pendingCount, sync } = useReconciliation(tenantId, terminalId)
  const [amountInput, setAmountInput] = useState('')
  const [txError, setTxError] = useState<string | null>(null)

  async function handleDebit() {
    if (!state.payload || !grant) return
    const amount = parseInt(amountInput, 10)
    if (isNaN(amount) || amount <= 0) { setTxError('Invalid amount'); return }
    if (amount > MAX_TRANSACTION_AMOUNT) { setTxError(`Amount exceeds Rp ${MAX_TRANSACTION_AMOUNT.toLocaleString()}`); return }
    if (state.payload.wallet.balance < amount) { setTxError('Insufficient balance'); return }

    const eligibility = isWriteEligible(state.payload, grant, 'debit', Math.floor(Date.now() / 1000))
    if (!eligibility.eligible) { setTxError(eligibility.reason ?? 'Not eligible'); return }

    setTxError(null)
    const nowSeconds = Math.floor(Date.now() / 1000)
    const updated = applyDebit(state.payload, amount, nowSeconds)
    await write(updated)
    setAmountInput('')
  }

  return (
    <div className="max-w-sm mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Terminal</h1>
        <OfflineIndicator pendingCount={pendingCount} onSync={sync} syncStatus={syncStatus} />
      </div>

      {grantLoading && <p className="text-sm text-muted-foreground">Loading session grant...</p>}
      {grantError && <p className="text-sm text-destructive">Grant error: {grantError}</p>}
      {!grant && !grantLoading && (
        <p className="text-sm text-destructive">No active session grant. Go online to refresh.</p>
      )}

      {state.phase === 'idle' && (
        <Button onClick={scan} disabled={!grant} className="w-full h-16 text-lg">
          Tap Card to Start
        </Button>
      )}

      {state.phase === 'scanning' && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground animate-pulse">Waiting for card...</p>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="rounded-lg border border-destructive p-4 space-y-2">
          <p className="text-sm font-medium text-destructive">
            {state.tamperDetected ? 'Tamper detected' : 'Error'}
          </p>
          <p className="text-xs text-muted-foreground">{state.error}</p>
          <Button variant="outline" onClick={reset} className="w-full">
            Try Again
          </Button>
        </div>
      )}

      {(state.phase === 'ready' || state.phase === 'writing' || state.phase === 'success') && state.payload && (
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{state.payload.identity.name}</span>
              <CardStatusBadge status={state.payload.identity.status} />
            </div>
            <div className="text-2xl font-bold">
              Rp {state.payload.wallet.balance.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              Card #{Array.from(state.payload.header.cardId).map((b) => b.toString(16).padStart(2, '0')).join('')}
            </div>
          </div>

          {state.phase === 'success' && (
            <div className="rounded-lg border border-green-500 bg-green-50 p-3 text-sm text-green-700">
              Transaction complete
            </div>
          )}

          {state.payload.identity.status === CardStatus.ACTIVE && state.phase !== 'success' && (
            <div className="space-y-2">
              <input
                type="number"
                placeholder="Amount (IDR)"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={amountInput}
                onChange={(e) => { setAmountInput(e.target.value); setTxError(null) }}
                disabled={state.phase === 'writing'}
              />
              {txError && <p className="text-xs text-destructive">{txError}</p>}
              <Button
                onClick={handleDebit}
                disabled={state.phase === 'writing' || !amountInput}
                className="w-full"
              >
                {state.phase === 'writing' ? 'Writing...' : 'Debit'}
              </Button>
            </div>
          )}

          <TransactionList entries={state.payload.logEntries} sessionStart={state.payload.session.startTime} />

          <Button variant="outline" onClick={reset} className="w-full">
            Done
          </Button>
        </div>
      )}
    </div>
  )
}
