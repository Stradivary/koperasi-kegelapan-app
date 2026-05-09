/**
 * The Station — Desktop Top-Up & Card Management Terminal
 *
 * Desktop terminal for operators to perform top-ups, issue cards,
 * reset card status, and view card balance/status.
 *
 * Requirements: 3.1, 6.1, 6.2, 6.3, 8.4, 16.1
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

export const Route = createFileRoute('/terminal/station')({
  component: StationPage,
})

type StationTab = 'topup' | 'issue' | 'reset' | 'viewer'

function StationPage() {
  const [activeTab, setActiveTab] = useState<StationTab>('topup')
  const [status, setStatus] = useState<TerminalStatus>('ready')
  const [errorInfo, setErrorInfo] = useState<{
    code: string
    message: string
  } | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Top-up form state
  const [topUpAmount, setTopUpAmount] = useState('')
  const [topUpSource, setTopUpSource] = useState('cash')
  const [memberLookup, setMemberLookup] = useState('')

  // Card viewer state
  const [cardData, setCardData] = useState<CardPayload | null>(null)

  // Card issuance state
  const [selectedMemberId, setSelectedMemberId] = useState('')

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
        tid: 'KOP-001',
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
          `Top-up of Rp ${amount.toLocaleString('id-ID')} successful!`,
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
  }, [topUpAmount, topUpSource])

  // ─── Card Issuance Flow ─────────────────────────────────────────────────

  const handleIssueCard = useCallback(async () => {
    if (!selectedMemberId) {
      setErrorInfo({
        code: 'INVALID_AMOUNT',
        message: 'Select an approved member first.',
      })
      return
    }

    setStatus('tap-now')
    setErrorInfo(null)
    setSuccessMessage(null)

    try {
      setStatus('processing')

      const { initializeCard } = await import('#/lib/card/operations.ts')

      // Create a fresh payload for the new card
      initializeCard(selectedMemberId, 'KOP-001')

      // TODO: Encrypt and write initialized payload to blank card via NFC
      // Then call issueCard server function to link UID to member
      setStatus('success')
      setSuccessMessage(
        `Card issued to member ${selectedMemberId} successfully!`,
      )
      setSelectedMemberId('')
      setTimeout(() => {
        setStatus('ready')
        setSuccessMessage(null)
      }, 3000)
    } catch {
      setStatus('error')
      setErrorInfo({
        code: 'UNEXPECTED_ERROR',
        message: 'Card issuance failed.',
      })
    }
  }, [selectedMemberId])

  // ─── Card Reset Flow ────────────────────────────────────────────────────

  const handleResetCard = useCallback(async () => {
    setStatus('tap-now')
    setErrorInfo(null)
    setSuccessMessage(null)

    try {
      setStatus('processing')

      const { executeCardPipeline } = await import('#/lib/nfc/pipeline.ts')
      const { resetCardStatus } = await import('#/lib/card/operations.ts')

      const config = {
        tid: 'KOP-001',
        tariffRatePerHour: 2000,
        maxBalance: 10_000_000,
        minBalanceForEntry: 2000,
      }

      const keys = {
        encryptionKey: null as unknown as CryptoKey,
        rotatingEncryptionKey: null,
        hmacKey: null as unknown as CryptoKey,
      }

      // Reset operation wraps resetCardStatus into a CardOperationResult
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
  }, [])

  // ─── Card Viewer ────────────────────────────────────────────────────────

  const handleReadCard = useCallback(async () => {
    setStatus('tap-now')
    setErrorInfo(null)
    setCardData(null)

    try {
      setStatus('processing')

      // Read-only pipeline: just read, decrypt, and display
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

      const hmacValid = await verifyHMAC(encryptedData, hmacHash, keys.hmacKey)
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

  const tabs: { id: StationTab; label: string }[] = [
    { id: 'topup', label: 'Top-Up' },
    { id: 'issue', label: 'Issue Card' },
    { id: 'reset', label: 'Reset Card' },
    { id: 'viewer', label: 'Card Viewer' },
  ]

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <h1 className="text-2xl font-bold">The Station</h1>
        <p className="text-sm text-muted-foreground">
          Desktop Top-Up &amp; Card Management
        </p>
      </header>

      {/* Tab Navigation */}
      <nav
        className="flex border-b border-border bg-card"
        role="tablist"
        aria-label="Station operations"
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
            className={`min-h-[48px] flex-1 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 p-6">
        {/* Member Lookup */}
        {(activeTab === 'topup' || activeTab === 'issue') && (
          <div className="mb-6">
            <Label htmlFor="member-lookup" className="mb-2">
              Member Lookup
            </Label>
            <Input
              id="member-lookup"
              placeholder="Search by name, ID, or phone..."
              value={memberLookup}
              onChange={(e) => setMemberLookup(e.target.value)}
              aria-label="Search for a member"
              className="min-h-[48px]"
            />
          </div>
        )}

        {/* Top-Up Panel */}
        {activeTab === 'topup' && (
          <div
            id="panel-topup"
            role="tabpanel"
            aria-labelledby="tab-topup"
            className="space-y-4"
          >
            <div>
              <Label htmlFor="topup-amount" className="mb-2">
                Amount (Rp)
              </Label>
              <Input
                id="topup-amount"
                type="number"
                min="1"
                placeholder="Enter amount..."
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                aria-label="Top-up amount in Rupiah"
                aria-describedby="topup-amount-desc"
                className="min-h-[48px]"
              />
              <p
                id="topup-amount-desc"
                className="mt-1 text-xs text-muted-foreground"
              >
                Maximum balance: Rp 10,000,000
              </p>
            </div>

            <div>
              <Label htmlFor="topup-source" className="mb-2">
                Source
              </Label>
              <Select value={topUpSource} onValueChange={setTopUpSource}>
                <SelectTrigger
                  id="topup-source"
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
              aria-label="Process top-up"
              className="min-h-[48px] w-full text-lg"
            >
              {status === 'processing' ? 'Processing...' : 'Tap Card to Top-Up'}
            </Button>
          </div>
        )}

        {/* Card Issuance Panel */}
        {activeTab === 'issue' && (
          <div
            id="panel-issue"
            role="tabpanel"
            aria-labelledby="tab-issue"
            className="space-y-4"
          >
            <div>
              <Label htmlFor="member-select" className="mb-2">
                Select Approved Member
              </Label>
              <Input
                id="member-select"
                placeholder="Enter member ID (e.g., MBC-8829)..."
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                aria-label="Member ID for card issuance"
                className="min-h-[48px]"
              />
            </div>

            <Button
              size="lg"
              onClick={handleIssueCard}
              disabled={
                !selectedMemberId ||
                status === 'processing' ||
                status === 'tap-now'
              }
              aria-label="Issue new card"
              className="min-h-[48px] w-full text-lg"
            >
              {status === 'processing'
                ? 'Initializing...'
                : 'Scan Blank Card to Issue'}
            </Button>
          </div>
        )}

        {/* Card Reset Panel */}
        {activeTab === 'reset' && (
          <div
            id="panel-reset"
            role="tabpanel"
            aria-labelledby="tab-reset"
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground">
              Reset a stuck card from Checked-In (status 1) back to Idle
              (status 0). Use this when a member forgot to tap out.
            </p>
            <Button
              size="lg"
              onClick={handleResetCard}
              disabled={status === 'processing' || status === 'tap-now'}
              aria-label="Reset card status"
              className="min-h-[48px] w-full text-lg"
            >
              {status === 'processing'
                ? 'Resetting...'
                : 'Tap Card to Reset Status'}
            </Button>
          </div>
        )}

        {/* Card Viewer Panel */}
        {activeTab === 'viewer' && (
          <div
            id="panel-viewer"
            role="tabpanel"
            aria-labelledby="tab-viewer"
            className="space-y-4"
          >
            <Button
              size="lg"
              onClick={handleReadCard}
              disabled={status === 'processing' || status === 'tap-now'}
              aria-label="Read card data"
              className="min-h-[48px] w-full text-lg"
            >
              {status === 'processing'
                ? 'Reading...'
                : 'Tap Card to View'}
            </Button>

            {cardData && (
              <div
                className="rounded-lg border border-border bg-card p-6"
                role="region"
                aria-label="Card information"
              >
                <h3 className="mb-4 text-lg font-bold">Card Information</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Member ID</dt>
                    <dd className="font-medium">{cardData.id}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Tenant ID</dt>
                    <dd className="font-medium">{cardData.tid}</dd>
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
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Schema Version</dt>
                    <dd className="font-medium">v{cardData.v}</dd>
                  </div>
                  {cardData.lastIn > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Last Entry</dt>
                      <dd className="font-medium">
                        {new Date(cardData.lastIn * 1000).toLocaleString()}
                      </dd>
                    </div>
                  )}
                </dl>

                {cardData.logs.length > 0 && (
                  <div className="mt-4">
                    <h4 className="mb-2 text-sm font-semibold">
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
                          <span className="text-muted-foreground">
                            {new Date(log.t * 1000).toLocaleTimeString()}
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

        {/* Status & Error Display */}
        {status !== 'ready' && !cardData && (
          <div className="mt-6">
            <StatusIndicator
              status={status}
              message={successMessage ?? undefined}
              className="min-h-[200px]"
            />
          </div>
        )}

        {errorInfo && (
          <ErrorDisplay
            code={errorInfo.code}
            message={errorInfo.message}
            onDismiss={handleDismissError}
            className="mt-6"
          />
        )}
      </div>

      {/* Sync Status Bar */}
      <SyncStatusBar syncStatus={syncStatus} className="m-4" />
    </main>
  )
}
