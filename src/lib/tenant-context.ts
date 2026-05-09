/**
 * Tenant context extraction and resolution.
 * Requirement 1.3 — Tenant-Aware Routing
 *
 * Extracts tenant slug from:
 * 1. Subdomain (e.g., "koperasi-a" from "koperasi-a.mbc.id")
 * 2. Path prefix fallback (e.g., "/t/koperasi-a/...")
 */

/**
 * Extract tenant slug from the request hostname (subdomain).
 * Returns null if no subdomain is found or the host is localhost/IP.
 */
export function extractTenantSlugFromHostname(
  hostname: string,
): string | null {
  // Strip port if present
  const host = hostname.split(':')[0]!

  // Skip extraction for localhost and IP addresses
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return null
  }

  const parts = host.split('.')

  // Need at least 3 parts for a subdomain (e.g., koperasi-a.mbc.id)
  if (parts.length < 3) {
    return null
  }

  const subdomain = parts[0]!

  // Ignore common non-tenant subdomains
  if (['www', 'api', 'admin'].includes(subdomain)) {
    return null
  }

  return subdomain
}

/**
 * Extract tenant slug from a path prefix pattern: /t/{slug}/...
 * Returns null if the path doesn't match the pattern.
 */
export function extractTenantSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/t\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/)
  return match?.[1] ?? null
}

/**
 * Extract tenant slug from a request, trying subdomain first, then path prefix.
 */
export function extractTenantSlug(request: Request): string | null {
  const url = new URL(request.url)

  // Try subdomain first
  const fromHostname = extractTenantSlugFromHostname(url.hostname)
  if (fromHostname) {
    return fromHostname
  }

  // Fall back to path prefix
  return extractTenantSlugFromPath(url.pathname)
}

/**
 * Tenant context shape attached to requests by the middleware.
 */
export interface TenantContext {
  tenantId: string
  slug: string
  name: string
  tariffRatePerHour: number
  maxBalance: number
  minBalanceForEntry: number
  branding: {
    primaryColor: string
    logoUrl: string | null
    displayName: string
  } | null
  status: 'active' | 'suspended' | 'deactivated'
}
