import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createTenant,
  updateTenantConfig,
  listTenants,
  getTenantBySlug,
  generateEncryptionKeyMaterial,
} from './tenant-service.ts'
import type { KVCache } from '#/lib/kv-cache.ts'

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

/**
 * Creates a mock Drizzle database that simulates the chained query API.
 * Each method can be configured with custom behavior.
 */
function createMockDb(options: {
  selectResults?: Record<string, unknown>[][]
  insertReturning?: Record<string, unknown>[][]
  updateReturning?: Record<string, unknown>[][]
} = {}) {
  let selectCallIndex = 0
  let insertCallIndex = 0
  let updateCallIndex = 0

  const selectResults = options.selectResults ?? [[]]
  const insertReturning = options.insertReturning ?? [[]]
  const updateReturning = options.updateReturning ?? [[]]

  const db = {
    select: vi.fn().mockImplementation(() => {
      const idx = selectCallIndex++
      const results = selectResults[idx] ?? []
      // Build a mock that supports both query chain patterns:
      // 1. .from().where().limit() — used by single-record lookups
      // 2. .from().limit().offset().orderBy() — used by paginated list
      // 3. .from() resolving directly — used by count queries
      const fromMock = vi.fn().mockImplementation(() => {
        const chainObj = {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(results),
          }),
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(results),
            }),
          }),
          // For count queries: select({ count }).from(table) resolves directly
          then: (resolve: (v: unknown) => void) => resolve(results),
        }
        return chainObj
      })
      return { from: fromMock }
    }),
    insert: vi.fn().mockImplementation(() => {
      const idx = insertCallIndex++
      const results = insertReturning[idx] ?? []
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(results),
        }),
      }
    }),
    update: vi.fn().mockImplementation(() => {
      const idx = updateCallIndex++
      const results = updateReturning[idx] ?? []
      return {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(results),
          }),
        }),
      }
    }),
  }

  return db as unknown as Parameters<typeof createTenant>[1]
}

function createMockKVCache(): KVCache {
  return {
    get: vi.fn().mockResolvedValue(null) as KVCache['get'],
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

// ─── Sample data ─────────────────────────────────────────────────────────────

const sampleTenantRow = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  slug: 'koperasi-a',
  name: 'Koperasi A',
  encryptionKeyId: null,
  tariffRatePerHour: 2000,
  maxBalance: 10_000_000,
  minBalanceForEntry: 2000,
  branding: null,
  status: 'active' as const,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

const sampleEncryptionKeyRow = {
  id: 'key-uuid-001',
  tenantId: sampleTenantRow.id,
  keyMaterial: 'base64encodedkey==',
  version: 1,
  status: 'active' as const,
  activatedAt: new Date('2024-01-01'),
  retiredAt: null,
  migrationDeadline: null,
}

const sampleUpdatedTenantRow = {
  ...sampleTenantRow,
  encryptionKeyId: sampleEncryptionKeyRow.id,
}

// ─── Tests ───────────────────────────────────────────────────────────────────

// Mock crypto.subtle for Node.js test environment
vi.stubGlobal('crypto', {
  subtle: {
    generateKey: vi.fn().mockResolvedValue({} as CryptoKey),
    exportKey: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
  },
})

describe('generateEncryptionKeyMaterial', () => {
  it('returns a base64 string', async () => {
    const result = await generateEncryptionKeyMaterial()
    expect(typeof result).toBe('string')
    // base64 of 32 zero bytes
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('createTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a tenant with default config and encryption key', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [], // slug uniqueness check — no existing tenant
      ],
      insertReturning: [
        [sampleTenantRow], // tenant insert
        [sampleEncryptionKeyRow], // encryption key insert
      ],
      updateReturning: [
        [sampleUpdatedTenantRow], // update tenant with encryptionKeyId
      ],
    })

    const result = await createTenant(
      { slug: 'koperasi-a', name: 'Koperasi A' },
      mockDb,
    )

    expect(result.slug).toBe('koperasi-a')
    expect(result.name).toBe('Koperasi A')
    expect(result.encryptionKeyId).toBe('key-uuid-001')
    expect(mockDb.insert).toHaveBeenCalledTimes(2) // tenant + encryption key
    expect(mockDb.update).toHaveBeenCalledTimes(1) // update encryptionKeyId
  })

  it('throws when slug already exists', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [{ id: 'existing-id' }], // slug uniqueness check — found existing
      ],
    })

    await expect(
      createTenant({ slug: 'koperasi-a', name: 'Koperasi A' }, mockDb),
    ).rejects.toThrow('Tenant with slug "koperasi-a" already exists')
  })

  it('throws on invalid slug format', async () => {
    const mockDb = createMockDb()

    await expect(
      createTenant({ slug: 'INVALID', name: 'Test' }, mockDb),
    ).rejects.toThrow()
  })

  it('throws on slug too short', async () => {
    const mockDb = createMockDb()

    await expect(
      createTenant({ slug: 'ab', name: 'Test' }, mockDb),
    ).rejects.toThrow()
  })

  it('throws on slug with leading hyphen', async () => {
    const mockDb = createMockDb()

    await expect(
      createTenant({ slug: '-invalid', name: 'Test' }, mockDb),
    ).rejects.toThrow()
  })

  it('applies default values for optional fields', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
      insertReturning: [
        [{ ...sampleTenantRow, tariffRatePerHour: 2000, maxBalance: 10_000_000, minBalanceForEntry: 2000 }],
        [sampleEncryptionKeyRow],
      ],
      updateReturning: [[sampleUpdatedTenantRow]],
    })

    const result = await createTenant(
      { slug: 'koperasi-b', name: 'Koperasi B' },
      mockDb,
    )

    expect(result.tariffRatePerHour).toBe(2000)
    expect(result.maxBalance).toBe(10_000_000)
    expect(result.minBalanceForEntry).toBe(2000)
  })
})

