import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AdminLayout } from '../layout/AdminLayout'
import { BRAND } from '../../lib/brand'
import { RefreshCw, CreditCard, TrendingUp, FileText } from 'lucide-react'

type AdminSection = 'dashboard' | 'cards' | 'transactions' | 'reconcile' | 'settings' | 'export'

interface AdminSectionProps {
  tenantId: string
  tenantName: string
  role: string
}

async function fetchCards(tenantId: string) {
  const res = await fetch(`/api/cards?tenantId=${tenantId}`)
  if (!res.ok) throw new Error('Failed to fetch cards')
  return res.json()
}

async function fetchAuditLog(tenantId: string) {
  const res = await fetch(`/api/audit?tenantId=${tenantId}&limit=100`)
  if (!res.ok) throw new Error('Failed to fetch audit log')
  return res.json()
}

export function AdminSection({ tenantId, tenantName, role }: AdminSectionProps) {
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard')

  const cards = useQuery({ queryKey: ['cards', tenantId], queryFn: () => fetchCards(tenantId) })
  const audit = useQuery({ queryKey: ['audit', tenantId], queryFn: () => fetchAuditLog(tenantId) })

  const totalBalance = (cards.data ?? []).reduce(
    (sum: number, c: { balance: number }) => sum + (c.balance ?? 0),
    0,
  )
  const activeCards = (cards.data ?? []).filter(
    (c: { status: string }) => c.status === 'active',
  ).length

  return (
    <AdminLayout
      tenantId={tenantId}
      tenantName={tenantName}
      role={role}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    >
      {activeSection === 'dashboard' && (
        <DashboardView
          cardCount={(cards.data ?? []).length}
          activeCards={activeCards}
          totalBalance={totalBalance}
          recentAudit={(audit.data ?? []).slice(0, 5)}
          loading={cards.isLoading || audit.isLoading}
        />
      )}

      {activeSection === 'cards' && (
        <CardsView tenantId={tenantId} cards={cards.data ?? []} loading={cards.isLoading} error={cards.error} />
      )}

      {activeSection === 'transactions' && (
        <TransactionsView entries={audit.data ?? []} loading={audit.isLoading} error={audit.error} />
      )}

      {activeSection === 'reconcile' && (
        <ReconcileView tenantId={tenantId} />
      )}

      {(activeSection === 'settings' || activeSection === 'export') && (
        <SettingsView tenantId={tenantId} tenantName={tenantName} activeSection={activeSection} />
      )}
    </AdminLayout>
  )
}

/* ── Sub-views ─────────────────────────────────── */

interface DashboardViewProps {
  cardCount: number
  activeCards: number
  totalBalance: number
  recentAudit: AuditEntry[]
  loading: boolean
}

interface AuditEntry {
  id: number
  type: string
  amount: number
  balanceAfter: number
  timestamp: number
  flagged: boolean
}

function DashboardView({ cardCount, activeCards, totalBalance, recentAudit, loading }: DashboardViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="type-h4 text-foreground">{BRAND.APP_NAME}</h1>
        <p className="type-body1 text-signal-text-secondary">{BRAND.BYLINE}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={CreditCard} label="Total Kartu" value={String(cardCount)} loading={loading} />
        <StatCard icon={TrendingUp} label="Kartu Aktif" value={String(activeCards)} loading={loading} color="valid" />
        <StatCard
          icon={FileText}
          label="Total Saldo"
          value={`Rp ${totalBalance.toLocaleString('id-ID')}`}
          loading={loading}
          wide
        />
        <StatCard icon={RefreshCw} label="Transaksi" value={String(recentAudit.length)} loading={loading} />
      </div>

      <section>
        <h2 className="type-title-bold text-foreground mb-3">Transaksi Terbaru</h2>
        <div className="bg-white rounded-xl border divide-y">
          {loading && <p className="px-4 py-3 type-body1 text-muted-foreground">Memuat...</p>}
          {recentAudit.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
          {!loading && recentAudit.length === 0 && (
            <p className="px-4 py-3 type-body1 text-muted-foreground">Belum ada transaksi.</p>
          )}
        </div>
      </section>
    </div>
  )
}

interface StatCardProps {
  icon: React.ElementType
  label: string
  value: string
  loading?: boolean
  color?: 'valid' | 'info' | 'warning'
  wide?: boolean
}

function StatCard({ icon: Icon, label, value, loading, color, wide }: StatCardProps) {
  const colorClass = color === 'valid'
    ? 'text-signal-valid'
    : color === 'info'
      ? 'text-signal-info'
      : color === 'warning'
        ? 'text-signal-warning'
        : 'text-brand'

  return (
    <div className={['bg-white rounded-xl border p-4 space-y-2', wide ? 'col-span-2 lg:col-span-1' : ''].join(' ')}>
      <Icon size={20} className={colorClass} />
      <p className="type-body2 text-signal-text-secondary">{label}</p>
      {loading
        ? <div className="h-6 bg-muted rounded animate-pulse" />
        : <p className="type-title-bold text-foreground">{value}</p>
      }
    </div>
  )
}

interface CardsViewProps {
  tenantId: string
  cards: CardRow[]
  loading: boolean
  error: Error | null
}

