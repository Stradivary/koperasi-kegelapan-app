/**
 * Tenant config resolution with KV caching and D1 (PostgreSQL) fallback.
 * Requirement 1.3 — Resolve tenant from KV cache or DB on cache miss.
 *
 * Flow:
 * 1. Check KV cache for tenant config by slug
 * 2. On cache miss, query PostgreSQL via Drizzle for tenant by slug
 * 3. Cache the result in KV with 5-minute TTL
 * 4. Return null if tenant not found
 */

import { eq } from 'drizzle-orm'
import { tenants } from '#/db/schema.ts'
import type { KVCache } from './kv-cache.ts'
import { tenantCacheKey, TENANT_CACHE_TTL } from './kv-cache.ts'
import type { TenantContext } from './tenant-context.ts'
import type { db as DbType } from '#/db/index.ts'

/**
 * Resolve tenant configuration by slug.
 *
 * @param slug - The tenant slug extracted from the request
 * @param kvCache - KV cache instance (may be null if KV is not available)
 * @param database - Drizzle database instance
 * @returns TenantContext if found, null otherwise
 */
export async function resolveTenantBySlug(
  slug: string,
  kvCache: KVCache | null,
  database: typeof DbType,
): Promise<TenantContext | null> {
  const cacheKey = tenantCacheKey(slug)

  // 1. Try KV cache first
  if (kvCache) {
    const cached = await kvCache.get<TenantContext>(cacheKey)
    if (cached) {
      return cached
    }
  }

  // 2. Query database on cache miss
  const [tenant] = await database
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1)

  if (!tenant) {
    return null
  }

  // 3. Build tenant context
  const tenantContext: TenantContext = {
    tenantId: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    tariffRatePerHour: tenant.tariffRatePerHour,
    maxBalance: tenant.maxBalance,
    minBalanceForEntry: tenant.minBalanceForEntry,
    branding: tenant.branding ?? null,
    status: tenant.status,
  }

  // 4. Cache in KV with TTL
  if (kvCache) {
    await kvCache.put(cacheKey, tenantContext, TENANT_CACHE_TTL)
  }

  return tenantContext
}
