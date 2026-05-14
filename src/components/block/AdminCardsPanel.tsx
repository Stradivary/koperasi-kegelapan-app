import { CreditCard } from 'lucide-react'
import { Button } from '../ui/button'

export interface AdminCardRow {
  cardId: string
  userId: number | null
  userName: string | null
  status: string
  balance: number
  counter: number
}

interface AdminCardsPanelProps {
  cards: AdminCardRow[]
  isLoading: boolean
  error: string | null
  canScan: boolean
  onScan: () => void
}

export function AdminCardsPanel({ cards, isLoading, error, canScan, onScan }: AdminCardsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Daftar Kartu</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{cards.length} kartu terdaftar</p>
        </div>
        <Button size="sm" onClick={onScan} disabled={!canScan}>
          Scan Kartu NFC
        </Button>
      </div>
      {isLoading && (
        <div className="rounded-lg border divide-y">
          {[1, 2, 3].map((i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between gap-3 animate-pulse">
              <div className="space-y-2">
                <div className="h-3 w-28 bg-muted rounded" />
                <div className="h-2.5 w-44 bg-muted rounded" />
              </div>
              <div className="space-y-2 text-right">
                <div className="h-3 w-16 bg-muted rounded ml-auto" />
                <div className="h-2.5 w-10 bg-muted rounded ml-auto" />
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!isLoading && !error && (
        <div className="rounded-lg border divide-y overflow-hidden">
          {cards.map((card) => (
            <div key={card.cardId} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <CreditCard size={16} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{card.userName ?? `User #${card.userId}`}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{card.cardId}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">Rp {card.balance?.toLocaleString('id-ID')}</p>
                <span className={['text-xs px-1.5 py-0.5 rounded-full font-medium', card.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'].join(' ')}>
                  {card.status}
                </span>
              </div>
            </div>
          ))}
          {cards.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <CreditCard size={32} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Belum ada kartu terdaftar</p>
              <p className="text-xs text-muted-foreground/70">Gunakan tombol Scan Kartu NFC untuk mendaftarkan kartu baru</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
