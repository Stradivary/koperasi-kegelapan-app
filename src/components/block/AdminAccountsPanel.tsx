import { useState } from 'react'
import { Users } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { cn } from '../../lib/utils'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  station: 'Station',
  gate: 'Gate',
  terminal: 'Terminal',
}

export interface AdminAccountRow {
  accountId: string
  username: string
  role: string
  status: string
  createdAt: number
}

interface AdminAccountsPanelProps {
  accounts: AdminAccountRow[]
  isLoading: boolean
  isCreating: boolean
  isToggling: boolean
  onCreateAccount: (username: string, password: string, role: string) => Promise<void>
  onToggleStatus: (accountId: string, currentStatus: string) => void
}

export function AdminAccountsPanel({
  accounts,
  isLoading,
  isCreating,
  isToggling,
  onCreateAccount,
  onToggleStatus,
}: AdminAccountsPanelProps) {
  const [showForm, setShowForm] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [selectedRole, setSelectedRole] = useState<string>('terminal')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    try {
      await onCreateAccount(username, password, selectedRole)
      setShowForm(false)
      setUsername('')
      setPassword('')
      setSelectedRole('terminal')
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Manajemen Akun</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{accounts.length} akun terdaftar</p>
        </div>
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
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1"
              onClick={handleCreate}
              disabled={!username || !password || password.length < 8 || isCreating}
            >
              {isCreating ? 'Menyimpan...' : 'Buat Akun'}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setError(null) }}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="rounded-lg border divide-y">
          {[1, 2].map((i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between gap-3 animate-pulse">
              <div className="space-y-2">
                <div className="h-3 w-24 bg-muted rounded" />
                <div className="h-2.5 w-32 bg-muted rounded" />
              </div>
              <div className="h-7 w-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      )}
      {!isLoading && (
        <div className="rounded-lg border divide-y overflow-hidden">
          {accounts.map((acc) => (
            <div key={acc.accountId} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Users size={15} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{acc.username}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{ROLE_LABELS[acc.role] ?? acc.role}</span>
                    <span className={cn('text-xs font-medium', acc.status === 'active' ? 'text-green-600' : 'text-muted-foreground')}>
                      {acc.status === 'active' ? 'Aktif' : 'Ditangguhkan'}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant={acc.status === 'active' ? 'ghost' : 'outline'}
                className={acc.status === 'active' ? 'text-destructive' : ''}
                onClick={() => onToggleStatus(acc.accountId, acc.status)}
                disabled={isToggling}
              >
                {acc.status === 'active' ? 'Tangguhkan' : 'Aktifkan'}
              </Button>
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Users size={32} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Belum ada akun terdaftar</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
