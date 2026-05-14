import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { cn } from '../../lib/utils'
import { localDb, type User } from '../../db/local-db'
import { useNfcCard } from '../../hooks/useNfcCard'
import { useSessionGrant } from '../../hooks/useSessionGrant'

interface AdminSectionProps {
  tenantId: string
  accountId: string
  deviceId: string
  terminalId: number
  role: string
}

type View = 'cards' | 'audit' | 'accounts' | 'members'

interface CardRow {
  cardId: string
  userId: number | null
  userName: string | null
  status: string
  balance: number
  counter: number
}

interface AuditEntry {
  id: number
  type: string
  amount: number
  balanceAfter: number
  timestamp: number
  flagged: boolean
}

interface AccountRow {
  accountId: string
  username: string
  role: string
  status: string
  createdAt: number
}

interface UserRow {
  userId: number
  name: string
  status: string
  createdAt: number
}

const NAV_ITEMS: { id: View; label: string }[] = [
  { id: 'cards', label: 'Kartu' },
  { id: 'audit', label: 'Audit Log' },
  { id: 'accounts', label: 'Akun' },
  { id: 'members', label: 'Anggota' },
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  station: 'Station',
  gate: 'Gate',
  terminal: 'Terminal',
}

export const AdminSection = ({ tenantId, accountId, deviceId, terminalId, role }: AdminSectionProps) => {
  const [view, setView] = useState<View>('cards')
  const { grant } = useSessionGrant(tenantId, accountId, deviceId)
  const { state, scan } = useNfcCard(grant, tenantId, terminalId)

  return (
    <div className="flex gap-0 min-h-[calc(100vh-80px)] -m-4">
      {/* Sidebar */}
      <aside className="w-44 shrink-0 border-r bg-muted/30 flex flex-col pt-4 pb-4">
        <div className="px-3 mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Admin</p>
          <p className="text-xs text-muted-foreground mt-0.5">{role}</p>
        </div>
        <nav className="space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                view === item.id
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 p-4 overflow-auto">
        {view === 'cards' && <CardsView tenantId={tenantId} />}
        {view === 'audit' && <AuditView tenantId={tenantId} />}
        {view === 'accounts' && <AccountsView tenantId={tenantId} />}
        {view === 'members' && <MembersView tenantId={tenantId} />}
      </div>
      <button onClick={scan} disabled={!grant}>Scan NFC Card</button>
      {state.error && <p className="error">Error: {state.error}</p>}
    </div>
  )
}

function CardsView({ tenantId }: { tenantId: string }) {
  const cards = useQuery<CardRow[]>({
    queryKey: ['admin-cards', tenantId],
    queryFn: async () => {
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
      }))
    },
  })

  return (
    <div className="space-y-3 max-w-2xl">
      <h2 className="font-semibold">Daftar Kartu</h2>
      {cards.isLoading && <p className="text-sm text-muted-foreground">Memuat...</p>}
      {cards.error && <p className="text-sm text-destructive">{String(cards.error)}</p>}
      {cards.data && (
        <div className="rounded-lg border divide-y">
          {cards.data.map((card) => (
            <div key={card.cardId} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{card.userName ?? `User #${card.userId}`}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">{card.cardId}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium">Rp {card.balance?.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{card.status}</p>
              </div>
            </div>
          ))}
          {cards.data.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">Belum ada kartu terdaftar</p>
          )}
        </div>
      )}
    </div>
  )
}

function AuditView({ tenantId }: { tenantId: string }) {
  const audit = useQuery<AuditEntry[]>({
    queryKey: ['admin-audit', tenantId],
    queryFn: () =>
      localDb.auditLog
        .where('tenantId')
        .equals(tenantId)
        .reverse()
        .limit(100)
        .toArray() as Promise<AuditEntry[]>,
  })

  return (
    <div className="space-y-3 max-w-2xl">
      <h2 className="font-semibold">Audit Log</h2>
      {audit.isLoading && <p className="text-sm text-muted-foreground">Memuat...</p>}
      {audit.error && <p className="text-sm text-destructive">{String(audit.error)}</p>}
      {audit.data && (
        <div className="rounded-lg border divide-y text-sm">
          {audit.data.map((entry) => (
            <div key={entry.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div>
                <span className="font-medium capitalize">{entry.type}</span>
                {entry.flagged && (
                  <span className="ml-2 text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                    flagged
                  </span>
                )}
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0">
                <p className="font-medium text-foreground">Rp {entry.amount?.toLocaleString()}</p>
                <p>{new Date(entry.timestamp * 1000).toLocaleString('id-ID')}</p>
              </div>
            </div>
          ))}
          {audit.data.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">Belum ada transaksi</p>
          )}
        </div>
      )}
    </div>
  )
}

