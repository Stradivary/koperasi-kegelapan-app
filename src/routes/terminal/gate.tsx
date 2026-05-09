/**
 * The Gate — Entry Terminal
 *
 * Full-screen terminal UI for member check-in via NFC card tap.
 * Integrates Web NFC pipeline, simulation mode, and sync queue.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 8.4, 13.1, 13.2, 13.3, 16.1, 16.2
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback, useRef } from 'react'
import {
  StatusIndicator,
  SyncStatusBar,
  SimulationBanner,
  ErrorDisplay,
} from '#/components/terminal/index.ts'
import { Button } from '#/components/ui/button.tsx'
import type { TerminalStatus } from '#/components/terminal/StatusIndicator.tsx'
import type { SyncStatus } from '#/lib/sync/types.ts'
import type { PipelineResult, CardCryptoKeys } from '#/lib/nfc/types.ts'
import type { TenantCardConfig } from '#/lib/card/types.ts'

export const Route = createFileRoute('/terminal/gate')({
  component: GatePage,
})

function GatePage() {
  const [status, setStatus] = useState<TerminalStatus>('ready')
  const [errorInfo, setErrorInfo] = useState<{
    code: string
    message: string
  } | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Simulation mode state
  const [simEnabled, setSimEnabled] = useState(false)
  const [simTime, setSimTime] = useState('')
  const [isAdmin] = useState(true) // TODO: derive from auth context

  // Sync status state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    pendingCount: 0,
    lastSyncTimestamp: null,
    isSyncing: false,
  })

  // Abort controller for NFC operations
  const abortRef = useRef<AbortController | null>(null)

  const handleCheckIn = useCallback(async () => {
    setStatus('tap-now')
    setErrorInfo(null)
    setSuccessMessage(null)

    abortRef.current = new AbortController()

    try {
      setStatus('processing')

      // Dynamic import to avoid SSR issues with Web NFC
      const { executeCardPipeline } = await import(
        '#/lib/nfc/pipeline.ts'
      )
      const { processCheckIn } = await import(
        '#/lib/card/operations.ts'
      )

      // TODO: Get real keys and config from tenant context / cached config
      const config: TenantCardConfig = {
        tid: 'KOP-001',
        tariffRatePerHour: 2000,
        maxBalance: 10_000_000,
        minBalanceForEntry: 2000,
      }

      const keys: CardCryptoKeys = {
        encryptionKey: null as unknown as CryptoKey,
        rotatingEncryptionKey: null,
        hmacKey: null as unknown as CryptoKey,
      }

      // Build the operation function, optionally with simulated time
      const operationFn = (
        payload: Parameters<typeof processCheckIn>[0],
        cfg: Parameters<typeof processCheckIn>[1],
      ) => {
        if (simEnabled && simTime) {
          const simTimestamp = Math.floor(
            new Date(simTime).getTime() / 1000,
          )
          return processCheckIn(payload, cfg, simTimestamp)
        }
        return processCheckIn(payload, cfg)
      }

      const result: PipelineResult = await executeCardPipeline(
        operationFn,
        config,
        keys,
        {
          signal: abortRef.current.signal,
        },
      )

      if (result.success) {
        setStatus('success')
        setSuccessMessage('Check-in successful! Welcome.')
        // Queue transaction for sync
        setSyncStatus((prev) => ({
          ...prev,
          pendingCount: prev.pendingCount + 1,
        }))
        // Auto-reset to ready after 3 seconds
        setTimeout(() => {
          setStatus('ready')
          setSuccessMessage(null)
        }, 3000)
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
  }, [simEnabled, simTime])

  const handleDismissError = useCallback(() => {
    setErrorInfo(null)
    setStatus('ready')
  }, [])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    setStatus('ready')
    setErrorInfo(null)
  }, [])

  return (
    <main className="flex min-h-screen flex-col bg-background">
      {/* Simulation Banner */}
      <SimulationBanner
        enabled={simEnabled}
        onToggle={setSimEnabled}
        simulatedTime={simTime}
        onSimulatedTimeChange={setSimTime}
        isAdmin={isAdmin}
        className="m-4"
      />

      {/* Main Status Area */}
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <StatusIndicator
          status={status}
          message={
            successMessage ??
            (status === 'ready'
              ? 'Tap card to check in'
              : status === 'tap-now'
                ? 'Hold card near reader'
                : status === 'processing'
                  ? 'Reading card...'
                  : undefined)
          }
          className="w-full max-w-2xl"
        />

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
              onClick={handleCheckIn}
              aria-label="Start check-in process"
              className="min-h-[48px] min-w-[120px] text-lg"
            >
              Start Check-In
            </Button>
          )}
          {(status === 'tap-now' || status === 'processing') && (
            <Button
              variant="outline"
              size="lg"
              onClick={handleCancel}
              aria-label="Cancel check-in"
              className="min-h-[48px] min-w-[120px]"
            >
              Cancel
            </Button>
          )}
          {(status === 'success' || status === 'error') && (
            <Button
              size="lg"
              onClick={() => {
                setStatus('ready')
                setErrorInfo(null)
                setSuccessMessage(null)
              }}
              aria-label="Reset terminal"
              className="min-h-[48px] min-w-[120px]"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Sync Status Bar */}
      <SyncStatusBar syncStatus={syncStatus} className="m-4" />
    </main>
  )
}
