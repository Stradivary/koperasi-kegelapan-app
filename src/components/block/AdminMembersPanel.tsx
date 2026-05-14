import { useState } from 'react'
import { UserCheck } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

export interface AdminUserRow {
  userId: number
  name: string
  status: string
  createdAt: number
}

interface AdminMembersPanelProps {
  members: AdminUserRow[]
  isLoading: boolean
  isCreating: boolean
  isToggling: boolean
  onCreateMember: (name: string) => Promise<void>
  onToggleStatus: (userId: number, currentStatus: string) => void
}

export function AdminMembersPanel({
  members,
  isLoading,
  isCreating,
  isToggling,
  onCreateMember,
  onToggleStatus,
}: AdminMembersPanelProps) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    try {
      await onCreateMember(name)
      setShowForm(false)
      setName('')
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Anggota</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{members.length} anggota terdaftar</p>
        </div>
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
              onClick={handleCreate}
              disabled={!name.trim() || isCreating}
            >
              {isCreating ? 'Menyimpan...' : 'Daftarkan'}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setError(null) }}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="rounded-lg border divide-y">
          {[1, 2, 3].map((i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between gap-3 animate-pulse">
              <div className="space-y-2">
                <div className="h-3 w-32 bg-muted rounded" />
                <div className="h-2.5 w-20 bg-muted rounded" />
              </div>
              <div className="h-7 w-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      )}
      {!isLoading && (
        <div className="rounded-lg border divide-y overflow-hidden">
          {members.map((m) => (
            <div key={m.userId} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-semibold text-primary">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">#{m.userId} · <span className={m.status === 'active' ? 'text-green-600 font-medium' : ''}>{m.status === 'active' ? 'Aktif' : 'Ditangguhkan'}</span></p>
                </div>
              </div>
              <Button
                size="sm"
                variant={m.status === 'active' ? 'ghost' : 'outline'}
                className={m.status === 'active' ? 'text-destructive' : ''}
                onClick={() => onToggleStatus(m.userId, m.status)}
                disabled={isToggling}
              >
                {m.status === 'active' ? 'Tangguhkan' : 'Aktifkan'}
              </Button>
            </div>
          ))}
          {members.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <UserCheck size={32} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Belum ada anggota terdaftar</p>
              <p className="text-xs text-muted-foreground/70">Tambahkan anggota pertama menggunakan tombol di atas</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
