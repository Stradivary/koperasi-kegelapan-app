import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { tenantContextStore } from '../lib/indexeddb'
import { BRAND } from '../lib/brand'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

export const Route = createFileRoute('/')({ component: LoginPage })

function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
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
      const deviceId = getOrCreateDeviceId()

      await tenantContextStore.put({
        tenantId: data.tenantId,
        tenantSlug: data.tenantSlug,
        tenantName: data.tenantName,
        deviceId,
        accountId: data.accountId,
        role: data.role,
        updatedAt: Date.now(),
      })

      const roleRoutes: Record<string, string> = {
        terminal: `/tenant/${data.tenantId}/terminal`,
        gate: `/tenant/${data.tenantId}/gate`,
        kiosk: `/tenant/${data.tenantId}/kiosk`,
        scout: `/tenant/${data.tenantId}/scout`,
        station: `/tenant/${data.tenantId}/station`,
        admin: `/tenant/${data.tenantId}/admin`,
      }

      navigate({ to: roleRoutes[data.role] ?? '/' })
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-signal-disable">
      {/* Brand header */}
      <div className="bg-brand text-white text-center py-10 px-4">
        <p className="type-h3 text-white">{BRAND.APP_NAME}</p>
        <p className="type-body1 text-white/70 mt-1">{BRAND.BYLINE}</p>
      </div>

      {/* Login card */}
      <div className="flex-1 flex items-start justify-center p-6 -mt-6">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-5">
          <div>
            <h1 className="type-h5 text-foreground">Masuk</h1>
            <p className="type-body2 text-signal-text-secondary mt-0.5">Masuk ke perangkat terminal Anda</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="type-body1-bold">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="h-11 focus:border-brand focus:ring-brand"
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
                className="h-11 focus:border-brand focus:ring-brand"
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
              className="w-full h-12 bg-brand hover:bg-brand/90 text-white type-title-bold"
            >
              {loading ? 'Memuat...' : 'Masuk'}
            </Button>
          </form>

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
