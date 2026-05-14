import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { tenantContextStore, localTenantConfigStore } from '../lib/indexeddb'
import { localLogin, hasLocalTenant } from '../lib/localTenant'
import { BRAND } from '../lib/brand'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { LocalSetupSection } from '../components/section/LocalSetupSection'

export const Route = createFileRoute('/')({ component: LoginPage })

type LoginMode = 'detecting' | 'server' | 'local' | 'setup'

function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<LoginMode>('detecting')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Detect if local tenants exist on mount
  useEffect(() => {
    hasLocalTenant().then((exists) => {
      setMode(exists ? 'local' : 'server')
    })
  }, [])

  function redirectToRole(tenantId: string, role: string) {
    const roleRoutes: Record<string, string> = {
      terminal: `/tenant/${tenantId}/terminal`,
      gate: `/tenant/${tenantId}/gate`,
      kiosk: `/tenant/${tenantId}/kiosk`,
      scout: `/tenant/${tenantId}/scout`,
      station: `/tenant/${tenantId}/station`,
      admin: `/tenant/${tenantId}/admin`,
    }
    navigate({ to: roleRoutes[role] ?? '/' })
  }

  async function handleLocalLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await localLogin(username, password)
      if (!result) { setError('Username atau password salah'); return }

      await tenantContextStore.put({
        tenantId: result.tenantId,
        tenantSlug: result.tenantSlug,
        tenantName: result.tenantName,
        deviceId: getOrCreateDeviceId(),
        accountId: result.accountId,
        role: result.role,
        updatedAt: Date.now(),
      })

      redirectToRole(result.tenantId, result.role)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleServerLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) { setError('Username atau password salah'); return }
      const data = await res.json()
      await tenantContextStore.put({
        tenantId: data.tenantId,
        tenantSlug: data.tenantSlug,
        tenantName: data.tenantName,
        deviceId: getOrCreateDeviceId(),
        accountId: data.accountId,
        role: data.role,
        updatedAt: Date.now(),
      })
      redirectToRole(data.tenantId, data.role)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'detecting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-signal-disable">
        <p className="type-body1 text-muted-foreground animate-pulse">Memuat...</p>
      </div>
    )
  }

  if (mode === 'setup') {
    return (
      <LocalSetupSection
        onComplete={(tenantId, role) => redirectToRole(tenantId, role)}
        onServerMode={() => setMode('server')}
      />
    )
  }

  const isLocal = mode === 'local'
  const handleSubmit = isLocal ? handleLocalLogin : handleServerLogin

  return (
    <div className="min-h-screen flex flex-col bg-signal-disable">
      {/* Brand header */}
      <div className={['text-white text-center py-10 px-4', isLocal ? 'bg-brand-dark' : 'bg-brand'].join(' ')}>
        <p className="type-h3 text-white">{BRAND.APP_NAME}</p>
        <p className="type-body1 text-white/70 mt-1">{BRAND.BYLINE}</p>
      </div>

      {/* Login card */}
      <div className="flex-1 flex items-start justify-center p-6 -mt-6">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-5">
          <div>
            <div className="flex items-center justify-between">
              <h1 className="type-h5 text-foreground">Masuk</h1>
              {isLocal && (
                <span className="px-2 py-0.5 rounded-full bg-brand-dark/10 type-body2 text-brand-dark">
                  Mode Lokal
                </span>
              )}
            </div>
            <p className="type-body2 text-signal-text-secondary mt-0.5">
              {isLocal ? 'Masuk menggunakan akun lokal' : 'Masuk ke terminal Anda'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="type-body1-bold">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="type-body1-bold">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="h-11"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-signal-bg-error border border-signal-error/30 px-3 py-2">
                <p className="type-body2 text-signal-error">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className={[
                'w-full h-12 text-white type-title-bold',
                isLocal ? 'bg-brand-dark hover:bg-brand-dark/90' : 'bg-brand hover:bg-brand/90',
              ].join(' ')}
            >
              {loading ? 'Memuat...' : 'Masuk'}
            </Button>
          </form>

          {/* Mode toggle */}
          <div className="pt-1 border-t space-y-2">
            {isLocal ? (
              <>
                <button
                  onClick={() => { setMode('server'); setError(null) }}
                  className="w-full type-body2 text-signal-info hover:underline text-center"
                >
                  Masuk dengan akun server
                </button>
                <button
                  onClick={() => { setMode('setup'); setError(null) }}
                  className="w-full type-body2 text-muted-foreground hover:underline text-center"
                >
                  Tambah koperasi lokal baru
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setMode('setup'); setError(null) }}
                  className="w-full type-body2 text-signal-text-secondary hover:underline text-center"
                >
                  Mulai tanpa server (Mode Lokal)
                </button>
                {isLocal ? null : (
                  <button
                    onClick={() => { setMode('local'); setError(null) }}
                    className="w-full type-body2 text-signal-info hover:underline text-center"
                  >
                    Gunakan akun lokal
                  </button>
                )}
              </>
            )}
          </div>

          <p className="type-body2 text-signal-text-disable text-center">
            {BRAND.APP_NAME} · {BRAND.BYLINE}
          </p>
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