describe('updateTenantConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates tariff rate and returns updated tenant', async () => {
    const updatedRow = { ...sampleTenantRow, tariffRatePerHour: 3000, minBalanceForEntry: 3000 }
    const mockDb = createMockDb({
      selectResults: [[sampleTenantRow]],
      updateReturning: [[updatedRow]],
    })

    const result = await updateTenantConfig(
      sampleTenantRow.id,
      { tariffRatePerHour: 3000, minBalanceForEntry: 3000 },
      mockDb,
    )

    expect(result.tariffRatePerHour).toBe(3000)
  })

  it('invalidates KV cache after update', async () => {
    const updatedRow = { ...sampleTenantRow, tariffRatePerHour: 3000, minBalanceForEntry: 3000 }
    const mockDb = createMockDb({
      selectResults: [[sampleTenantRow]],
      updateReturning: [[updatedRow]],
    })
    const kvCache = createMockKVCache()

    await updateTenantConfig(
      sampleTenantRow.id,
      { tariffRatePerHour: 3000, minBalanceForEntry: 3000 },
      mockDb,
      kvCache,
    )

    expect(kvCache.delete).toHaveBeenCalledWith(
      'tenant:config:koperasi-a',
    )
  })

  it('throws when tenant not found', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    await expect(
      updateTenantConfig('nonexistent-id', { tariffRatePerHour: 3000 }, mockDb),
    ).rejects.toThrow('Tenant with id "nonexistent-id" not found')
  })

  it('throws when tariff rate is not a positive integer', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleTenantRow]],
    })

    await expect(
      updateTenantConfig(sampleTenantRow.id, { tariffRatePerHour: -100 }, mockDb),
    ).rejects.toThrow('Tariff rate must be a positive integer')
  })

  it('throws when tariff rate is not an integer', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleTenantRow]],
    })

    await expect(
      updateTenantConfig(sampleTenantRow.id, { tariffRatePerHour: 1.5 }, mockDb),
    ).rejects.toThrow('Tariff rate must be a positive integer')
  })

  it('throws when maxBalance is out of range', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleTenantRow]],
    })

    await expect(
      updateTenantConfig(sampleTenantRow.id, { maxBalance: 50 }, mockDb),
    ).rejects.toThrow('Max balance must be between 100,000 and 100,000,000')
  })

  it('throws when minBalanceForEntry < tariffRatePerHour', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleTenantRow]], // tariffRatePerHour = 2000
    })

    await expect(
      updateTenantConfig(
        sampleTenantRow.id,
        { minBalanceForEntry: 1000 },
        mockDb,
      ),
    ).rejects.toThrow(
      'Minimum balance for entry must be >= tariff rate per hour',
    )
  })

  it('updates branding', async () => {
    const branding = {
      primaryColor: '#00ff00',
      logoUrl: 'https://example.com/logo.png',
      displayName: 'New Name',
    }
    const updatedRow = { ...sampleTenantRow, branding }
    const mockDb = createMockDb({
      selectResults: [[sampleTenantRow]],
      updateReturning: [[updatedRow]],
    })

    const result = await updateTenantConfig(
      sampleTenantRow.id,
      { branding },
      mockDb,
    )

    expect(result.branding).toEqual(branding)
  })

  it('skips KV invalidation when kvCache is null', async () => {
    const updatedRow = { ...sampleTenantRow, tariffRatePerHour: 3000, minBalanceForEntry: 3000 }
    const mockDb = createMockDb({
      selectResults: [[sampleTenantRow]],
      updateReturning: [[updatedRow]],
    })

    // Should not throw when kvCache is null
    const result = await updateTenantConfig(
      sampleTenantRow.id,
      { tariffRatePerHour: 3000, minBalanceForEntry: 3000 },
      mockDb,
      null,
    )

    expect(result.tariffRatePerHour).toBe(3000)
  })
})

describe('listTenants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns paginated tenants with total count', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [sampleTenantRow], // data query
        [{ count: 5 }],    // count query
      ],
    })

    const result = await listTenants(1, 10, mockDb)

    expect(result.data).toHaveLength(1)
    expect(result.total).toBe(5)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(10)
  })

  it('clamps page to minimum of 1', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [],
        [{ count: 0 }],
      ],
    })

    const result = await listTenants(-1, 10, mockDb)

    expect(result.page).toBe(1)
  })

  it('clamps pageSize to maximum of 100', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [],
        [{ count: 0 }],
      ],
    })

    const result = await listTenants(1, 200, mockDb)

    expect(result.pageSize).toBe(100)
  })

  it('clamps pageSize to minimum of 1', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [],
        [{ count: 0 }],
      ],
    })

    const result = await listTenants(1, 0, mockDb)

    expect(result.pageSize).toBe(1)
  })
})

describe('getTenantBySlug', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns tenant when found', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleTenantRow]],
    })

    const result = await getTenantBySlug('koperasi-a', mockDb)

    expect(result).toEqual(sampleTenantRow)
  })

  it('returns null when tenant not found', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    const result = await getTenantBySlug('nonexistent', mockDb)

    expect(result).toBeNull()
  })
})
