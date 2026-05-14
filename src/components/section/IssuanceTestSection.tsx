import { useState, useRef, useCallback } from 'react'
import { readCard, writeCard, isNfcSupported } from '../../core/nfc/engine'
import { decodePayload, encodePayloadWire } from '../../core/payload/engine'
import { MAGIC, CARD_SCHEMA_VERSION, CardState, CardStatus } from '../../core/payload/types'
import type { CardPayload } from '../../core/payload/types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Separator } from '../ui/separator'
import { IssuanceScanDrawer } from '../block/IssuanceScanDrawer'

// ─── helpers ────────────────────────────────────────────────────────────────

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n)
  crypto.getRandomValues(buf)
  return buf
}

export function makeFreshCard(opts: {
  name: string
  userId: number
  balance: number
  expiresAt: number
}): Uint8Array {
  const now = Math.floor(Date.now() / 1000)
  const cardId = randomBytes(6)

  const payload: CardPayload = {
    header: {
      magic: MAGIC,
      version: CARD_SCHEMA_VERSION,
      type: 0,
      cardId,
    },
    identity: {
      name: opts.name,
      userId: opts.userId,
      gender: 0,
      status: CardStatus.ACTIVE,
      createdAt: now,
    },
    wallet: {
      balance: opts.balance,
      lastBalance: 0,
      counter: 1n,
      lastTimestamp: now,
      state: CardState.IDLE,
      flags: 0,
    },
    session: {
      startTime: 0,
      endTime: 0,
      terminalId: 0,
    },
    logEntries: [],
    trailer: {
      expiresAt: opts.expiresAt,
      keyVersion: 0,
      rootHash: new Uint8Array(6),
      counterBind: 1,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  }

  return encodePayloadWire(payload)
}

// ─── component ───────────────────────────────────────────────────────────────

type Phase = 'idle' | 'scanning' | 'writing' | 'done' | 'error'

export function IssuanceTestSection() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [readPayload, setReadPayload] = useState<CardPayload | null>(null)
  const [serialNumber, setSerialNumber] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'read' | 'write'>('read')
  const abortRef = useRef<AbortController | null>(null)

  // issuance form state
  const [name, setName] = useState('Test User')
  const [userId, setUserId] = useState('1001')
  const [balance, setBalance] = useState('50000')
  const [expiresOffset, setExpiresOffset] = useState('365') // days from now

  const nfcAvailable = isNfcSupported()

  const handleDrawerClose = useCallback(() => {
    if (phase === 'scanning' || phase === 'writing') {
      abortRef.current?.abort()
    }
    setPhase('idle')
    setErrorMsg(null)
    setIsDrawerOpen(false)
  }, [phase])

  // ── READ ──────────────────────────────────────────────────────────────────
  const handleRead = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setDrawerMode('read')
    setIsDrawerOpen(true)
    setPhase('scanning')
    setErrorMsg(null)
    setReadPayload(null)
    setSerialNumber(null)

    const result = await readCard(abortRef.current.signal)
    if (!result.ok) {
      setPhase('error')
      setErrorMsg(result.error)
      return
    }

    try {
      const payload = decodePayload(result.raw)
      setReadPayload(payload)
      setSerialNumber(result.serialNumber)
      setPhase('done')
    } catch (e) {
      setPhase('error')
      setErrorMsg(`Decode failed: ${e}`)
    }
  }, [])

  // ── WRITE (issue fresh card) ───────────────────────────────────────────────
  const handleIssue = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setDrawerMode('write')
    setIsDrawerOpen(true)
    setPhase('writing')
    setErrorMsg(null)

    const expiresAt = Math.floor(Date.now() / 1000) + parseInt(expiresOffset, 10) * 86400

    let raw: Uint8Array
    try {
      raw = makeFreshCard({
        name,
        userId: parseInt(userId, 10),
        balance: parseInt(balance, 10),
        expiresAt,
      })
      console.log('Issuing card with payload', decodePayload(raw))
    } catch (e) {
      setPhase('error')
      setErrorMsg(`Build failed: ${e}`)
      return
    }

    const result = await writeCard(raw, abortRef.current.signal)
    if (!result.ok) {
      setPhase('error')
      setErrorMsg(result.error)
      return
    }

    // immediately re-decode to confirm round-trip
    try {
      const payload = decodePayload(raw)
      setReadPayload(payload)
      setSerialNumber(null)
    } catch {
      // non-fatal
    }
    setPhase('done')
  }, [name, userId, balance, expiresOffset])

  const handleRetry = useCallback(() => {
    if (drawerMode === 'read') handleRead()
    else handleIssue()
  }, [drawerMode, handleRead, handleIssue])

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Issuance Test</h1>
        <p className="text-sm text-muted-foreground">
          Read &amp; write NFC card payload — no auth required. Dev/LAN testing only.
        </p>
      </div>

      {!nfcAvailable && (
        <div className="rounded-md border border-destructive p-3 text-sm text-destructive">
          Web NFC is not supported on this browser/device. Use Chrome on Android.
        </div>
      )}

      <Separator />

      {/* ── WRITE: Issue fresh card ─────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-semibold">Issue kartu baru</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="it-name">Nama</Label>
            <Input id="it-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama pemegang kartu" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="it-userid">User ID</Label>
            <Input id="it-userid" type="number" min={1} value={userId} onChange={(e) => setUserId(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="it-balance">Saldo awal (Rp)</Label>
            <Input id="it-balance" type="number" min={0} value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="it-expires">Berlaku (hari)</Label>
            <Input id="it-expires" type="number" min={1} value={expiresOffset} onChange={(e) => setExpiresOffset(e.target.value)} />
          </div>
        </div>

        <Button disabled={!nfcAvailable} onClick={handleIssue} className="w-full">
          Tulis ke kartu
        </Button>
      </section>

      <Separator />

      {/* ── READ ───────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-semibold">Baca kartu</h2>
        <Button
          variant="outline"
          disabled={!nfcAvailable}
          onClick={handleRead}
          className="w-full"
        >
          Scan kartu
        </Button>
      </section>

      <IssuanceScanDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        phase={phase}
        mode={drawerMode}
        payload={readPayload}
        serialNumber={serialNumber}
        error={errorMsg}
        onClose={handleDrawerClose}
        onRetry={handleRetry}
      />
    </div>
  )
}
