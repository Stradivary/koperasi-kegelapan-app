import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { KioskLayout } from '../layout/KioskLayout'

interface StationSectionProps {
  tenantId: string
  tenantName: string
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

async function fetchCards(tenantId: string): Promise<CardRow[]> {
  const res = await fetch(`/api/cards?tenantId=${tenantId}`)
  if (!res.ok) throw new Error('Failed to fetch cards')
  return res.json()
}

export function StationSection({ tenantId, tenantName, role }: StationSectionProps) {
  const qc = useQueryClient()
  const [view, setView] = useState<'list' | 'register' | 'topup'>('list')
  const [selectedCard, setSelectedCard] = useState<CardRow | null>(null)
  const [topupAmount, setTopupAmount] = useState('')
  const [newCardId, setNewCardId] = useState('')
  const [newUserId, setNewUserId] = useState('')
  const [newBalance, setNewBalance] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const cards = useQuery({
    queryKey: ['station-cards', tenantId],
    queryFn: () => fetchCards(tenantId),
  })

  const registerCard = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          cardId: newCardId,
          userId: parseInt(newUserId, 10) || null,
          balance: parseInt(newBalance, 10) || 0,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['station-cards', tenantId] })
      setSuccess('Kartu berhasil didaftarkan')
      setView('list')
      setNewCardId(''); setNewUserId(''); setNewBalance('')
    },
    onError: (e) => setError(String(e)),
  })

  const topupCard = useMutation({
    mutationFn: async () => {
      if (!selectedCard) return
      const amount = parseInt(topupAmount, 10)
      const res = await fetch('/api/cards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          cardId: selectedCard.cardId,
          balance: (selectedCard.balance ?? 0) + amount,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['station-cards', tenantId] })
      setSuccess('Top-up berhasil')
      setView('list')
      setSelectedCard(null); setTopupAmount('')
    },
    onError: (e) => setError(String(e)),
  })

  const blockCard = useMutation({
    mutationFn: async (card: CardRow) => {
      const res = await fetch('/api/cards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, cardId: card.cardId, status: 'blocked_admin' }),
      })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['station-cards', tenantId] }),
  })

  return (
    <KioskLayout title="Station" tenantName={tenantName}>
      <div className="flex-1 p-4 space-y-4 max-w-md mx-auto w-full">
        <div className="flex items-center justify-between">
          <h1 className="type-h5 text-foreground">Manajemen Kartu</h1>
          <div className="flex gap-2">
            <Button size="sm" variant={view === 'list' ? 'default' : 'outline'} onClick={() => { setView('list'); setError(null); setSuccess(null) }}
              className={view === 'list' ? 'bg-brand-dark text-white' : ''}>
              Daftar
            </Button>
            <Button size="sm" variant={view === 'register' ? 'default' : 'outline'} onClick={() => { setView('register'); setError(null); setSuccess(null) }}
              className={view === 'register' ? 'bg-brand-dark text-white' : ''}>
              Daftarkan
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-signal-bg-error border border-signal-error/30 p-3">
            <p className="type-body2 text-signal-error">{error}</p>
          </div>
        )}
        {success && (
          <div className="rounded-xl bg-signal-bg-valid border border-signal-valid/30 p-3">
            <p className="type-body2 text-signal-valid">{success}</p>
          </div>
        )}

        {view === 'list' && (
          <div className="space-y-2">
            {cards.isLoading && <p className="type-body1 text-muted-foreground">Memuat...</p>}
            {cards.data?.map((card) => (
              <div key={card.cardId} className="bg-white rounded-xl border p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="type-body1-bold truncate">{card.userName ?? `User #${card.userId}`}</p>
                  <p className="type-body2 font-mono text-muted-foreground">{card.cardId}</p>
                  <p className="type-body2 text-signal-text-secondary">{card.status} · Rp {card.balance?.toLocaleString('id-ID')}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => { setSelectedCard(card); setView('topup') }}
                    disabled={card.status !== 'active'}>
                    Top-up
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive"
                    onClick={() => blockCard.mutate(card)} disabled={card.status !== 'active'}>
                    Blokir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'register' && (
          <div className="bg-white rounded-xl border p-4 space-y-4">
            <h2 className="type-title-bold">Daftarkan Kartu Baru</h2>
            <div className="space-y-1.5">
              <Label>Card ID (hex)</Label>
              <Input placeholder="0102030405ff" value={newCardId} onChange={(e) => setNewCardId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>User ID</Label>
              <Input type="number" placeholder="1001" value={newUserId} onChange={(e) => setNewUserId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Saldo Awal (IDR)</Label>
              <Input type="number" placeholder="50000" value={newBalance} onChange={(e) => setNewBalance(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => registerCard.mutate()} disabled={!newCardId || registerCard.isPending}
                className="flex-1 bg-brand-dark text-white hover:bg-brand-dark/90">
                {registerCard.isPending ? 'Mendaftarkan...' : 'Daftarkan'}
              </Button>
              <Button variant="outline" onClick={() => setView('list')}>Batal</Button>
            </div>
          </div>
        )}

        {view === 'topup' && selectedCard && (
          <div className="bg-white rounded-xl border p-4 space-y-4">
            <h2 className="type-title-bold">Top-up Kartu</h2>
            <div className="rounded-xl bg-signal-disable p-3 space-y-1">
              <p className="type-body1-bold">{selectedCard.userName ?? `User #${selectedCard.userId}`}</p>
              <p className="type-body2 font-mono text-muted-foreground">{selectedCard.cardId}</p>
              <p className="type-title-bold text-brand">Rp {selectedCard.balance?.toLocaleString('id-ID')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Nominal Top-up (IDR)</Label>
              <Input type="number" placeholder="100000" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[50_000, 100_000, 200_000].map((v) => (
                <button key={v} onClick={() => setTopupAmount(String(v))}
                  className="rounded-xl border-2 border-brand-dark/20 p-2 type-body1-bold text-brand-dark hover:bg-brand-dark hover:text-white transition-colors">
                  {v / 1000}k
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => topupCard.mutate()} disabled={!topupAmount || topupCard.isPending}
                className="flex-1 bg-brand-dark text-white hover:bg-brand-dark/90">
                {topupCard.isPending ? 'Memproses...' : 'Top-up'}
              </Button>
              <Button variant="outline" onClick={() => setView('list')}>Batal</Button>
            </div>
          </div>
        )}
      </div>
    </KioskLayout>
  )
}
