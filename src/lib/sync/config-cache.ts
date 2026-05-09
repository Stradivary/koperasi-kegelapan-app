/**
 * Offline Tenant Config Cache
 *
 * Caches tenant configuration (tariff rates, encryption keys, branding)
 * in IndexedDB for offline operation. Refreshes from the server when
 * connectivity is restored.
 *
 * Requirements: 8.5
 */

import {
  getCachedTenantConfig,
  setCachedTenantConfig,
  removeCachedTenantConfig,
} from './indexed-db.ts'
import type { CachedTenantConfig } from './types.ts'

/** Default API endpoint for fetching tenant config */
export const CONFIG_ENDPOINT = '/api/tenants'

export interface ConfigCacheOptions {
  /** The IDBDatabase instance */
  db: IDBDatabase
  /** Tenant ID to cache config for */
  tenantId: string
  /** Function to perform HTTP GET (injectable for testing) */
  fetchFn?: typeof fetch
  /** API endpoint override */
  endpoint?: string
  /** Callback when config is refreshed from server */
  onRefresh?: (config: CachedTenantConfig) => void
}

/**
 * Creates a tenant config cache manager.
 * Handles get/set operations and connectivity-based refresh.
 */
export function createConfigCache(options: ConfigCacheOptions) {
  const {
    db,
    tenantId,
    fetchFn = fetch,
    endpoint = CONFIG_ENDPOINT,
    onRefresh,
  } = options

  let onlineHandler: (() => void) | null = null

  /**
   * Gets the cached tenant config from IndexedDB.
   * Returns undefined if no cached config exists.
   */
  async function getConfig(): Promise<CachedTenantConfig | undefined> {
    return getCachedTenantConfig(db, tenantId)
  }

  /**
   * Stores tenant config in IndexedDB cache.
   */
  async function setConfig(config: CachedTenantConfig): Promise<void> {
    await setCachedTenantConfig(db, config)
  }

  /**
   * Removes the cached config for this tenant.
   */
  async function clearConfig(): Promise<void> {
    await removeCachedTenantConfig(db, tenantId)
  }

  /**
   * Fetches fresh tenant config from the server and caches it.
   * Returns the fresh config on success, or the stale cached config on failure.
   */
  async function refreshFromServer(): Promise<CachedTenantConfig | undefined> {
    try {
      const response = await fetchFn(`${endpoint}/${tenantId}/config`)

      if (!response.ok) {
        // Server error — fall back to cached config
        return getConfig()
      }

      const serverConfig = (await response.json()) as {
        tariffRatePerHour: number
        maxBalance: number
        minBalanceForEntry: number
        encryptionKeyMaterial: string
        encryptionKeyVersion: number
        branding: {
          primaryColor: string
          logoUrl: string | null
          displayName: string
        }
      }

      const cached: CachedTenantConfig = {
        tenantId,
        tariffRatePerHour: serverConfig.tariffRatePerHour,
        maxBalance: serverConfig.maxBalance,
        minBalanceForEntry: serverConfig.minBalanceForEntry,
        encryptionKeyMaterial: serverConfig.encryptionKeyMaterial,
        encryptionKeyVersion: serverConfig.encryptionKeyVersion,
        branding: serverConfig.branding,
        cachedAt: Date.now(),
      }

      await setConfig(cached)
      onRefresh?.(cached)
      return cached
    } catch {
      // Network error — fall back to cached config
      return getConfig()
    }
  }

  /**
   * Gets config with a server refresh attempt.
   * If online, tries to fetch fresh config. Falls back to cache.
   */
  async function getOrRefresh(): Promise<CachedTenantConfig | undefined> {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      return refreshFromServer()
    }
    return getConfig()
  }

  /**
   * Starts listening for connectivity changes.
   * When the browser comes back online, automatically refreshes config.
   * Returns a cleanup function to stop listening.
   */
  function startConnectivityListener(): () => void {
    if (typeof window === 'undefined') {
      return () => {}
    }

    onlineHandler = () => {
      void refreshFromServer()
    }

    window.addEventListener('online', onlineHandler)

    return () => {
      if (onlineHandler) {
        window.removeEventListener('online', onlineHandler)
        onlineHandler = null
      }
    }
  }

  return {
    getConfig,
    setConfig,
    clearConfig,
    refreshFromServer,
    getOrRefresh,
    startConnectivityListener,
  }
}

export type ConfigCache = ReturnType<typeof createConfigCache>
