/**
 * Cloudflare KV caching utilities for tenant configuration.
 * Requirement 1.3 — Tenant config cached in KV with 5-minute TTL.
 * Requirement 1.4 — KV cache invalidation on tenant config update.
 */

/**
 * Minimal Cloudflare KVNamespace interface.
 * Avoids a hard dependency on @cloudflare/workers-types.
 */
export interface CloudflareKVNamespace {
  get(key: string, type: 'text'): Promise<string | null>
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>
  delete(key: string): Promise<void>
}

/** 5-minute TTL in seconds for KV cache entries */
const TENANT_CACHE_TTL_SECONDS = 300

/** Prefix for tenant config KV keys */
const TENANT_KEY_PREFIX = 'tenant:config:'

/**
 * Build the KV key for a tenant config entry.
 */
export function tenantCacheKey(slug: string): string {
  return `${TENANT_KEY_PREFIX}${slug}`
}

/**
 * Type-safe wrapper around Cloudflare KV for tenant config caching.
 *
 * In Cloudflare Workers, KV is accessed via env bindings.
 * This wrapper provides get/put/delete with JSON serialization.
 */
export interface KVCache {
  get<T>(key: string): Promise<T | null>
  put<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
  delete(key: string): Promise<void>
}

/**
 * Create a KV cache wrapper from a Cloudflare KVNamespace binding.
 *
 * Usage in a Worker:
 *   const cache = createKVCache(env.TENANT_CONFIG_KV)
 */
export function createKVCache(kvNamespace: CloudflareKVNamespace): KVCache {
  return {
    async get<T>(key: string): Promise<T | null> {
      const value = await kvNamespace.get(key, 'text')
      if (value === null) {
        return null
      }
      try {
        return JSON.parse(value) as T
      } catch {
        return null
      }
    },

    async put<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      await kvNamespace.put(key, JSON.stringify(value), {
        expirationTtl: ttlSeconds ?? TENANT_CACHE_TTL_SECONDS,
      })
    },

    async delete(key: string): Promise<void> {
      await kvNamespace.delete(key)
    },
  }
}

/**
 * Default TTL exported for use in tenant resolution.
 */
export const TENANT_CACHE_TTL = TENANT_CACHE_TTL_SECONDS
