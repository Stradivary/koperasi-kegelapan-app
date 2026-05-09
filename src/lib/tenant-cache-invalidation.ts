/**
 * KV cache invalidation for tenant configuration.
 * Requirement 1.4 — Invalidate KV cache when tenant config is updated.
 *
 * Called by the tenant update service (Task 3) after persisting changes.
 */

import type { KVCache } from './kv-cache.ts'
import { tenantCacheKey } from './kv-cache.ts'

/**
 * Invalidate the KV cache entry for a tenant by slug.
 * This should be called whenever a tenant's configuration is updated
 * (tariff rate, branding, min balance, etc.).
 *
 * @param slug - The tenant slug whose cache entry should be deleted
 * @param kvCache - KV cache instance
 */
export async function invalidateTenantCache(
  slug: string,
  kvCache: KVCache,
): Promise<void> {
  const key = tenantCacheKey(slug)
  await kvCache.delete(key)
}
