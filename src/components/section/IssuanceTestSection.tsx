import { useState, useRef, useCallback } from 'react'
import { readCard, writeCard, isNfcSupported } from '../../core/nfc/engine'
import { decodePayload, encodePayload } from '../../core/payload/engine'
import { MAGIC, CARD_SCHEMA_VERSION, CARD_SIZE, CardState, CardStatus } from '../../core/payload/types'
import type { CardPayload } from '../../core/payload/types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { Separator } from '../ui/separator'

// ─── helpers ────────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(':')
}

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n)
  crypto.getRandomValues(buf)
  return buf
}

function makeFreshCard(opts: {
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

  return encodePayload(payload)
}

// ─── component ───────────────────────────────────────────────────────────────

type Phase = 'idle' | 'scanning' | 'writing' | 'done' | 'error'

export function IssuanceTestSection() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [readPayload, setReadPayload] = useState<CardPayload | null>(null)
  const [serialNumber, setSerialNumber] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // issuance form state
  const [name, setName] = useState('Test User')
  const [userId, setUserId] = useState('1001')
  const [balance, setBalance] = useState('50000')
  const [expiresOffset, setExpiresOffset] = useState('365') // days from now

  const nfcAvailable = isNfcSupported()

  function abort() {
    abortRef.current?.abort()
    setPhase('idle')
    setErrorMsg(null)
  }

  // ── READ ──────────────────────────────────────────────────────────────────
  const handleRead = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
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
      // still show raw bytes even if decode fails
      setPhase('error')
      setErrorMsg(`Decode failed: ${e}`)
    }
  }, [])

  // ── WRITE (issue fresh card) ───────────────────────────────────────────────
  const handleIssue = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
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

  // ─────────────────────────────────────────────────────────────────────────

  const busyLabel = phase === 'scanning' ? 'Tap kartu...' : phase === 'writing' ? 'Menulis kartu...' : null

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

      {/* Status */}
      <div className="flex items-center gap-2">
        <Badge
          variant={
            phase === 'error' ? 'destructive'
              : phase === 'done' ? 'default'
              : 'secondary'
          }
        >
          {phase}
        </Badge>
        {busyLabel && <span className="text-sm text-muted-foreground animate-pulse">{busyLabel}</span>}
        {(phase === 'scanning' || phase === 'writing') && (
          <Button size="sm" variant="ghost" onClick={abort}>
            Batal
          </Button>
        )}
        {errorMsg && <span className="text-sm text-destructive">{errorMsg}</span>}
      </div>

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

        <Button
          disabled={!nfcAvailable || phase === 'scanning' || phase === 'writing'}
          onClick={handleIssue}
          className="w-full"
        >
          Tulis ke kartu
        </Button>
      </section>

      <Separator />

      {/* ── READ ───────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-semibold">Baca kartu</h2>
        <Button
          variant="outline"
          disabled={!nfcAvailable || phase === 'scanning' || phase === 'writing'}
          onClick={handleRead}
          className="w-full"
        >
          Scan kartu
        </Button>
      </section>

      {/* ── Decoded payload ─────────────────────────────────────────────── */}
      {readPayload && (
        <>
          <Separator />
          <section className="space-y-3">
            <h2 className="font-semibold">Payload terbaca</h2>
            {serialNumber && (
              <Row label="Serial number" value={serialNumber} />
            )}
            <div className="rounded-md border bg-muted/40 p-3 text-xs font-mono space-y-1">
              <Row label="Card ID" value={toHex(readPayload.header.cardId)} />
              <Row label="Magic" value={`0x${readPayload.header.magic.toString(16).toUpperCase()}`} />
              <Row label="Version" value={String(readPayload.header.version)} />

              <Separator className="my-1" />
              <Row label="Nama" value={readPayload.identity.name} />
              <Row label="User ID" value={String(readPayload.identity.userId)} />
              <Row label="Status" value={CardStatus[readPayload.identity.status] ?? String(readPayload.identity.status)} />
              <Row label="Dibuat" value={new Date(readPayload.identity.createdAt * 1000).toLocaleString('id-ID')} />

              <Separator className="my-1" />
              <Row label="Saldo" value={`Rp ${readPayload.wallet.balance.toLocaleString('id-ID')}`} />
              <Row label="Saldo sebelum" value={`Rp ${readPayload.wallet.lastBalance.toLocaleString('id-ID')}`} />
              <Row label="Counter" value={String(readPayload.wallet.counter)} />
              <Row label="State" value={CardState[readPayload.wallet.state] ?? String(readPayload.wallet.state)} />

              <Separator className="my-1" />
              <Row label="Berlaku s/d" value={new Date(readPayload.trailer.expiresAt * 1000).toLocaleString('id-ID')} />
              <Row label="Key version" value={String(readPayload.trailer.keyVersion)} />
              <Row label="Active ptr" value={String(readPayload.trailer.activePtr)} />
              <Row label="Counter bind" value={String(readPayload.trailer.counterBind)} />
              <Row label="HMAC" value={toHex(readPayload.trailer.hmac)} />
              <Row label="Root hash" value={toHex(readPayload.trailer.rootHash)} />

              {readPayload.logEntries.length > 0 && (
                <>
                  <Separator className="my-1" />
                  <p className="text-muted-foreground">Log ({readPayload.logEntries.length} entri)</p>
                  {readPayload.logEntries.map((e, i) => (
                    <div key={i} className="pl-2 border-l">
                      <Row label={`[${i}] amount`} value={String(e.amount)} />
                      <Row label={`[${i}] balance`} value={String(e.balanceAfter)} />
                      <Row label={`[${i}] flags`} value={`0x${e.flags.toString(16)}`} />
                      <Row label={`[${i}] hash`} value={toHex(e.hash)} />
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* raw bytes size */}
            <p className="text-xs text-muted-foreground">Card size: {CARD_SIZE} bytes</p>
          </section>
        </>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  )
}
