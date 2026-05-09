import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createEncryptionKey,
  getActiveEncryptionKey,
  rotateTenantEncryptionKey,
  retireExpiredKeys,
  getKeyMaterialForTerminal,
  getEncryptionKeysPublicInfo,
} from './encryption-key-service.ts'

// ─── Mock crypto.subtle for Node.js test environment ─────────────────────────

vi.stubGlobal('crypto', {
  subtle: {
    generateKey: vi.fn().mockResolvedValue({} as CryptoKey),
    exportKey: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
  },
})

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

/**
 * Creates a mock Drizzle database that simulates the chained query API.
 * Supports select, insert, and update chains matching the patterns used
 * in the encryption key service.
 */
/**
 * Creates a thenable chain object that resolves to results when awaited,
 * and also supports further chaining (.where, .limit, .orderBy, etc.).
 */
function createChain(results: Record<string, unknown>[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    where: vi.fn().mockImplementation(() => createChain(results)),
    orderBy: vi.fn().mockImplementation(() => createChain(results)),
    limit: vi.fn().mockImplementation(() => createChain(results)),
    offset: vi.fn().mockImplementation(() => createChain(results)),
    then: (resolve: (v: unknown) => void) => resolve(results),
  }
  return chain
}

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
      return {
        from: vi.fn().mockImplementation(() => createChain(results)),
      }
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

  return db as unknown as Parameters<typeof createEncryptionKey>[1]
}

// ─── Sample data ─────────────────────────────────────────────────────────────

const tenantId = '123e4567-e89b-12d3-a456-426614174000'
const terminalId = 'term-uuid-001'

const sampleActiveKey = {
  id: 'key-uuid-001',
  tenantId,
  keyMaterial: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  version: 1,
  status: 'active' as const,
  activatedAt: new Date('2024-01-01'),
  retiredAt: null,
  migrationDeadline: null,
}

const sampleRotatingKey = {
  id: 'key-uuid-002',
  tenantId,
  keyMaterial: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
  version: 2,
  status: 'rotating' as const,
  activatedAt: new Date('2024-02-01'),
  retiredAt: null,
  migrationDeadline: new Date('2024-03-01'),
}

const sampleTerminal = {
  id: terminalId,
  tenantId,
  name: 'Gate 1',
  type: 'gate' as const,
  location: 'Main entrance',
  status: 'active' as const,
  lastHeartbeat: null,
  registeredAt: new Date('2024-01-01'),
  registeredBy: 'admin-001',
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createEncryptionKey (4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a new encryption key with version 1 for a tenant with no existing keys', async () => {
    const newKey = { ...sampleActiveKey }
    const mockDb = createMockDb({
      selectResults: [
        [], // no existing keys — version query returns empty
      ],
      insertReturning: [
        [newKey],
      ],
    })

    const result = await createEncryptionKey(tenantId, mockDb)

    expect(result.id).toBe('key-uuid-001')
    expect(result.tenantId).toBe(tenantId)
    expect(result.version).toBe(1)
    expect(result.status).toBe('active')
    expect(result.keyMaterial).toBeTruthy()
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })

  it('increments version number based on existing keys', async () => {
    const newKey = { ...sampleActiveKey, version: 3 }
    const mockDb = createMockDb({
      selectResults: [
        [{ version: 2 }], // latest version is 2
      ],
      insertReturning: [
        [newKey],
      ],
    })

    const result = await createEncryptionKey(tenantId, mockDb)

    expect(result.version).toBe(3)
  })

  it('throws when insert fails', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
      insertReturning: [[]],
    })

    await expect(createEncryptionKey(tenantId, mockDb)).rejects.toThrow(
      'Failed to create encryption key',
    )
  })
})

describe('getActiveEncryptionKey (4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the active key for a tenant', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleActiveKey]],
    })

    const result = await getActiveEncryptionKey(tenantId, mockDb)

    expect(result).toEqual(sampleActiveKey)
  })

  it('returns null when no active key exists', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    const result = await getActiveEncryptionKey(tenantId, mockDb)

    expect(result).toBeNull()
  })
})

