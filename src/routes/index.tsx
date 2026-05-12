import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { tenantContextStore } from '../lib/indexeddb'
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

      if (!res.ok) { setError('Invalid credentials'); return }

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
        admin: `/tenant/${data.tenantId}/admin`,
        station: `/tenant/${data.tenantId}/admin`,
      }

      navigate({ to: roleRoutes[data.role] ?? '/' })
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Koperasi Wallet</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your terminal</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
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
