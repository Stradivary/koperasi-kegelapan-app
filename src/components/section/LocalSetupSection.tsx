import { useState } from 'react'
import { BRAND } from '../../lib/brand'
import { setupLocalTenant } from '../../lib/localTenant'
import { tenantContextStore } from '../../lib/indexeddb'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { CheckCircle, Building2, User, Lock, Globe } from 'lucide-react'

type SetupStep = 'welcome' | 'tenant' | 'admin' | 'done'

interface LocalSetupSectionProps {
  onComplete: (tenantId: string, role: string) => void
  onServerMode: () => void
}

export function LocalSetupSection({ onComplete, onServerMode }: LocalSetupSectionProps) {
  const [step, setStep] = useState<SetupStep>('welcome')
  const [tenantName, setTenantName] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSetup() {
    if (adminPassword !== confirmPassword) {
      setError('Password tidak cocok')
      return
    }
    if (adminPassword.length < 6) {
      setError('Password minimal 6 karakter')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const cfg = await setupLocalTenant({
        name: tenantName,
        slug: tenantSlug || undefined,
        adminUsername,
        adminPassword,
      })
      await tenantContextStore.put({
        tenantId: cfg.tenantId,
        tenantSlug: cfg.slug,
        tenantName: cfg.name,
        deviceId: getOrCreateDeviceId(),
        accountId: cfg.tenantId + '-admin',
        role: 'admin',
        updatedAt: Date.now(),
      })
      setStep('done')
      setTimeout(() => onComplete(cfg.tenantId, 'admin'), 1200)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-signal-disable">
      {/* Brand header */}
      <div className="bg-brand-dark text-white text-center py-10 px-4">
        <p className="type-h3 text-white">{BRAND.APP_NAME}</p>
        <p className="type-body1 text-white/70 mt-1">Pengaturan Pertama</p>
      </div>

      <div className="flex-1 flex items-start justify-center p-6 -mt-6">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-5">

          {/* Step: Welcome */}
          {step === 'welcome' && (
            <div className="space-y-5">
              <div>
                <h1 className="type-h5 text-foreground">Selamat Datang</h1>
                <p className="type-body1 text-signal-text-secondary mt-1">
                  Pilih cara menjalankan {BRAND.APP_NAME}
                </p>
              </div>

              <button
                onClick={() => setStep('tenant')}
                className="w-full text-left rounded-xl border-2 border-brand-dark/20 p-4 hover:border-brand-dark hover:bg-brand-dark/5 transition-all group space-y-1"
              >
                <div className="flex items-center gap-2">
                  <Building2 size={18} className="text-brand-dark group-hover:text-brand-dark" />
                  <p className="type-title-bold text-foreground">Mulai Lokal</p>
                </div>
                <p className="type-body2 text-signal-text-secondary">
                  Jalankan di perangkat ini tanpa server. Data tersimpan lokal. Bisa disinkronkan ke server kapan saja.
                </p>
              </button>

              <button
                onClick={onServerMode}
                className="w-full text-left rounded-xl border-2 border-muted p-4 hover:border-brand/30 hover:bg-brand/5 transition-all group space-y-1"
              >
                <div className="flex items-center gap-2">
                  <Globe size={18} className="text-signal-info group-hover:text-signal-info" />
                  <p className="type-title-bold text-foreground">Hubungkan ke Server</p>
                </div>
                <p className="type-body2 text-signal-text-secondary">
                  Login menggunakan akun yang sudah terdaftar di server.
                </p>
              </button>
            </div>
          )}

          {/* Step: Tenant info */}
          {step === 'tenant' && (
            <div className="space-y-4">
              <div>
                <h1 className="type-h5 text-foreground">Informasi Koperasi</h1>
                <p className="type-body2 text-signal-text-secondary mt-0.5">Isi detail koperasi Anda</p>
              </div>
              <div className="space-y-1.5">
                <Label className="type-body1-bold">Nama Koperasi</Label>
                <Input
                  placeholder="Contoh: Koperasi Maju"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="type-body1-bold">Slug (opsional)</Label>
                <Input
                  placeholder="koperasi-maju"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                />
                <p className="type-body2 text-muted-foreground">Biarkan kosong untuk generate otomatis</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('welcome')} className="flex-1">
                  Kembali
                </Button>
                <Button
                  onClick={() => setStep('admin')}
                  disabled={!tenantName.trim()}
                  className="flex-1 bg-brand-dark text-white hover:bg-brand-dark/90"
                >
                  Lanjut
                </Button>
              </div>
            </div>
          )}

          {/* Step: Admin account */}
          {step === 'admin' && (
            <div className="space-y-4">
              <div>
                <h1 className="type-h5 text-foreground">Akun Admin</h1>
                <p className="type-body2 text-signal-text-secondary mt-0.5">Buat akun admin untuk koperasi <strong>{tenantName}</strong></p>
              </div>
              <div className="space-y-1.5">
                <Label className="type-body1-bold">Username Admin</Label>
                <Input
                  placeholder="admin"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="type-body1-bold">Password</Label>
                <Input
                  type="password"
                  placeholder="Min. 6 karakter"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="type-body1-bold">Konfirmasi Password</Label>
                <Input
                  type="password"
                  placeholder="Ulangi password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <div className="rounded-lg bg-signal-bg-error border border-signal-error/30 px-3 py-2">
                  <p className="type-body2 text-signal-error">{error}</p>
                </div>
              )}
              <p className="type-body2 text-signal-text-secondary bg-signal-bg-info rounded-lg p-3 border border-signal-info/20">
                Password admin akan digunakan untuk mengenkripsi backup data. Simpan dengan aman.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('tenant')} className="flex-1">
                  Kembali
                </Button>
                <Button
                  onClick={handleSetup}
                  disabled={loading || !adminUsername.trim() || !adminPassword}
                  className="flex-1 bg-brand-dark text-white hover:bg-brand-dark/90"
                >
                  {loading ? 'Menyiapkan...' : 'Selesaikan'}
                </Button>
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && (
            <div className="text-center space-y-3 py-4">
              <div className="w-16 h-16 rounded-full bg-signal-bg-valid flex items-center justify-center mx-auto">
                <CheckCircle size={32} className="text-signal-valid" />
              </div>
              <p className="type-title-bold text-foreground">Siap!</p>
              <p className="type-body1 text-signal-text-secondary">
                {BRAND.APP_NAME} siap digunakan secara lokal.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getOrCreateDeviceId(): string {
  const key = 'koperasi-device-id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}