interface CardRow {
  cardId: string
  status: string
  balance: number
  userId: number | null
  userName?: string | null
}

function CardsView({ cards, loading, error }: CardsViewProps) {
  return (
    <div className="space-y-4">
      <h1 className="type-h4 text-foreground">Kartu</h1>
      {loading && <p className="type-body1 text-muted-foreground">Memuat...</p>}
      {error && <p className="type-body1 text-destructive">{String(error)}</p>}
      <div className="bg-white rounded-xl border divide-y">
        {cards.map((card) => (
          <div key={card.cardId} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="type-body1-bold text-foreground truncate">
                {card.userName ?? `User #${card.userId}`}
              </p>
              <p className="type-body2 font-mono text-signal-text-secondary truncate">{card.cardId}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="type-body1-bold text-foreground">
                Rp {card.balance?.toLocaleString('id-ID')}
              </p>
              <StatusBadge status={card.status} />
            </div>
          </div>
        ))}
        {!loading && cards.length === 0 && (
          <p className="px-4 py-3 type-body1 text-muted-foreground">Belum ada kartu.</p>
        )}
      </div>
    </div>
  )
}

interface TransactionsViewProps {
  entries: AuditEntry[]
  loading: boolean
  error: Error | null
}

function TransactionsView({ entries, loading, error }: TransactionsViewProps) {
  return (
    <div className="space-y-4">
      <h1 className="type-h4 text-foreground">Transaksi</h1>
      {loading && <p className="type-body1 text-muted-foreground">Memuat...</p>}
      {error && <p className="type-body1 text-destructive">{String(error)}</p>}
      <div className="bg-white rounded-xl border divide-y">
        {entries.map((entry) => (
          <AuditRow key={entry.id} entry={entry} />
        ))}
        {!loading && entries.length === 0 && (
          <p className="px-4 py-3 type-body1 text-muted-foreground">Belum ada transaksi.</p>
        )}
      </div>
    </div>
  )
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const typeColors: Record<string, string> = {
    debit: 'text-signal-error',
    credit: 'text-signal-valid',
    checkin: 'text-signal-info',
    checkout: 'text-signal-text-secondary',
    admin: 'text-signal-warning',
  }
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <div>
        <span className={['type-body1-bold capitalize', typeColors[entry.type] ?? ''].join(' ')}>
          {entry.type}
        </span>
        {entry.flagged && (
          <span className="ml-2 px-1.5 py-0.5 rounded bg-signal-bg-error type-body2 text-signal-error">
            flagged
          </span>
        )}
      </div>
      <div className="text-right">
        <p className="type-body1-bold text-foreground">
          Rp {entry.amount?.toLocaleString('id-ID')}
        </p>
        <p className="type-body2 text-signal-text-secondary">
          {new Date(entry.timestamp * 1000).toLocaleString('id-ID')}
        </p>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    active: { bg: 'bg-signal-bg-valid', text: 'text-signal-valid' },
    blocked_admin: { bg: 'bg-signal-bg-error', text: 'text-signal-error' },
    blocked_tamper: { bg: 'bg-signal-bg-error', text: 'text-signal-error' },
    blocked_fraud: { bg: 'bg-signal-bg-warning', text: 'text-signal-warning' },
    blocked_expired: { bg: 'bg-muted', text: 'text-muted-foreground' },
  }
  const { bg, text } = map[status] ?? { bg: 'bg-muted', text: 'text-muted-foreground' }
  return (
    <span className={['inline-block px-2 py-0.5 rounded-full type-body2', bg, text].join(' ')}>
      {status.replace('blocked_', '').replace('_', ' ')}
    </span>
  )
}

function ReconcileView({ tenantId }: { tenantId: string }) {
  return (
    <div className="space-y-4">
      <h1 className="type-h4 text-foreground">Rekonsiliasi</h1>
      <div className="bg-white rounded-xl border p-6 space-y-3">
        <p className="type-body1 text-signal-text-secondary">
          Sinkronisasi transaksi offline ke server untuk tenant <strong>{tenantId}</strong>.
        </p>
        <p className="type-body2 text-muted-foreground">
          Transaksi yang belum terkirim akan muncul di sini. Gunakan tombol Sync di terminal untuk memulai.
        </p>
      </div>
    </div>
  )
}

function SettingsView({ tenantId, tenantName, activeSection }: { tenantId: string; tenantName: string; activeSection: string }) {
  return (
    <div className="space-y-4">
      <h1 className="type-h4 text-foreground">
        {activeSection === 'export' ? 'Export & Backup' : 'Pengaturan'}
      </h1>
      <div className="bg-white rounded-xl border p-6 space-y-3">
        <div>
          <p className="type-body1-bold text-foreground">Informasi Tenant</p>
          <p className="type-body1 text-signal-text-secondary mt-1">{tenantName}</p>
          <p className="type-body2 font-mono text-muted-foreground">{tenantId}</p>
        </div>
        {activeSection === 'export' && (
          <p className="type-body2 text-muted-foreground pt-2 border-t">
            Fitur export data tenant akan tersedia setelah implementasi mode lokal.
          </p>
        )}
      </div>
    </div>
  )
}
