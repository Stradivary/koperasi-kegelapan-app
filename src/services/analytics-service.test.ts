import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  computeDailyAggregate,
  getRevenueReport,
  getUsageStatistics,
  getMemberActivity,
  getTerminalMetrics,
  getDashboardSummary,
} from './analytics-service.ts'

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

/**
 * Creates a mock Drizzle database for analytics service tests.
 * Supports select chains with where/orderBy/limit/desc patterns,
 * insert with returning, and update with returning.
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
      const fromMock = vi.fn().mockImplementation(() => {
        const chainObj = {
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockImplementation(() => ({
              then: (resolve: (v: unknown) => void) => resolve(results),
            })),
            orderBy: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockResolvedValue(results),
              then: (resolve: (v: unknown) => void) => resolve(results),
            })),
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
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(results),
          }),
        }),
      }
    }),
  }

  return db as unknown as Parameters<typeof computeDailyAggregate>[2]
}

// ─── Sample data ─────────────────────────────────────────────────────────────

const tenantId = '123e4567-e89b-12d3-a456-426614174000'
const terminalId = 'term-uuid-001'

const sampleTransactions = [
  {
    id: 'tx-1',
    tenantId,
    memberId: 'MBC-0001',
    terminalId,
    type: 'CHECKIN',
    amount: 0,
    balanceBefore: 10000,
    balanceAfter: 10000,
    topUpSource: null,
    entryTime: null,
    exitTime: null,
    durationHours: null,
    syncedAt: new Date(),
    occurredAt: new Date('2024-06-15T08:00:00Z'),
    terminalType: 'gate',
    isSimulated: false,
  },
  {
    id: 'tx-2',
    tenantId,
    memberId: 'MBC-0001',
    terminalId,
    type: 'EXIT',
    amount: -4000,
    balanceBefore: 10000,
    balanceAfter: 6000,
    topUpSource: null,
    entryTime: new Date('2024-06-15T08:00:00Z'),
    exitTime: new Date('2024-06-15T10:00:00Z'),
    durationHours: 2,
    syncedAt: new Date(),
    occurredAt: new Date('2024-06-15T10:00:00Z'),
    terminalType: 'terminal',
    isSimulated: false,
  },
  {
    id: 'tx-3',
    tenantId,
    memberId: 'MBC-0002',
    terminalId,
    type: 'TOPUP',
    amount: 50000,
    balanceBefore: 0,
    balanceAfter: 50000,
    topUpSource: 'cash',
    entryTime: null,
    exitTime: null,
    durationHours: null,
    syncedAt: new Date(),
    occurredAt: new Date('2024-06-15T09:00:00Z'),
    terminalType: 'station',
    isSimulated: false,
  },
]

const sampleDailyAggregate = {
  id: 'agg-uuid-001',
  tenantId,
  date: '2024-06-15',
  totalCheckIns: 10,
  totalCheckOuts: 8,
  totalTopUps: 5,
  totalRevenue: 40000,
  totalTopUpAmount: 250000,
  uniqueMembers: 7,
  avgDurationHours: 2.5,
  computedAt: new Date(),
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('computeDailyAggregate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes aggregates from transactions and inserts new record', async () => {
    const expectedAggregate = {
      id: 'new-agg-id',
      tenantId,
      date: '2024-06-15',
      totalCheckIns: 1,
      totalCheckOuts: 1,
      totalTopUps: 1,
      totalRevenue: 4000,
      totalTopUpAmount: 50000,
      uniqueMembers: 2,
      avgDurationHours: 2,
      computedAt: new Date(),
    }

    const mockDb = createMockDb({
      selectResults: [
        sampleTransactions, // transactions query
        [],                  // no existing aggregate
      ],
      insertReturning: [
        [expectedAggregate],
      ],
    })

    const result = await computeDailyAggregate(tenantId, '2024-06-15', mockDb)

    expect(result.totalCheckIns).toBe(1)
    expect(result.totalCheckOuts).toBe(1)
    expect(result.totalTopUps).toBe(1)
    expect(result.totalRevenue).toBe(4000)
    expect(result.totalTopUpAmount).toBe(50000)
    expect(result.uniqueMembers).toBe(2)
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })

  it('updates existing aggregate record', async () => {
    const updatedAggregate = { ...sampleDailyAggregate, totalCheckIns: 1 }

    const mockDb = createMockDb({
      selectResults: [
        sampleTransactions,                // transactions query
        [{ id: sampleDailyAggregate.id }], // existing aggregate found
      ],
      updateReturning: [
        [updatedAggregate],
      ],
    })

    const result = await computeDailyAggregate(tenantId, '2024-06-15', mockDb)

    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(result.id).toBe(sampleDailyAggregate.id)
  })

  it('handles no transactions for the day', async () => {
    const emptyAggregate = {
      id: 'new-agg-id',
      tenantId,
      date: '2024-06-16',
      totalCheckIns: 0,
      totalCheckOuts: 0,
      totalTopUps: 0,
      totalRevenue: 0,
      totalTopUpAmount: 0,
      uniqueMembers: 0,
      avgDurationHours: 0,
      computedAt: new Date(),
    }

    const mockDb = createMockDb({
      selectResults: [
        [], // no transactions
        [], // no existing aggregate
      ],
      insertReturning: [
        [emptyAggregate],
      ],
    })

    const result = await computeDailyAggregate(tenantId, '2024-06-16', mockDb)

    expect(result.totalCheckIns).toBe(0)
    expect(result.totalRevenue).toBe(0)
    expect(result.uniqueMembers).toBe(0)
  })
})

describe('getRevenueReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns daily revenue breakdown and totals', async () => {
    const day1 = { ...sampleDailyAggregate, date: '2024-06-15', totalRevenue: 40000, totalTopUpAmount: 250000 }
    const day2 = { ...sampleDailyAggregate, date: '2024-06-16', totalRevenue: 30000, totalTopUpAmount: 100000 }

    const mockDb = createMockDb({
      selectResults: [[day1, day2]],
    })

    const result = await getRevenueReport(
      tenantId,
      { startDate: '2024-06-15', endDate: '2024-06-16' },
      mockDb,
    )

    expect(result.dailyRevenue).toHaveLength(2)
    expect(result.totalRevenue).toBe(70000)
    expect(result.totalTopUpAmount).toBe(350000)
    expect(result.dailyRevenue[0]!.date).toBe('2024-06-15')
    expect(result.dailyRevenue[0]!.revenue).toBe(40000)
  })

  it('returns empty report when no data', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    const result = await getRevenueReport(
      tenantId,
      { startDate: '2024-06-15', endDate: '2024-06-16' },
      mockDb,
    )

    expect(result.dailyRevenue).toEqual([])
    expect(result.totalRevenue).toBe(0)
    expect(result.totalTopUpAmount).toBe(0)
  })
})

describe('getUsageStatistics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns aggregated usage statistics', async () => {
    const mockDb = createMockDb({
      selectResults: [[sampleDailyAggregate]],
    })

    const result = await getUsageStatistics(
      tenantId,
      { startDate: '2024-06-15', endDate: '2024-06-15' },
      mockDb,
    )

    expect(result.totalCheckIns).toBe(10)
    expect(result.totalCheckOuts).toBe(8)
    expect(result.totalTopUps).toBe(5)
    expect(result.activeMembers).toBe(7)
    expect(result.avgDurationHours).toBe(2.5)
  })

  it('returns zeros when no data', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    const result = await getUsageStatistics(
      tenantId,
      { startDate: '2024-06-15', endDate: '2024-06-15' },
      mockDb,
    )

    expect(result.totalCheckIns).toBe(0)
    expect(result.activeMembers).toBe(0)
    expect(result.avgDurationHours).toBe(0)
  })
})

describe('getMemberActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns member transaction history and computed metrics', async () => {
    const memberTxs = [
      sampleTransactions[0]!, // CHECKIN
      sampleTransactions[1]!, // EXIT -4000, 2h duration
    ]

    const mockDb = createMockDb({
      selectResults: [memberTxs],
    })

    const result = await getMemberActivity(
      tenantId,
      'MBC-0001',
      { startDate: '2024-06-15', endDate: '2024-06-15' },
      mockDb,
    )

    expect(result.memberId).toBe('MBC-0001')
    expect(result.transactions).toHaveLength(2)
    expect(result.totalSpending).toBe(4000)
    expect(result.visitCount).toBe(1)
    expect(result.avgDurationHours).toBe(2)
  })

  it('returns empty activity when no transactions', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    const result = await getMemberActivity(
      tenantId,
      'MBC-9999',
      { startDate: '2024-06-15', endDate: '2024-06-15' },
      mockDb,
    )

    expect(result.transactions).toEqual([])
    expect(result.totalSpending).toBe(0)
    expect(result.visitCount).toBe(0)
    expect(result.avgDurationHours).toBe(0)
  })
})

describe('getTerminalMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns terminal metrics with throughput', async () => {
    const terminalRow = {
      id: terminalId,
      tenantId,
      name: 'Gate A',
      type: 'gate',
      location: 'Main Entrance',
      status: 'active',
      lastHeartbeat: new Date('2024-06-15T12:00:00Z'),
      registeredAt: new Date('2024-01-01'),
      registeredBy: 'admin-001',
    }

    const mockDb = createMockDb({
      selectResults: [
        [terminalRow],                                    // terminal lookup
        [{ id: 'tx-1' }, { id: 'tx-2' }, { id: 'tx-3' }], // transaction count
      ],
    })

    const result = await getTerminalMetrics(
      tenantId,
      terminalId,
      { startDate: '2024-06-15', endDate: '2024-06-15' },
      mockDb,
    )

    expect(result.terminalId).toBe(terminalId)
    expect(result.terminalName).toBe('Gate A')
    expect(result.totalTransactions).toBe(3)
    expect(result.transactionsPerDay).toBe(3)
    expect(result.status).toBe('active')
  })

  it('throws when terminal not found', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    await expect(
      getTerminalMetrics(
        tenantId,
        'nonexistent',
        { startDate: '2024-06-15', endDate: '2024-06-15' },
        mockDb,
      ),
    ).rejects.toThrow('not found for tenant')
  })
})

describe('getDashboardSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns complete dashboard summary', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [sampleDailyAggregate],                          // today's aggregate
        [{ count: 3 }],                                   // pending applications
        [{ status: 'active' }, { status: 'active' }, { status: 'inactive' }], // terminals
        [{ id: 'tx-1', type: 'CHECKIN', amount: 0, memberId: 'MBC-0001', occurredAt: new Date() }], // recent txs
      ],
    })

    const result = await getDashboardSummary(tenantId, mockDb)

    expect(result.todayRevenue).toBe(40000)
    expect(result.activeCheckIns).toBe(2) // 10 check-ins - 8 check-outs
    expect(result.pendingApplications).toBe(3)
    expect(result.terminalHealth.total).toBe(3)
    expect(result.terminalHealth.active).toBe(2)
    expect(result.terminalHealth.inactive).toBe(1)
    expect(result.recentTransactions).toHaveLength(1)
  })

  it('returns zeros when no data exists', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [],           // no aggregate for today
        [{ count: 0 }], // no pending applications
        [],           // no terminals
        [],           // no recent transactions
      ],
    })

    const result = await getDashboardSummary(tenantId, mockDb)

    expect(result.todayRevenue).toBe(0)
    expect(result.activeCheckIns).toBe(0)
    expect(result.pendingApplications).toBe(0)
    expect(result.terminalHealth.total).toBe(0)
    expect(result.recentTransactions).toEqual([])
  })
})