describe('rotateTenantEncryptionKey (4.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a new rotating key and keeps old key active', async () => {
    const newRotatingKey = {
      ...sampleRotatingKey,
      id: 'key-uuid-new',
      version: 2,
    }
    const mockDb = createMockDb({
      selectResults: [
        [sampleActiveKey], // getActiveEncryptionKey
        [{ version: 1 }], // latest version query
      ],
      insertReturning: [
        [newRotatingKey], // new rotating key
      ],
      updateReturning: [
        [], // update old key's migration deadline
        [], // update tenant's encryptionKeyId
      ],
    })

    const result = await rotateTenantEncryptionKey(tenantId, mockDb)

    expect(result.newKey.id).toBe('key-uuid-new')
    expect(result.newKey.status).toBe('rotating')
    expect(result.migrationDeadline).toBeInstanceOf(Date)
    // keyMaterial should NOT be in the public info
    expect((result.newKey as Record<string, unknown>).keyMaterial).toBeUndefined()
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(mockDb.update).toHaveBeenCalledTimes(2)
  })

  it('sets migration deadline to 30 days by default', async () => {
    const now = new Date()
    const newRotatingKey = { ...sampleRotatingKey }
    const mockDb = createMockDb({
      selectResults: [
        [sampleActiveKey],
        [{ version: 1 }],
      ],
      insertReturning: [[newRotatingKey]],
      updateReturning: [[], []],
    })

    const result = await rotateTenantEncryptionKey(tenantId, mockDb)

    const expectedDeadline = new Date(now)
    expectedDeadline.setDate(expectedDeadline.getDate() + 30)
    // Allow 5 seconds tolerance for test execution time
    const diff = Math.abs(
      result.migrationDeadline.getTime() - expectedDeadline.getTime(),
    )
    expect(diff).toBeLessThan(5000)
  })

  it('supports custom migration window', async () => {
    const now = new Date()
    const newRotatingKey = { ...sampleRotatingKey }
    const mockDb = createMockDb({
      selectResults: [
        [sampleActiveKey],
        [{ version: 1 }],
      ],
      insertReturning: [[newRotatingKey]],
      updateReturning: [[], []],
    })

    const result = await rotateTenantEncryptionKey(tenantId, mockDb, 7)

    const expectedDeadline = new Date(now)
    expectedDeadline.setDate(expectedDeadline.getDate() + 7)
    const diff = Math.abs(
      result.migrationDeadline.getTime() - expectedDeadline.getTime(),
    )
    expect(diff).toBeLessThan(5000)
  })

  it('throws when no active key exists', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [], // no active key
      ],
    })

    await expect(
      rotateTenantEncryptionKey(tenantId, mockDb),
    ).rejects.toThrow(`No active encryption key found for tenant "${tenantId}"`)
  })

  it('throws when insert fails', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [sampleActiveKey],
        [{ version: 1 }],
      ],
      insertReturning: [[]],
    })

    await expect(
      rotateTenantEncryptionKey(tenantId, mockDb),
    ).rejects.toThrow('Failed to create rotating encryption key')
  })
})

