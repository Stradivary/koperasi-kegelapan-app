import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { cn } from '../../lib/utils'
import { localDb, type Card, type User } from '../../db/local-db'

interface StationSectionProps {
  tenantId: string
  role: string
}

interface CardRow {
  cardId: string
  userId: number | null
  userName: string | null
  status: string
  balance: number
  counter: number
  expiresAt: string | null
}

interface UserRow {
  userId: number
  name: string
  status: string
}

type Tab = 'cards' | 'members'
type CardView = 'list' | 'register' | 'topup'
type MemberView = 'list' | 'add'

async function scanNfcSerial(): Promise<string | null> {
  if (!('NDEFReader' in globalThis)) return null
  return new Promise((resolve) => {
    const reader = new (globalThis as unknown as { NDEFReader: new () => { scan: (opts: { signal: AbortSignal }) => Promise<void>; addEventListener: (type: string, handler: (e: { serialNumber: string }) => void) => void } }).NDEFReader()
    const abort = new AbortController()
    const timeout = setTimeout(() => { abort.abort(); resolve(null) }, 15_000)
    reader.addEventListener('reading', (event: { serialNumber: string }) => {
      clearTimeout(timeout)
      abort.abort()
      resolve(event.serialNumber.replace(/:/g, ''))
    })
    reader.scan({ signal: abort.signal }).catch(() => { clearTimeout(timeout); resolve(null) })
  })
}

async function getCardsWithUsers(tenantId: string): Promise<CardRow[]> {
  const [cardRows, userRows] = await Promise.all([
    localDb.cards.where('tenantId').equals(tenantId).toArray(),
    localDb.users.where('tenantId').equals(tenantId).toArray(),
  ])
  const userMap = new Map<number, string>(userRows.map((u) => [u.userId, u.name]))
  return cardRows.map((c) => ({
    cardId: c.cardId,
    userId: c.userId,
    userName: c.userId != null ? (userMap.get(c.userId) ?? null) : null,
    status: c.status,
    balance: c.balance,
    counter: c.counter,
    expiresAt: c.expiresAt != null ? new Date(c.expiresAt * 1000).toISOString().split('T')[0] : null,
  }))
}

