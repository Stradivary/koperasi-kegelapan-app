/**
 * Tests for Offline Tenant Config Cache (Task 7.5)
 * Covers: get/set, server refresh, fallback to cache, connectivity listener
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { createConfigCache } from './config-cache.ts'
import { openDatabase, setCachedTenantConfig } from './indexed-db.ts'
import type { CachedTenantConfig } from './types.ts'
import { DB_NAME } from './types.ts'

const TENANT_ID = 'KOP-001'

function makeServerConfig() {
  return {
    tariffRatePerHour: 2000,
    maxBalance: 10_000_000,
    minBalanceForEntry: 2000,
    encryptionKeyMaterial: 'base64-key-material',
    encryptionKeyVersion: 1,
    branding: {
      primaryColor: '#1a73e8',
      logoUrl: null as string | null,
      displayName: 'Koperasi A',
    },
  }
}

function makeCachedConfig(
  overrides: Partial<CachedTenantConfig> = {},
): CachedTenantConfig {
  return {
    tenantId: TENANT_ID,
    tariffRatePerHour: 2000,
    maxBalance: 10_000_000,
    minBalanceForEntry: 2000,
    encryptionKeyMaterial: 'base64-key-material',
    encryptionKeyVersion: 1,
    branding: {
      primaryColor: '#1a73e8',
      logoUrl: null,
      displayName: 'Koperasi A',
    },
    cachedAt: Date.now(),
    ...overrides,
  }
}

function mockFetch(status: number, body: unknown = {}): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as typeof fetch
}

describe('ConfigCache (7.5)', () => {
  let db: IDBDatabase

  beforeEach(async () => {
    db = await openDatabase(indexedDB)
  })

  afterEach(() => {
    db.close()
    indexedDB.deleteDatabase(DB_NAME)
  })

  // ─── Basic get/set ──────────────────────────────────────────────────────

  it('returns undefined when no config is cached', async () => {
    const cache = createConfigCache({ db, tenantId: TENANT_ID })
    const config = await cache.getConfig()
    expect(config).toBeUndefined()
  })

  it('stores and retrieves config', async () => {
    const cache = createConfigCache({ db, tenantId: TENANT_ID })
    const config = makeCachedConfig()

    await cache.setConfig(config)
    const retrieved = await cache.getConfig()

    expect(retrieved).toBeDefined()
    expect(retrieved!.tenantId).toBe(TENANT_ID)
    expect(retrieved!.tariffRatePerHour).toBe(2000)
    expect(retrieved!.branding.displayName).toBe('Koperasi A')
  })

  it('clears cached config', async () => {
    const cache = createConfigCache({ db, tenantId: TENANT_ID })
    await cache.setConfig(makeCachedConfig())

    await cache.clearConfig()

    const result = await cache.getConfig()
    expect(result).toBeUndefined()
  })

  // ─── Server Refresh ─────────────────────────────────────────────────────

  it('refreshFromServer fetches and caches config', async () => {
    const fetchFn = mockFetch(200, makeServerConfig())
    const cache = createConfigCache({
      db,
      tenantId: TENANT_ID,
      fetchFn,
    })

    const config = await cache.refreshFromServer()

    expect(config).toBeDefined()
    expect(config!.tenantId).toBe(TENANT_ID)
    expect(config!.tariffRatePerHour).toBe(2000)
    expect(config!.cachedAt).toBeGreaterThan(0)

    // Verify it was persisted
    const persisted = await cache.getConfig()
    expect(persisted).toBeDefined()
    expect(persisted!.tariffRatePerHour).toBe(2000)
  })

  it('refreshFromServer calls correct endpoint', async () => {
    const fetchFn = mockFetch(200, makeServerConfig())
    const cache = createConfigCache({
      db,
      tenantId: TENANT_ID,
      fetchFn,
    })

    await cache.refreshFromServer()

    expect(fetchFn).toHaveBeenCalledWith(`/api/tenants/${TENANT_ID}/config`)
  })

  it('refreshFromServer uses custom endpoint', async () => {
    const fetchFn = mockFetch(200, makeServerConfig())
    const cache = createConfigCache({
      db,
      tenantId: TENANT_ID,
      fetchFn,
      endpoint: '/custom/api',
    })

    await cache.refreshFromServer()

    expect(fetchFn).toHaveBeenCalledWith(`/custom/api/${TENANT_ID}/config`)
  })

  it('refreshFromServer falls back to cache on server error', async () => {
    const cache = createConfigCache({
      db,
      tenantId: TENANT_ID,
      fetchFn: mockFetch(500),
    })

    // Pre-populate cache
    await cache.setConfig(makeCachedConfig({ tariffRatePerHour: 3000 }))

    const config = await cache.refreshFromServer()

    expect(config).toBeDefined()
    expect(config!.tariffRatePerHour).toBe(3000)
  })

  it('refreshFromServer falls back to cache on network error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(
      new Error('Network error'),
    ) as unknown as typeof fetch

    const cache = createConfigCache({
      db,
      tenantId: TENANT_ID,
      fetchFn,
    })

    await cache.setConfig(makeCachedConfig({ tariffRatePerHour: 4000 }))

    const config = await cache.refreshFromServer()

    expect(config).toBeDefined()
    expect(config!.tariffRatePerHour).toBe(4000)
  })

  it('refreshFromServer calls onRefresh callback on success', async () => {
    const onRefresh = vi.fn()
    const cache = createConfigCache({
      db,
      tenantId: TENANT_ID,
      fetchFn: mockFetch(200, makeServerConfig()),
      onRefresh,
    })

    await cache.refreshFromServer()

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onRefresh.mock.calls[0][0].tenantId).toBe(TENANT_ID)
  })

  it('refreshFromServer does not call onRefresh on failure', async () => {
    const onRefresh = vi.fn()
    const cache = createConfigCache({
      db,
      tenantId: TENANT_ID,
      fetchFn: mockFetch(500),
      onRefresh,
    })

    await cache.refreshFromServer()

    expect(onRefresh).not.toHaveBeenCalled()
  })

  // ─── getOrRefresh ───────────────────────────────────────────────────────

  it('getOrRefresh returns cached config when offline', async () => {
    // Simulate offline
    vi.stubGlobal('navigator', { onLine: false })

    const cache = createConfigCache({
      db,
      tenantId: TENANT_ID,
      fetchFn: mockFetch(200, makeServerConfig()),
    })

    await cache.setConfig(makeCachedConfig({ tariffRatePerHour: 5000 }))

    const config = await cache.getOrRefresh()

    expect(config).toBeDefined()
    expect(config!.tariffRatePerHour).toBe(5000)

    vi.unstubAllGlobals()
  })

  it('getOrRefresh fetches from server when online', async () => {
    vi.stubGlobal('navigator', { onLine: true })

    const fetchFn = mockFetch(200, makeServerConfig())
    const cache = createConfigCache({
      db,
      tenantId: TENANT_ID,
      fetchFn,
    })

    const config = await cache.getOrRefresh()

    expect(fetchFn).toHaveBeenCalled()
    expect(config).toBeDefined()
    expect(config!.tariffRatePerHour).toBe(2000)

    vi.unstubAllGlobals()
  })

  // ─── Connectivity Listener ──────────────────────────────────────────────

  it('startConnectivityListener registers online event handler', () => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
    const fakeWindow = {
      addEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        listeners[event] = listeners[event] ?? []
        listeners[event].push(handler)
      }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('window', fakeWindow)

    const cache = createConfigCache({
      db,
      tenantId: TENANT_ID,
      fetchFn: mockFetch(200, makeServerConfig()),
    })

    const cleanup = cache.startConnectivityListener()

    expect(fakeWindow.addEventListener).toHaveBeenCalledWith('online', expect.any(Function))

    cleanup()
    vi.unstubAllGlobals()
  })

  it('cleanup removes the online event handler', () => {
    const fakeWindow = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('window', fakeWindow)

    const cache = createConfigCache({
      db,
      tenantId: TENANT_ID,
      fetchFn: mockFetch(200, makeServerConfig()),
    })

    const cleanup = cache.startConnectivityListener()
    cleanup()

    expect(fakeWindow.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function))
    vi.unstubAllGlobals()
  })

  it('online event triggers refreshFromServer', async () => {
    let onlineHandler: (() => void) | null = null
    const fakeWindow = {
      addEventListener: vi.fn((_event: string, handler: () => void) => {
        onlineHandler = handler
      }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('window', fakeWindow)

    const fetchFn = mockFetch(200, makeServerConfig())
    const cache = createConfigCache({
      db,
      tenantId: TENANT_ID,
      fetchFn,
    })

    cache.startConnectivityListener()

    // Simulate coming online by calling the registered handler
    expect(onlineHandler).not.toBeNull()
    onlineHandler!()

    // Give the async refresh a tick to execute
    await new Promise((r) => setTimeout(r, 10))

    expect(fetchFn).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
