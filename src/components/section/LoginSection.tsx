import { useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Server, HardDrive } from 'lucide-react'
import { tenantContextStore } from '../../lib/indexeddb'
import { localLogin, hasLocalTenant } from '../../lib/localTenant'
import { getOrCreateDeviceId } from '../../lib/getOrCreateDeviceId'
import { BRAND } from '../../lib/brand'
import { AuthLayout } from '../layout/AuthLayout'
import { LocalSetupSection } from './LocalSetupSection'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

type LoginMode = 'detecting' | 'server' | 'local' | 'setup'

export function LoginSection() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<LoginMode>('detecting')
  const [hasLocal, setHasLocal] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    hasLocalTenant().then((exists) => {
      setHasLocal(exists)
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

  function switchMode(next: 'server' | 'local') {
    setError(null)
    setUsername('')
    setPassword('')
    if (next === 'local' && !hasLocal) {
      setMode('setup')
    } else {
      setMode(next)
    }
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
        onComplete={(tenantId, role) => { setHasLocal(true); redirectToRole(tenantId, role) }}
        onServerMode={() => switchMode('server')}
      />
    )
  }

  const isLocal = mode === 'local'
  const handleSubmit = isLocal ? handleLocalLogin : handleServerLogin

  return (
    <AuthLayout variant={isLocal ? 'brand-dark' : 'brand'}>
      {/* Mode toggle */}
      <div className="flex rounded-xl border bg-muted/40 p-1 gap-1">
        <button
          type="button"
          onClick={() => switchMode('server')}
          className={[
            'flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
            !isLocal
              ? 'bg-white shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <Server size={15} />
          Server
        </button>
        <button
          type="button"
          onClick={() => switchMode('local')}
          className={[
            'flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
            isLocal
              ? 'bg-white shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <HardDrive size={15} />
          Lokal
        </button>
      </div>

      <div>
        <h1 className="type-h5 text-foreground">Masuk</h1>
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

      {isLocal && (
        <div className="pt-1 border-t text-center">
          <button
            type="button"
            onClick={() => { setMode('setup'); setError(null) }}
            className="type-body2 text-muted-foreground hover:text-foreground hover:underline"
          >
            Daftarkan koperasi baru
          </button>
        </div>
      )}

      <p className="type-body2 text-signal-text-disable text-center">
        {BRAND.APP_NAME} · {BRAND.BYLINE}
      </p>
    </AuthLayout>
  )
}