export function StationSection({ tenantId }: StationSectionProps) {
  const [tab, setTab] = useState<Tab>('cards')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Station</h1>
        <div className="flex rounded-lg border overflow-hidden">
          <button
            onClick={() => setTab('cards')}
            className={cn(
              'px-4 py-1.5 text-sm transition-colors',
              tab === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            Kartu
          </button>
          <button
            onClick={() => setTab('members')}
            className={cn(
              'px-4 py-1.5 text-sm transition-colors border-l',
              tab === 'members' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            Anggota
          </button>
        </div>
      </div>

      {tab === 'cards' && <CardsTab tenantId={tenantId} />}
      {tab === 'members' && <MembersTab tenantId={tenantId} />}
    </div>
  )
}

function CardsTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient()
  const [cardView, setCardView] = useState<CardView>('list')
  const [selectedCard, setSelectedCard] = useState<CardRow | null>(null)
  const [topupAmount, setTopupAmount] = useState('')
  const [newCardId, setNewCardId] = useState('')
  const [newUserId, setNewUserId] = useState<number | null>(null)
  const [newBalance, setNewBalance] = useState('')
  const [newExpiry, setNewExpiry] = useState('')
  const [nfcScanning, setNfcScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const nfcSupported = typeof globalThis !== 'undefined' && 'NDEFReader' in globalThis

  const cards = useQuery<CardRow[]>({
    queryKey: ['station-cards', tenantId],
    queryFn: () => getCardsWithUsers(tenantId),
  })

  const members = useQuery<UserRow[]>({
    queryKey: ['users', tenantId],
    queryFn: () =>
      localDb.users.where('tenantId').equals(tenantId).toArray() as Promise<UserRow[]>,
  })

  const registerCard = useMutation({
    mutationFn: async () => {
      const now = Math.floor(Date.now() / 1000)
      await localDb.cards.add({
        tenantId,
        cardId: newCardId.toLowerCase(),
        userId: newUserId,
        status: 'active',
        balance: parseInt(newBalance, 10) || 0,
        counter: 0,
        keyVersion: 1,
        createdAt: now,
        lastActivityAt: null,
        expiresAt: newExpiry ? Math.floor(new Date(newExpiry).getTime() / 1000) : null,
        notes: null,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['station-cards', tenantId] })
      setSuccess('Kartu berhasil didaftarkan')
      setCardView('list')
      setNewCardId(''); setNewUserId(null); setNewBalance(''); setNewExpiry('')
    },
    onError: (e) => setError(String(e instanceof Error ? e.message : e)),
  })

  const topupCard = useMutation({
    mutationFn: async () => {
      if (!selectedCard) return
      const newBalance = (selectedCard.balance ?? 0) + parseInt(topupAmount, 10)
      await localDb.cards.update([tenantId, selectedCard.cardId], {
        balance: newBalance,
        lastActivityAt: Math.floor(Date.now() / 1000),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['station-cards', tenantId] })
      setSuccess('Top-up berhasil')
      setCardView('list')
      setSelectedCard(null); setTopupAmount('')
    },
    onError: (e) => setError(String(e instanceof Error ? e.message : e)),
  })

  const updateCardStatus = useMutation({
    mutationFn: async ({ card, status }: { card: CardRow; status: string }) => {
      await localDb.cards.update([tenantId, card.cardId], { status: status as Card['status'] })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['station-cards', tenantId] }),
  })

  const handleNfcTap = async () => {
    if (!nfcSupported) {
      setError('Perangkat/browser ini belum mendukung Web NFC')
      return
    }

    setNfcScanning(true)
    setError(null)
    setSuccess(null)
    const serial = await scanNfcSerial()
    setNfcScanning(false)

    if (serial) {
      const normalized = serial.replace(/[^a-fA-F0-9]/g, '').toLowerCase()
      setNewCardId(normalized)
      setSuccess('Serial NFC berhasil dibaca')
    } else {
      setError('NFC scan gagal atau waktu habis')
    }
  }

  const dismissMessages = () => { setError(null); setSuccess(null) }
  const goToList = () => { setCardView('list'); dismissMessages() }

  const activeMembers = members.data?.filter((m) => m.status === 'active') ?? []

  return (
    <div className="space-y-4">
      {cardView === 'list' && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{cards.data?.length ?? 0} kartu</span>
          <Button size="sm" onClick={() => { setCardView('register'); dismissMessages() }}>
            + Daftarkan Kartu
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      {/* Card list */}
      {cardView === 'list' && (
        <div className="space-y-2">
          {cards.isLoading && <p className="text-sm text-muted-foreground">Memuat...</p>}
          {cards.data?.map((card) => (
            <div key={card.cardId} className="rounded-lg border p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{card.userName ?? `User #${card.userId}`}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">{card.cardId}</p>
                <p className={cn('text-xs mt-0.5', card.status === 'active' ? 'text-foreground' : 'text-destructive')}>
                  {card.status} · Rp {card.balance?.toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setSelectedCard(card); setCardView('topup'); dismissMessages() }}
                  disabled={card.status !== 'active'}
                >
                  Top-up
                </Button>
                {card.status === 'active' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => updateCardStatus.mutate({ card, status: 'blocked_admin' })}
                    disabled={updateCardStatus.isPending}
                  >
                    Blokir
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => updateCardStatus.mutate({ card, status: 'active' })}
                    disabled={updateCardStatus.isPending}
                  >
                    Aktifkan
                  </Button>
                )}
              </div>
            </div>
          ))}
          {cards.data?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Belum ada kartu terdaftar</p>
          )}
        </div>
      )}

      {/* Register card form */}
      {cardView === 'register' && (
        <div className="rounded-lg border p-4 space-y-4 max-w-sm">
          <h2 className="font-medium">Daftarkan Kartu Baru</h2>

          <div className="space-y-1.5">
            <Label>ID Kartu (hex)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="046a8b2a1f3b80"
                value={newCardId}
                onChange={(e) => setNewCardId(e.target.value)}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleNfcTap}
                disabled={nfcScanning || registerCard.isPending || !nfcSupported}
                className="shrink-0"
              >
                {nfcScanning ? 'Scanning...' : 'Scan NFC'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Isi manual atau scan serial number kartu NFC.</p>
            {!nfcSupported && <p className="text-xs text-muted-foreground">Web NFC tidak tersedia di browser/perangkat ini.</p>}
            {nfcScanning && <p className="text-xs text-muted-foreground">Tempelkan kartu ke pembaca NFC...</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Anggota</Label>
            <select
              value={newUserId ?? ''}
              onChange={(e) => setNewUserId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Tanpa anggota —</option>
              {activeMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} (#{m.userId})
                </option>
              ))}
            </select>
            {members.isLoading && <p className="text-xs text-muted-foreground">Memuat anggota...</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Saldo Awal (IDR)</Label>
            <Input
              type="number"
              placeholder="50000"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
            />
            <div className="flex gap-1.5">
              {[50_000, 100_000, 200_000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setNewBalance(String(v))}
                  className="flex-1 rounded border px-2 py-1 text-xs hover:bg-muted transition-colors"
                >
                  {v / 1000}k
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Kadaluarsa (opsional)</Label>
            <Input
              type="date"
              value={newExpiry}
              onChange={(e) => setNewExpiry(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => registerCard.mutate()}
              disabled={!newCardId || registerCard.isPending}
              className="flex-1"
            >
              {registerCard.isPending ? 'Mendaftarkan...' : 'Daftarkan'}
            </Button>
            <Button variant="outline" onClick={goToList}>Batal</Button>
          </div>
        </div>
      )}

      {/* Top-up form */}
      {cardView === 'topup' && selectedCard && (
        <div className="rounded-lg border p-4 space-y-4 max-w-sm">
          <h2 className="font-medium">Top-up Kartu</h2>
          <div className="rounded-lg bg-muted p-3 text-sm space-y-0.5">
            <p className="font-medium">{selectedCard.userName ?? `User #${selectedCard.userId}`}</p>
            <p className="text-muted-foreground font-mono text-xs">{selectedCard.cardId}</p>
            <p className="font-bold mt-1">Saldo: Rp {selectedCard.balance?.toLocaleString()}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Nominal Top-up (IDR)</Label>
            <Input
              type="number"
              placeholder="100000"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[50_000, 100_000, 200_000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setTopupAmount(String(v))}
                className="rounded-lg border p-2 text-sm hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                {v / 1000}k
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => topupCard.mutate()}
              disabled={!topupAmount || topupCard.isPending}
              className="flex-1"
            >
              {topupCard.isPending ? 'Memproses...' : 'Top-up'}
            </Button>
            <Button variant="outline" onClick={goToList}>Batal</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function MembersTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient()
  const [memberView, setMemberView] = useState<MemberView>('list')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const members = useQuery<UserRow[]>({
    queryKey: ['users', tenantId],
    queryFn: () =>
      localDb.users.where('tenantId').equals(tenantId).toArray() as Promise<UserRow[]>,
  })

  const createMember = useMutation({
    mutationFn: async () => {
      const existing = await localDb.users.where('tenantId').equals(tenantId).toArray()
      const nextId = existing.length > 0 ? Math.max(...existing.map((u) => u.userId)) + 1 : 1001
      const now = Math.floor(Date.now() / 1000)
      await localDb.users.add({
        tenantId,
        userId: nextId,
        name: name.trim(),
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', tenantId] })
      setMemberView('list')
      setName(''); setError(null)
    },
    onError: (e) => setError(String(e instanceof Error ? e.message : e)),
  })

  const toggleStatus = useMutation({
    mutationFn: async ({ userId, status }: { userId: number; status: string }) => {
      await localDb.users.update([tenantId, userId], { status: status as User['status'], updatedAt: Math.floor(Date.now() / 1000) })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users', tenantId] }),
  })

  return (
    <div className="space-y-4">
      {memberView === 'list' && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{members.data?.length ?? 0} anggota</span>
          <Button size="sm" onClick={() => { setMemberView('add'); setError(null) }}>
            + Tambah Anggota
          </Button>
        </div>
      )}

      {memberView === 'add' && (
        <div className="rounded-lg border p-4 space-y-3 max-w-sm">
          <h2 className="font-medium">Anggota Baru</h2>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label>Nama Lengkap</Label>
            <Input placeholder="Ahmad Rifai" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => createMember.mutate()}
              disabled={!name.trim() || createMember.isPending}
              className="flex-1"
            >
              {createMember.isPending ? 'Menyimpan...' : 'Daftarkan'}
            </Button>
            <Button variant="outline" onClick={() => { setMemberView('list'); setError(null) }}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {memberView === 'list' && (
        <div className="space-y-2">
          {members.isLoading && <p className="text-sm text-muted-foreground">Memuat...</p>}
          {members.data?.map((m) => (
            <div key={m.userId} className="rounded-lg border p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{m.name}</p>
                <p className={cn('text-xs mt-0.5', m.status === 'active' ? 'text-muted-foreground' : 'text-destructive')}>
                  #{m.userId} · {m.status === 'active' ? 'Aktif' : 'Ditangguhkan'}
                </p>
              </div>
              <Button
                size="sm"
                variant={m.status === 'active' ? 'ghost' : 'outline'}
                className={m.status === 'active' ? 'text-destructive' : ''}
                onClick={() => toggleStatus.mutate({ userId: m.userId, status: m.status === 'active' ? 'suspended' : 'active' })}
                disabled={toggleStatus.isPending}
              >
                {m.status === 'active' ? 'Tangguhkan' : 'Aktifkan'}
              </Button>
            </div>
          ))}
          {members.data?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Belum ada anggota terdaftar</p>
          )}
        </div>
      )}
    </div>
  )
}