function AccountsView({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [selectedRole, setSelectedRole] = useState<string>('terminal')
  const [error, setError] = useState<string | null>(null)

  const accounts = useQuery<AccountRow[]>({
    queryKey: ['admin-accounts', tenantId],
    queryFn: () => fetch(`/api/accounts?tenantId=${tenantId}`).then((r) => r.json()),
  })

  const createAccount = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, username, password, role: selectedRole }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Gagal membuat akun')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-accounts', tenantId] })
      setShowForm(false)
      setUsername(''); setPassword(''); setSelectedRole('terminal'); setError(null)
    },
    onError: (e) => setError(String(e instanceof Error ? e.message : e)),
  })

  const toggleStatus = useMutation({
    mutationFn: async ({ accountId, status }: { accountId: string; status: string }) => {
      const res = await fetch('/api/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, accountId, status }),
      })
      if (!res.ok) throw new Error('Gagal mengubah status')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-accounts', tenantId] }),
  })

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Manajemen Akun</h2>
        {!showForm && (
          <Button size="sm" onClick={() => { setShowForm(true); setError(null) }}>
            Tambah Akun
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-medium">Akun Baru</h3>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label className="text-xs">Username</Label>
            <Input placeholder="station01" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Password</Label>
            <Input type="password" placeholder="min. 8 karakter" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(ROLE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1"
              onClick={() => createAccount.mutate()}
              disabled={!username || !password || password.length < 8 || createAccount.isPending}
            >
              {createAccount.isPending ? 'Menyimpan...' : 'Buat Akun'}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setError(null) }}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {accounts.isLoading && <p className="text-sm text-muted-foreground">Memuat...</p>}
      {accounts.data && (
        <div className="rounded-lg border divide-y">
          {accounts.data.map((acc) => (
            <div key={acc.accountId} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{acc.username}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{ROLE_LABELS[acc.role] ?? acc.role}</span>
                  <span className={cn('text-xs', acc.status === 'active' ? 'text-green-600' : 'text-muted-foreground')}>
                    {acc.status === 'active' ? 'Aktif' : 'Ditangguhkan'}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant={acc.status === 'active' ? 'ghost' : 'outline'}
                className={acc.status === 'active' ? 'text-destructive' : ''}
                onClick={() => toggleStatus.mutate({ accountId: acc.accountId, status: acc.status === 'active' ? 'suspended' : 'active' })}
                disabled={toggleStatus.isPending}
              >
                {acc.status === 'active' ? 'Tangguhkan' : 'Aktifkan'}
              </Button>
            </div>
          ))}
          {accounts.data.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">Belum ada akun</p>
          )}
        </div>
      )}
    </div>
  )
}

function MembersView({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
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
      setShowForm(false)
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
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Anggota</h2>
        {!showForm && (
          <Button size="sm" onClick={() => { setShowForm(true); setError(null) }}>
            Tambah Anggota
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-medium">Anggota Baru</h3>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label className="text-xs">Nama Lengkap</Label>
            <Input placeholder="Ahmad Rifai" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1"
              onClick={() => createMember.mutate()}
              disabled={!name.trim() || createMember.isPending}
            >
              {createMember.isPending ? 'Menyimpan...' : 'Daftarkan'}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setError(null) }}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {members.isLoading && <p className="text-sm text-muted-foreground">Memuat...</p>}
      {members.data && (
        <div className="rounded-lg border divide-y">
          {members.data.map((m) => (
            <div key={m.userId} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">#{m.userId} · {m.status === 'active' ? 'Aktif' : 'Ditangguhkan'}</p>
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
          {members.data.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">Belum ada anggota terdaftar</p>
          )}
        </div>
      )}
    </div>
  )
}
