/**
 * Tenant branding injection component.
 * Requirement 1.5 — Dynamic CSS variables based on tenant branding.
 *
 * Injects CSS custom properties at the root level:
 * - --tenant-primary-color: Hex color from tenant branding
 * - --tenant-logo-url: URL string for the tenant logo
 * - --tenant-display-name: Display name for the tenant
 *
 * Usage: Place <TenantBranding /> in the root layout to apply
 * tenant-specific theming across the entire app.
 */

import type { TenantContext } from '#/lib/tenant-context.ts'

interface TenantBrandingProps {
  tenant: TenantContext | null
}

/**
 * Generates a <style> block with CSS custom properties for tenant branding.
 * Falls back to sensible defaults when no tenant or branding is configured.
 */
export function TenantBranding({ tenant }: TenantBrandingProps) {
  const primaryColor = tenant?.branding?.primaryColor ?? '#2563eb'
  const logoUrl = tenant?.branding?.logoUrl ?? ''
  const displayName =
    tenant?.branding?.displayName ?? tenant?.name ?? 'MBC System'

  // Escape CSS string values to prevent injection
  const escapedLogoUrl = logoUrl.replace(/["\\]/g, '\\$&')
  const escapedDisplayName = displayName.replace(/["\\]/g, '\\$&')

  const cssVars = `:root {
  --tenant-primary-color: ${primaryColor};
  --tenant-logo-url: url("${escapedLogoUrl}");
  --tenant-display-name: "${escapedDisplayName}";
}`

  return <style dangerouslySetInnerHTML={{ __html: cssVars }} />
}

/**
 * React hook to access tenant branding CSS variable values.
 * Useful when you need branding values in JS rather than CSS.
 */
export function useTenantBranding(tenant: TenantContext | null) {
  return {
    primaryColor: tenant?.branding?.primaryColor ?? '#2563eb',
    logoUrl: tenant?.branding?.logoUrl ?? null,
    displayName:
      tenant?.branding?.displayName ?? tenant?.name ?? 'MBC System',
  }
}
