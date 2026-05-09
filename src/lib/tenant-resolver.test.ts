import { describe, it, expect, vi } from 'vitest'
import { resolveTenantBySlug } from './tenant-resolver.ts'
import type { KVCache } from './kv-cache.ts'
import type { TenantContext } from './tenant-context.ts'

// Mock the database module
vi.mock('#/db/schema.ts', () => ({
  tenants: { slug: 'slug' },
}))

const sampleTenant: TenantContext = {
  tenantId: '123e4567-e89b-12d3-a456-426614174000',
  slug: 'koperasi-a',
  name: 'Koperasi A',
  tariffRatePerHour: 2000,
  maxBalance: 10_000_000,
  minBalanceForEntry: 2000,
  branding: {
    primaryColor: '#ff0000',
    logoUrl: 'https://example.com/logo.png',
    displayName: 'Koperasi A',
  },
  status: 'active',
}

function createMockKVCache(data: Record<string, unknown> = {}): KVCache {
  const store = new Map(Object.entries(data))
  return {
    get: vi.fn(async (key: string) => {
      return store.get(key) ?? null
    }) as KVCache['get'],
    put: vi.fn(async <T>(key: string, value: T) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
  }
}

function createMockDb(tenantRow: Record<string, unknown> | null) {
  const mockLimit = vi.fn().mockResolvedValue(tenantRow ? [tenantRow] : [])
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

  return {
    select: mockSelect,
  } as unknown as Parameters<typeof resolveTenantBySlug>[2]
}

describe('resolveTenantBySlug', () => {
  it('returns cached tenant from KV on cache hit', async () => {
    const kvCache = createMockKVCache({
      'tenant:config:koperasi-a': sampleTenant,
    })
    const mockDb = createMockDb(null)

    const result = await resolveTenantBySlug('koperasi-a', kvCache, mockDb)

    expect(result).toEqual(sampleTenant)
    expect(kvCache.get).toHaveBeenCalledWith('tenant:config:koperasi-a')
    // DB should not be queried on cache hit
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('queries DB on cache miss and caches the result', async () => {
    const kvCache = createMockKVCache()
    const dbRow = {
      id: sampleTenant.tenantId,
      slug: 'koperasi-a',
      name: 'Koperasi A',
      tariffRatePerHour: 2000,
      maxBalance: 10_000_000,
      minBalanceForEntry: 2000,
      branding: sampleTenant.branding,
      status: 'active' as const,
    }
    const mockDb = createMockDb(dbRow)

    const result = await resolveTenantBySlug('koperasi-a', kvCache, mockDb)

    expect(result).toEqual(sampleTenant)
    expect(kvCache.put).toHaveBeenCalledWith(
      'tenant:config:koperasi-a',
      sampleTenant,
      300,
    )
  })

  it('returns null when tenant not found in DB', async () => {
    const kvCache = createMockKVCache()
    const mockDb = createMockDb(null)

    const result = await resolveTenantBySlug('nonexistent', kvCache, mockDb)

    expect(result).toBeNull()
    expect(kvCache.put).not.toHaveBeenCalled()
  })

  it('works without KV cache (null kvCache)', async () => {
    const dbRow = {
      id: sampleTenant.tenantId,
      slug: 'koperasi-a',
      name: 'Koperasi A',
      tariffRatePerHour: 2000,
      maxBalance: 10_000_000,
      minBalanceForEntry: 2000,
      branding: sampleTenant.branding,
      status: 'active' as const,
    }
    const mockDb = createMockDb(dbRow)

    const result = await resolveTenantBySlug('koperasi-a', null, mockDb)

    expect(result).toEqual(sampleTenant)
  })

  it('handles tenant with null branding', async () => {
    const kvCache = createMockKVCache()
    const dbRow = {
      id: '123',
      slug: 'koperasi-b',
      name: 'Koperasi B',
      tariffRatePerHour: 3000,
      maxBalance: 5_000_000,
      minBalanceForEntry: 3000,
      branding: null,
      status: 'active' as const,
    }
    const mockDb = createMockDb(dbRow)

    const result = await resolveTenantBySlug('koperasi-b', kvCache, mockDb)

    expect(result).toEqual({
      tenantId: '123',
      slug: 'koperasi-b',
      name: 'Koperasi B',
      tariffRatePerHour: 3000,
      maxBalance: 5_000_000,
      minBalanceForEntry: 3000,
      branding: null,
      status: 'active',
    })
  })
})
