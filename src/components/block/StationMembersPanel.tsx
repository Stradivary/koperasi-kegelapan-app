import { useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { cn } from '../../lib/utils'

export interface StationMemberRow {
  userId: number
  name: string
  status: string
}

type MemberView = 'list' | 'add'

interface StationMembersPanelProps {
  members: StationMemberRow[]
  isLoading: boolean
  isCreating: boolean
  isToggling: boolean
  onCreateMember: (name: string) => Promise<void>
  onToggleStatus: (userId: number, currentStatus: string) => void
}

export function StationMembersPanel({
  members,
  isLoading,
  isCreating,
  isToggling,
  onCreateMember,
  onToggleStatus,
}: StationMembersPanelProps) {
  const [memberView, setMemberView] = useState<MemberView>('list')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    try {
      await onCreateMember(name)
      setMemberView('list')
      setName('')
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    }
  }

  return (
    <div className="space-y-4">
      {memberView === 'list' && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{members.length} anggota</span>
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
              onClick={handleCreate}
              disabled={!name.trim() || isCreating}
              className="flex-1"
            >
              {isCreating ? 'Menyimpan...' : 'Daftarkan'}
            </Button>
            <Button variant="outline" onClick={() => { setMemberView('list'); setError(null) }}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {memberView === 'list' && (
        <div className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Memuat...</p>}
          {members.map((m) => (
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
                onClick={() => onToggleStatus(m.userId, m.status)}
                disabled={isToggling}
              >
                {m.status === 'active' ? 'Tangguhkan' : 'Aktifkan'}
              </Button>
            </div>
          ))}
          {members.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">Belum ada anggota terdaftar</p>
          )}
        </div>
      )}
    </div>
  )
}
