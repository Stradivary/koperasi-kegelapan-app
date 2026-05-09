/**
 * Tenant-aware request middleware for TanStack Start.
 * Requirement 1.3 — Extract tenant slug, resolve config, attach to request context.
 *
 * This middleware:
 * 1. Extracts tenant slug from subdomain or path prefix
 * 2. Resolves tenant config via KV cache (with DB fallback)
 * 3. Passes tenant context to downstream server functions and route loaders
 */

import { createMiddleware } from '@tanstack/react-start'
import { extractTenantSlug } from './tenant-context.ts'
import { resolveTenantBySlug } from './tenant-resolver.ts'
import { createKVCache } from './kv-cache.ts'
import type { CloudflareKVNamespace } from './kv-cache.ts'
import { db } from '#/db/index.ts'
import type { TenantContext } from './tenant-context.ts'

/**
 * Global request middleware that resolves tenant context on every request.
 *
 * The resolved tenant context (or null) is passed via `next({ context })`,
 * making it available to all downstream middleware and server functions.
 */
export const tenantMiddleware = createMiddleware().server(
  async ({ request, next }) => {
    const slug = extractTenantSlug(request)

    let tenant: TenantContext | null = null

    if (slug) {
      // Attempt to create KV cache from Cloudflare env bindings.
      // In local dev, KV may not be available — we gracefully fall back to DB-only.
      let kvCache = null
      try {
        // Access Cloudflare env bindings via the global context
        // In Workers runtime, `process.env` won't have KV bindings;
        // they're available on the env object passed to the fetch handler.
        // For now, we use DB-only resolution. KV integration will be
        // wired when the Worker env bindings are configured in wrangler.jsonc.
        const env = (globalThis as Record<string, unknown>).__env as
          | { TENANT_CONFIG_KV?: CloudflareKVNamespace }
          | undefined
        if (env?.TENANT_CONFIG_KV) {
          kvCache = createKVCache(env.TENANT_CONFIG_KV)
        }
      } catch {
        // KV not available — continue with DB-only resolution
      }

      tenant = await resolveTenantBySlug(slug, kvCache, db)
    }

    return next({
      context: {
        tenant,
      },
    })
  },
)
