/**
 * Admin — Tenant Configuration Page
 *
 * Manage tariff rates, branding, and encryption key rotation.
 * Accessible to tenant_admin and super_admin only.
 *
 * Requirements: 1.4, 7.4
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import { AdminLayout } from '#/components/admin/index.ts'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'

export const Route = createFileRoute('/admin/config')({
  component: TenantConfigPage,
})

function TenantConfigPage() {
  // Tariff config
  const [tariffRate, setTariffRate] = useState('2000')
  const [maxBalance, setMaxBalance] = useState('10000000')
  const [minBalance, setMinBalance] = useState('2000')

  // Branding config
  const [primaryColor, setPrimaryColor] = useState('#2563eb')
  const [displayName, setDisplayName] = useState('Koperasi Desa A')
  const [logoUrl, setLogoUrl] = useState('')

  // Key rotation
  const [keyVersion, setKeyVersion] = useState(1)
  const [keyStatus, setKeyStatus] = useState<'active' | 'rotating'>('active')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSaveConfig = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSaving(true)
      setSaved(false)

      try {
        // TODO: Call updateTenantConfig server function
        await new Promise((resolve) => setTimeout(resolve, 500))
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } finally {
        setSaving(false)
      }
    },
    [tariffRate, maxBalance, minBalance, primaryColor, displayName, logoUrl],
  )

  const handleRotateKey = useCallback(async () => {
    // TODO: Call rotateTenantEncryptionKey server function
    setKeyStatus('rotating')
    setKeyVersion((v) => v + 1)
  }, [])

  return (
    <AdminLayout activePage="tenant-config">
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Tenant Configuration</h2>

        {/* Tariff Configuration */}
        <form
          onSubmit={handleSaveConfig}
          className="rounded-lg border border-border bg-card p-6"
          aria-label="Tariff and branding configuration"
        >
          <h3 className="mb-4 text-lg font-semibold">Tariff Settings</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="cfg-tariff" className="mb-1">
                Tariff Rate (Rp/hour)
              </Label>
              <Input
                id="cfg-tariff"
                type="number"
                min="1"
                value={tariffRate}
                onChange={(e) => setTariffRate(e.target.value)}
                aria-label="Tariff rate per hour in Rupiah"
                aria-describedby="cfg-tariff-desc"
                className="min-h-[48px]"
              />
              <p
                id="cfg-tariff-desc"
                className="mt-1 text-xs text-muted-foreground"
              >
                Must be a positive integer
              </p>
            </div>
            <div>
              <Label htmlFor="cfg-maxbal" className="mb-1">
                Max Balance (Rp)
              </Label>
              <Input
                id="cfg-maxbal"
                type="number"
                min="100000"
                max="100000000"
                value={maxBalance}
                onChange={(e) => setMaxBalance(e.target.value)}
                aria-label="Maximum card balance"
                aria-describedby="cfg-maxbal-desc"
                className="min-h-[48px]"
              />
              <p
                id="cfg-maxbal-desc"
                className="mt-1 text-xs text-muted-foreground"
              >
                Between 100,000 and 100,000,000
              </p>
            </div>
            <div>
              <Label htmlFor="cfg-minbal" className="mb-1">
                Min Balance for Entry (Rp)
              </Label>
              <Input
                id="cfg-minbal"
                type="number"
                min="1"
                value={minBalance}
                onChange={(e) => setMinBalance(e.target.value)}
                aria-label="Minimum balance required for entry"
                aria-describedby="cfg-minbal-desc"
                className="min-h-[48px]"
              />
              <p
                id="cfg-minbal-desc"
                className="mt-1 text-xs text-muted-foreground"
              >
                Must be ≥ tariff rate
              </p>
            </div>
          </div>

          <h3 className="mb-4 mt-8 text-lg font-semibold">Branding</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="cfg-color" className="mb-1">
                Primary Color
              </Label>
              <div className="flex gap-2">
                <Input
                  id="cfg-color"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  aria-label="Primary brand color"
                  className="min-h-[48px] w-16"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  aria-label="Primary color hex value"
                  className="min-h-[48px] flex-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="cfg-name" className="mb-1">
                Display Name
              </Label>
              <Input
                id="cfg-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                aria-label="Tenant display name"
                className="min-h-[48px]"
              />
            </div>
            <div>
              <Label htmlFor="cfg-logo" className="mb-1">
                Logo URL
              </Label>
              <Input
                id="cfg-logo"
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
                aria-label="Tenant logo URL"
                className="min-h-[48px]"
              />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <Button
              type="submit"
              disabled={saving}
              aria-label="Save configuration"
              className="min-h-[48px]"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
            {saved && (
              <span
                className="text-sm text-emerald-600"
                role="status"
                aria-live="polite"
              >
                ✓ Configuration saved
              </span>
            )}
          </div>
        </form>

        {/* Encryption Key Management */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Encryption Keys</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Current Key Version: {keyVersion}</p>
                <p className="text-sm text-muted-foreground">
                  Status:{' '}
                  <span
                    className={
                      keyStatus === 'active'
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }
                  >
                    {keyStatus}
                  </span>
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleRotateKey}
                disabled={keyStatus === 'rotating'}
                aria-label="Rotate encryption key"
                className="min-h-[48px]"
              >
                {keyStatus === 'rotating'
                  ? 'Rotation in Progress'
                  : 'Rotate Key'}
              </Button>
            </div>
            {keyStatus === 'rotating' && (
              <div
                className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                role="alert"
              >
                Key rotation is in progress. Both old and new keys are
                accepted during the migration window. Terminals will
                automatically adopt the new key.
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
