/**
 * The Terminal — Exit Terminal
 *
 * Full-screen terminal UI for member check-out via NFC card tap.
 * Displays tariff breakdown after successful check-out.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 8.4, 16.1, 16.2
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback, useRef } from 'react'
import {
  StatusIndicator,
  SyncStatusBar,
  ErrorDisplay,
  TariffBreakdown,
} from '#/components/terminal/index.ts'
import { Button } from '#/components/ui/button.tsx'
import type { TerminalStatus } from '#/components/terminal/StatusIndicator.tsx'
import type { SyncStatus } from '#/lib/sync/types.ts'
import type { PipelineResult, CardCryptoKeys } from '#/lib/nfc/types.ts'
import type { TenantCardConfig, TransactionRecord } from '#/lib/card/types.ts'

export const Route = createFileRoute('/terminal/exit')({
  component: ExitPage,
})

interface TariffInfo {
  entryTime: number
  exitTime: number
  durationHours: number
  ratePerHour: number
  totalCharge: number
  balanceBefore: number
  balanceAfter: number
}

function ExitPage() {
  const [status, setStatus] = useState<TerminalStatus>('ready')
  const [errorInfo, setErrorInfo] = useState<{
    code: string
    message: string
  } | null>(null)
  const [tariffInfo, setTariffInfo] = useState<TariffInfo | null>(null)

  // Sync status state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    pendingCount: 0,
    lastSyncTimestamp: null,
    isSyncing: false,
  })

  const abortRef = useRef<AbortController | null>(null)

  // TODO: Get from tenant context
  const ratePerHour = 2000

  const handleCheckOut = useCallback(async () => {
    setStatus('tap-now')
    setErrorInfo(null)
    setTariffInfo(null)

    abortRef.current = new AbortController()

    try {
      setStatus('processing')

      const { executeCardPipeline } = await import(
        '#/lib/nfc/pipeline.ts'
      )
      const { processCheckOut } = await import(
        '#/lib/card/operations.ts'
      )

      const config: TenantCardConfig = {
        tid: 'KOP-001',
        tariffRatePerHour: ratePerHour,
        maxBalance: 10_000_000,
        minBalanceForEntry: 2000,
      }

      const keys: CardCryptoKeys = {
        encryptionKey: null as unknown as CryptoKey,
        rotatingEncryptionKey: null,
        hmacKey: null as unknown as CryptoKey,
      }

      const result: PipelineResult = await executeCardPipeline(
        processCheckOut,
        config,
        keys,
        { signal: abortRef.current.signal },
      )

      if (result.success) {
        const tx: TransactionRecord = result.transaction.transaction
        setStatus('success')
        setTariffInfo({
          entryTime: tx.entryTime ?? 0,
          exitTime: tx.exitTime ?? 0,
          durationHours: tx.durationHours ?? 0,
          ratePerHour,
          totalCharge: Math.abs(tx.amount),
          balanceBefore: tx.balanceBefore,
          balanceAfter: tx.balanceAfter,
        })
        setSyncStatus((prev) => ({
          ...prev,
          pendingCount: prev.pendingCount + 1,
        }))
      } else {
        setStatus('error')
        setErrorInfo({ code: result.code, message: result.error })
      }
    } catch {
      setStatus('error')
      setErrorInfo({
        code: 'UNEXPECTED_ERROR',
        message: 'An unexpected error occurred. Please try again.',
      })
    }
  }, [ratePerHour])

  const handleDismissError = useCallback(() => {
    setErrorInfo(null)
    setStatus('ready')
  }, [])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    setStatus('ready')
    setErrorInfo(null)
  }, [])

  const handleReset = useCallback(() => {
    setStatus('ready')
    setErrorInfo(null)
    setTariffInfo(null)
  }, [])

  return (
    <main className="flex min-h-screen flex-col bg-background">
      {/* Main Status Area */}
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <StatusIndicator
          status={status}
          message={
            status === 'ready'
              ? 'Tap card to check out'
              : status === 'tap-now'
                ? 'Hold card near reader'
                : status === 'processing'
                  ? 'Calculating tariff...'
                  : status === 'success'
                    ? 'Check-out complete!'
                    : undefined
          }
          className="w-full max-w-2xl"
        />

        {/* Tariff Breakdown */}
        {tariffInfo && (
          <TariffBreakdown
            entryTime={tariffInfo.entryTime}
            exitTime={tariffInfo.exitTime}
            durationHours={tariffInfo.durationHours}
            ratePerHour={tariffInfo.ratePerHour}
            totalCharge={tariffInfo.totalCharge}
            balanceBefore={tariffInfo.balanceBefore}
            balanceAfter={tariffInfo.balanceAfter}
            className="mt-6 w-full max-w-2xl"
          />
        )}

        {/* Error Display */}
        {errorInfo && (
          <ErrorDisplay
            code={errorInfo.code}
            message={errorInfo.message}
            onDismiss={handleDismissError}
            className="mt-6 w-full max-w-2xl"
          />
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex gap-4">
          {status === 'ready' && (
            <Button
              size="lg"
              onClick={handleCheckOut}
              aria-label="Start check-out process"
              className="min-h-[48px] min-w-[120px] text-lg"
            >
              Start Check-Out
            </Button>
          )}
          {(status === 'tap-now' || status === 'processing') && (
            <Button
              variant="outline"
              size="lg"
              onClick={handleCancel}
              aria-label="Cancel check-out"
              className="min-h-[48px] min-w-[120px]"
            >
              Cancel
            </Button>
          )}
          {(status === 'success' || status === 'error') && (
            <Button
              size="lg"
              onClick={handleReset}
              aria-label="Reset terminal"
              className="min-h-[48px] min-w-[120px]"
            >
              Next Member
            </Button>
          )}
        </div>
      </div>

      {/* Sync Status Bar */}
      <SyncStatusBar syncStatus={syncStatus} className="m-4" />
    </main>
  )
}