describe('retireExpiredKeys (4.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retires active key and promotes rotating key when deadline has passed', async () => {
    const pastDeadline = new Date('2024-02-15')
    const rotatingKeyPastDeadline = {
      ...sampleRotatingKey,
      migrationDeadline: new Date('2024-02-01'),
    }
    const now = new Date('2024-03-01')

    const mockDb = createMockDb({
      selectResults: [
        [rotatingKeyPastDeadline], // find rotating keys
        [sampleActiveKey],         // find active key for same tenant
      ],
      updateReturning: [
        [], // retire old key
        [], // promote rotating key
      ],
    })

    const results = await retireExpiredKeys(mockDb, now)

    expect(results).toHaveLength(1)
    expect(results[0]!.retiredKeyId).toBe(sampleActiveKey.id)
    expect(results[0]!.promotedKeyId).toBe(sampleRotatingKey.id)
    expect(results[0]!.retiredAt).toEqual(now)
    expect(mockDb.update).toHaveBeenCalledTimes(2)
  })

  it('skips rotating keys whose deadline has not passed', async () => {
    const futureDeadline = new Date('2025-01-01')
    const rotatingKeyFutureDeadline = {
      ...sampleRotatingKey,
      migrationDeadline: futureDeadline,
    }
    const now = new Date('2024-06-01')

    const mockDb = createMockDb({
      selectResults: [
        [rotatingKeyFutureDeadline], // find rotating keys
      ],
    })

    const results = await retireExpiredKeys(mockDb, now)

    expect(results).toHaveLength(0)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('skips rotating keys with no migration deadline', async () => {
    const rotatingKeyNoDeadline = {
      ...sampleRotatingKey,
      migrationDeadline: null,
    }

    const mockDb = createMockDb({
      selectResults: [
        [rotatingKeyNoDeadline],
      ],
    })

    const results = await retireExpiredKeys(mockDb)

    expect(results).toHaveLength(0)
  })

  it('returns empty array when no rotating keys exist', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [], // no rotating keys
      ],
    })

    const results = await retireExpiredKeys(mockDb)

    expect(results).toHaveLength(0)
  })

  it('skips when no active key found for the tenant', async () => {
    const rotatingKeyPastDeadline = {
      ...sampleRotatingKey,
      migrationDeadline: new Date('2024-01-01'),
    }
    const now = new Date('2024-03-01')

    const mockDb = createMockDb({
      selectResults: [
        [rotatingKeyPastDeadline], // find rotating keys
        [],                        // no active key found
      ],
    })

    const results = await retireExpiredKeys(mockDb, now)

    expect(results).toHaveLength(0)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})

describe('getKeyMaterialForTerminal (4.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns active key material for an authorized terminal', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [sampleTerminal],  // terminal authorization check
        [sampleActiveKey], // active key
        [],                // no rotating key
      ],
    })

    const result = await getKeyMaterialForTerminal(tenantId, terminalId, mockDb)

    expect(result.activeKey).toBe(sampleActiveKey.keyMaterial)
    expect(result.rotatingKey).toBeNull()
  })

  it('returns both active and rotating key material during rotation', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [sampleTerminal],    // terminal authorization check
        [sampleActiveKey],   // active key
        [sampleRotatingKey], // rotating key
      ],
    })

    const result = await getKeyMaterialForTerminal(tenantId, terminalId, mockDb)

    expect(result.activeKey).toBe(sampleActiveKey.keyMaterial)
    expect(result.rotatingKey).toBe(sampleRotatingKey.keyMaterial)
  })

  it('throws when terminal is not found', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [], // terminal not found
      ],
    })

    await expect(
      getKeyMaterialForTerminal(tenantId, 'unknown-terminal', mockDb),
    ).rejects.toThrow('Terminal not authorized')
  })

  it('throws when no active key exists for the tenant', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [sampleTerminal], // terminal found
        [],               // no active key
      ],
    })

    await expect(
      getKeyMaterialForTerminal(tenantId, terminalId, mockDb),
    ).rejects.toThrow(`No active encryption key found for tenant "${tenantId}"`)
  })
})

describe('getEncryptionKeysPublicInfo (4.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns key info without keyMaterial', async () => {
    const publicFields = {
      id: sampleActiveKey.id,
      tenantId: sampleActiveKey.tenantId,
      version: sampleActiveKey.version,
      status: sampleActiveKey.status,
      activatedAt: sampleActiveKey.activatedAt,
      retiredAt: sampleActiveKey.retiredAt,
      migrationDeadline: sampleActiveKey.migrationDeadline,
    }
    const mockDb = createMockDb({
      selectResults: [[publicFields]],
    })

    const result = await getEncryptionKeysPublicInfo(tenantId, mockDb)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(publicFields)
    // Ensure keyMaterial is not present
    expect((result[0] as Record<string, unknown>).keyMaterial).toBeUndefined()
  })

  it('returns empty array when no keys exist', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    const result = await getEncryptionKeysPublicInfo(tenantId, mockDb)

    expect(result).toHaveLength(0)
  })
})
