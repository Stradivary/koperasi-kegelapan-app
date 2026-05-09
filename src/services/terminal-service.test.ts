import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  registerTerminal,
  authorizeTerminal,
  heartbeat,
  decommissionTerminal,
  listTerminals,
  generateTerminalToken,
} from './terminal-service.ts'

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

function createMockDb(options: {
  selectResults?: Record<string, unknown>[][]
  insertReturning?: Record<string, unknown>[][]
  updateReturning?: Record<string, unknown>[][]
  updateVoid?: boolean
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
      const fromMock = vi.fn().mockImplementation(() => {
        const chainObj = {
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockImplementation(() => ({
              then: (resolve: (v: unknown) => void) => resolve(results),
            })),
            orderBy: vi.fn().mockResolvedValue(results),
            then: (resolve: (v: unknown) => void) => resolve(results),
          })),
          orderBy: vi.fn().mockResolvedValue(results),
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
          where: vi.fn().mockImplementation(() => ({
            returning: vi.fn().mockResolvedValue(results),
            then: (resolve: (v: unknown) => void) => resolve(undefined),
          })),
        }),
      }
    }),
  }

  return db as unknown as Parameters<typeof registerTerminal>[2]
}

// ─── Sample data ─────────────────────────────────────────────────────────────

const tenantId = '123e4567-e89b-12d3-a456-426614174000'
const terminalId = 'term-uuid-001'
const adminId = 'admin-uuid-001'

const sampleTerminalRow = {
  id: terminalId,
  tenantId,
  name: 'Gate A',
  type: 'gate' as const,
  location: 'Main Entrance',
  status: 'active' as const,
  lastHeartbeat: null,
  registeredAt: new Date('2024-01-01'),
  registeredBy: adminId,
}

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: vi.fn().mockReturnValue('mock-uuid-token'),
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('generateTerminalToken', () => {
  it('returns a UUID string', () => {
    const token = generateTerminalToken()
    expect(typeof token).toBe('string')
    expect(token).toBe('mock-uuid-token')
  })
})

describe('registerTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a terminal with active status', async () => {
    const mockDb = createMockDb({
      insertReturning: [[sampleTerminalRow]],
    })

    const result = await registerTerminal(
      { tenantId, name: 'Gate A', type: 'gate', location: 'Main Entrance' },
      adminId,
      mockDb,
    )

    expect(result.name).toBe('Gate A')
    expect(result.type).toBe('gate')
    expect(result.status).toBe('active')
    expect(result.tenantId).toBe(tenantId)
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })

  it('creates a terminal without location', async () => {
    const terminalNoLocation = { ...sampleTerminalRow, location: null }
    const mockDb = createMockDb({
      insertReturning: [[terminalNoLocation]],
    })

    const result = await registerTerminal(
      { tenantId, name: 'Gate B', type: 'terminal' },
      adminId,
      mockDb,
    )

    expect(result.location).toBeNull()
  })

  it('supports all terminal types', async () => {
    for (const type of ['gate', 'terminal', 'station', 'scout'] as const) {
      const mockDb = createMockDb({
        insertReturning: [[{ ...sampleTerminalRow, type }]],
      })

      const result = await registerTerminal(
        { tenantId, name: `Terminal ${type}`, type },
        adminId,
        mockDb,
      )

      expect(result.type).toBe(type)
    }
  })

  it('throws on invalid input', async () => {
    const mockDb = createMockDb()

    await expect(
      registerTerminal(
        { tenantId: 'not-a-uuid', name: '', type: 'gate' },
        adminId,
        mockDb,
      ),
    ).rejects.toThrow()
  })
})

describe('authorizeTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns auth info for valid active terminal', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleTerminalRow]],
    })

    const result = await authorizeTerminal(tenantId, terminalId, mockDb)

    expect(result.terminalId).toBe(terminalId)
    expect(result.tenantId).toBe(tenantId)
    expect(result.type).toBe('gate')
    expect(result.token).toBe('mock-uuid-token')
  })

  it('throws when terminal not found', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    await expect(
      authorizeTerminal(tenantId, 'nonexistent', mockDb),
    ).rejects.toThrow('Terminal "nonexistent" not found')
  })

  it('throws when terminal belongs to different tenant', async () => {
    const mockDb = createMockDb({
      selectResults: [[{ ...sampleTerminalRow, tenantId: 'other-tenant-id' }]],
    })

    await expect(
      authorizeTerminal(tenantId, terminalId, mockDb),
    ).rejects.toThrow('does not belong to tenant')
  })

  it('throws when terminal is inactive', async () => {
    const mockDb = createMockDb({
      selectResults: [[{ ...sampleTerminalRow, status: 'inactive' }]],
    })

    await expect(
      authorizeTerminal(tenantId, terminalId, mockDb),
    ).rejects.toThrow('is not active')
  })
})

describe('heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates lastHeartbeat for active terminal', async () => {
    const mockDb = createMockDb({
      selectResults: [[{ id: terminalId, status: 'active' }]],
    })

    await expect(heartbeat(terminalId, mockDb)).resolves.toBeUndefined()
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  it('throws when terminal not found', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    await expect(
      heartbeat('nonexistent', mockDb),
    ).rejects.toThrow('Terminal "nonexistent" not found')
  })

  it('throws when terminal is not active', async () => {
    const mockDb = createMockDb({
      selectResults: [[{ id: terminalId, status: 'inactive' }]],
    })

    await expect(
      heartbeat(terminalId, mockDb),
    ).rejects.toThrow('is not active')
  })
})

describe('decommissionTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets terminal status to inactive', async () => {
    const decommissioned = { ...sampleTerminalRow, status: 'inactive' as const }
    const mockDb = createMockDb({
      selectResults: [[sampleTerminalRow]],
      updateReturning: [[decommissioned]],
    })

    const result = await decommissionTerminal(tenantId, terminalId, mockDb)

    expect(result.status).toBe('inactive')
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  it('throws when terminal not found for tenant', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    await expect(
      decommissionTerminal(tenantId, 'nonexistent', mockDb),
    ).rejects.toThrow('not found for tenant')
  })
})

describe('listTerminals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all terminals for a tenant', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleTerminalRow, { ...sampleTerminalRow, id: 'term-002', name: 'Gate B' }]],
    })

    const result = await listTerminals(tenantId, {}, mockDb)

    expect(result).toHaveLength(2)
  })

  it('returns empty array when no terminals exist', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    const result = await listTerminals(tenantId, {}, mockDb)

    expect(result).toEqual([])
  })

  it('supports filtering by type', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleTerminalRow]],
    })

    const result = await listTerminals(tenantId, { type: 'gate' }, mockDb)

    expect(result).toHaveLength(1)
  })

  it('supports filtering by status', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleTerminalRow]],
    })

    const result = await listTerminals(tenantId, { status: 'active' }, mockDb)

    expect(result).toHaveLength(1)
  })

  it('supports filtering by both type and status', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleTerminalRow]],
    })

    const result = await listTerminals(tenantId, { type: 'gate', status: 'active' }, mockDb)

    expect(result).toHaveLength(1)
  })
})
