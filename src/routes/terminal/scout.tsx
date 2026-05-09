/**
 * The Scout — Mobile Admin Terminal
 *
 * Mobile-optimized version of The Station for field operations.
 * Supports top-up, card viewer, card reset via mobile NFC.
 * Includes multi-tenant switcher for admins managing multiple cooperatives.
 *
 * Requirements: 6.1, 8.4, 16.1, 16.3, 16.4
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import {
  StatusIndicator,
  SyncStatusBar,
  ErrorDisplay,
} from '#/components/terminal/index.ts'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import type { TerminalStatus } from '#/components/terminal/StatusIndicator.tsx'
import type { SyncStatus } from '#/lib/sync/types.ts'
import type { CardPayload } from '#/lib/card/types.ts'

export const Route = createFileRoute('/terminal/scout')({
  component: ScoutPage,
})

type ScoutTab = 'topup' | 'viewer' | 'reset'

function ScoutPage() {
  const [activeTab, setActiveTab] = useState<ScoutTab>('topup')
  const [status, setStatus] = useState<TerminalStatus>('ready')
  const [errorInfo, setErrorInfo] = useState<{
    code: string
    message: string
  } | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Multi-tenant switcher
  const [activeTenant, setActiveTenant] = useState('kop-001')

  // Top-up form
  const [topUpAmount, setTopUpAmount] = useState('')
  const [topUpSource, setTopUpSource] = useState('cash')

  // Card viewer
  const [cardData, setCardData] = useState<CardPayload | null>(null)

  // Sync status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    pendingCount: 0,
    lastSyncTimestamp: null,
    isSyncing: false,
  })

  const handleDismissError = useCallback(() => {
    setErrorInfo(null)
    setStatus('ready')
  }, [])

  // ─── Top-Up Flow ────────────────────────────────────────────────────────

  const handleTopUp = useCallback(async () => {
    const amount = parseInt(topUpAmount, 10)
    if (!amount || amount <= 0) {
      setErrorInfo({
        code: 'INVALID_AMOUNT',
        message: 'Enter a valid positive amount.',
      })
      return
    }

    setStatus('tap-now')
    setErrorInfo(null)
    setSuccessMessage(null)

    try {
      setStatus('processing')

      const { executeCardPipeline } = await import('#/lib/nfc/pipeline.ts')
      const { processTopUp } = await import('#/lib/card/operations.ts')

      const config = {
        tid: activeTenant.toUpperCase(),
        tariffRatePerHour: 2000,
        maxBalance: 10_000_000,
        minBalanceForEntry: 2000,
      }

      const keys = {
        encryptionKey: null as unknown as CryptoKey,
        rotatingEncryptionKey: null,
        hmacKey: null as unknown as CryptoKey,
      }

      const operationFn = (
        payload: Parameters<typeof processTopUp>[0],
        cfg: Parameters<typeof processTopUp>[2],
      ) => processTopUp(payload, amount, cfg, topUpSource)

      const result = await executeCardPipeline(operationFn, config, keys)

      if (result.success) {
        setStatus('success')
        setSuccessMessage(
          `Top-up Rp ${amount.toLocaleString('id-ID')} successful!`,
        )
        setTopUpAmount('')
        setSyncStatus((prev) => ({
          ...prev,
          pendingCount: prev.pendingCount + 1,
        }))
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
        message: 'An unexpected error occurred.',
      })
    }
  }, [topUpAmount, topUpSource, activeTenant])

  // ─── Card Viewer ────────────────────────────────────────────────────────

  const handleReadCard = useCallback(async () => {
    setStatus('tap-now')
    setErrorInfo(null)
    setCardData(null)

    try {
      setStatus('processing')

      const { readNfcCard } = await import('#/lib/nfc/reader.ts')
      const { verifyHMAC, decryptWithKeyRotation } = await import(
        '#/lib/card/crypto.ts'
      )
      const { deserialize } = await import('#/lib/card/serialization.ts')
      const { HMAC_SHA256_SIZE } = await import('#/lib/card/types.ts')

      const keys = {
        encryptionKey: null as unknown as CryptoKey,
        rotatingEncryptionKey: null,
        hmacKey: null as unknown as CryptoKey,
      }

      const readResult = await readNfcCard()
      if (!readResult.success) {
        setStatus('error')
        setErrorInfo({ code: readResult.code, message: readResult.error })
        return
      }

      const rawData = readResult.data
      const encryptedData = rawData.slice(0, rawData.length - HMAC_SHA256_SIZE)
      const hmacHash = rawData.slice(rawData.length - HMAC_SHA256_SIZE)

      const hmacValid = await verifyHMAC(
        encryptedData,
        hmacHash,
        keys.hmacKey,
      )
      if (!hmacValid) {
        setStatus('error')
        setErrorInfo({
          code: 'HMAC_VERIFICATION_FAILED',
          message:
            'Card integrity check failed — possible tampering detected.',
        })
        return
      }

      const decrypted = await decryptWithKeyRotation(
        encryptedData,
        keys.encryptionKey,
        keys.rotatingEncryptionKey,
      )
      const payload = deserialize(decrypted)
      setCardData(payload)
      setStatus('success')
    } catch {
      setStatus('error')
      setErrorInfo({
        code: 'UNEXPECTED_ERROR',
        message: 'Failed to read card.',
      })
    }
  }, [])

  // ─── Card Reset ─────────────────────────────────────────────────────────

  const handleResetCard = useCallback(async () => {
    setStatus('tap-now')
    setErrorInfo(null)
    setSuccessMessage(null)

    try {
      setStatus('processing')

      const { executeCardPipeline } = await import('#/lib/nfc/pipeline.ts')
      const { resetCardStatus } = await import('#/lib/card/operations.ts')

      const config = {
        tid: activeTenant.toUpperCase(),
        tariffRatePerHour: 2000,
        maxBalance: 10_000_000,
        minBalanceForEntry: 2000,
      }

      const keys = {
        encryptionKey: null as unknown as CryptoKey,
        rotatingEncryptionKey: null,
        hmacKey: null as unknown as CryptoKey,
      }

      const operationFn = (
        payload: Parameters<typeof resetCardStatus>[0],
      ) => {
        const updated = resetCardStatus(payload)
        return {
          success: true as const,
          payload: updated,
          transaction: {
            type: 'CHECKIN' as const,
            amount: 0,
            balanceBefore: payload.bal,
            balanceAfter: payload.bal,
            occurredAt: Math.floor(Date.now() / 1000),
          },
        }
      }

      const result = await executeCardPipeline(operationFn, config, keys)

      if (result.success) {
        setStatus('success')
        setSuccessMessage('Card status reset to Idle.')
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
        message: 'Card reset failed.',
      })
    }
  }, [activeTenant])

  const tabs: { id: ScoutTab; label: string }[] = [
    { id: 'topup', label: 'Top-Up' },
    { id: 'viewer', label: 'Card Viewer' },
    { id: 'reset', label: 'Reset' },
  ]

  return (
    <main className="flex min-h-screen flex-col bg-background">
      {/* Mobile Header with Tenant Switcher */}
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">The Scout</h1>
            <p className="text-xs text-muted-foreground">Mobile Admin</p>
          </div>
          <div className="w-40">
            <Select value={activeTenant} onValueChange={setActiveTenant}>
              <SelectTrigger
                aria-label="Switch tenant"
                className="min-h-[48px]"
              >
                <SelectValue placeholder="Select tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kop-001">Koperasi A</SelectItem>
                <SelectItem value="kop-002">Koperasi B</SelectItem>
                <SelectItem value="kop-003">Koperasi C</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* Tab Navigation — Mobile optimized */}
      <nav
        className="flex border-b border-border bg-card"
        role="tablist"
        aria-label="Scout operations"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => {
              setActiveTab(tab.id)
              setStatus('ready')
              setErrorInfo(null)
              setSuccessMessage(null)
              setCardData(null)
            }}
            className={`min-h-[48px] flex-1 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 p-4">
        {/* Top-Up Panel */}
        {activeTab === 'topup' && (
          <div
            id="panel-topup"
            role="tabpanel"
            className="space-y-4"
          >
            <div>
              <Label htmlFor="scout-amount" className="mb-2">
                Amount (Rp)
              </Label>
              <Input
                id="scout-amount"
                type="number"
                min="1"
                inputMode="numeric"
                placeholder="Enter amount..."
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                aria-label="Top-up amount"
                className="min-h-[48px] text-lg"
              />
            </div>

            <div>
              <Label htmlFor="scout-source" className="mb-2">
                Source
              </Label>
              <Select value={topUpSource} onValueChange={setTopUpSource}>
                <SelectTrigger
                  id="scout-source"
                  aria-label="Top-up source"
                  className="min-h-[48px] w-full"
                >
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="e_wallet">E-Wallet</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              size="lg"
              onClick={handleTopUp}
              disabled={status === 'processing' || status === 'tap-now'}
              aria-label="Process top-up via NFC"
              className="min-h-[48px] w-full text-lg"
            >
              {status === 'processing' ? 'Processing...' : 'Tap Card to Top-Up'}
            </Button>
          </div>
        )}

        {/* Card Viewer Panel */}
        {activeTab === 'viewer' && (
          <div
            id="panel-viewer"
            role="tabpanel"
            className="space-y-4"
          >
            <Button
              size="lg"
              onClick={handleReadCard}
              disabled={status === 'processing' || status === 'tap-now'}
              aria-label="Read card via NFC"
              className="min-h-[48px] w-full text-lg"
            >
              {status === 'processing' ? 'Reading...' : 'Tap Card to View'}
            </Button>

            {cardData && (
              <div
                className="rounded-lg border border-border bg-card p-4"
                role="region"
                aria-label="Card information"
              >
                <h3 className="mb-3 text-base font-bold">Card Info</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Member</dt>
                    <dd className="font-medium">{cardData.id}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Balance</dt>
                    <dd className="font-bold text-emerald-600">
                      Rp {cardData.bal.toLocaleString('id-ID')}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-medium">
                      {cardData.status === 0 ? 'Idle' : 'Checked-In'}
                    </dd>
                  </div>
                </dl>

                {cardData.logs.length > 0 && (
                  <div className="mt-3">
                    <h4 className="mb-1 text-xs font-semibold">
                      Recent Transactions
                    </h4>
                    <ul className="space-y-1 text-xs">
                      {cardData.logs.map((log, i) => (
                        <li
                          key={i}
                          className="flex justify-between rounded bg-muted px-2 py-1"
                        >
                          <span>{log.a}</span>
                          <span>
                            {log.v !== 0
                              ? `Rp ${log.v.toLocaleString('id-ID')}`
                              : '—'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Card Reset Panel */}
        {activeTab === 'reset' && (
          <div
            id="panel-reset"
            role="tabpanel"
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground">
              Reset a stuck card back to Idle status.
            </p>
            <Button
              size="lg"
              onClick={handleResetCard}
              disabled={status === 'processing' || status === 'tap-now'}
              aria-label="Reset card status via NFC"
              className="min-h-[48px] w-full text-lg"
            >
              {status === 'processing' ? 'Resetting...' : 'Tap Card to Reset'}
            </Button>
          </div>
        )}

        {/* Status & Error Display */}
        {status !== 'ready' && !cardData && (
          <div className="mt-4">
            <StatusIndicator
              status={status}
              message={successMessage ?? undefined}
              className="min-h-[150px]"
            />
          </div>
        )}

        {errorInfo && (
          <ErrorDisplay
            code={errorInfo.code}
            message={errorInfo.message}
            onDismiss={handleDismissError}
            className="mt-4"
          />
        )}
      </div>

      {/* Sync Status Bar */}
      <SyncStatusBar syncStatus={syncStatus} className="mx-4 mb-4" />
    </main>
  )
}
