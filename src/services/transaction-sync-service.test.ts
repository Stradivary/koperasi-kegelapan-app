import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  syncTransactions,
  validateTransaction,
  isDuplicateTransaction,
} from './transaction-sync-service.ts'
import type { TransactionInput } from './transaction-sync-service.ts'

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

function createMockDb(options: {
  selectResults?: Record<string, unknown>[][]
  insertReturning?: Record<string, unknown>[][]
} = {}) {
  let selectCallIndex = 0
  let insertCallIndex = 0

  const selectResults = options.selectResults ?? [[]]
  const insertReturning = options.insertReturning ?? [[]]

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
            then: (resolve: (v: unknown) => void) => resolve(results),
          })),
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
  }

  return db as unknown as Parameters<typeof syncTransactions>[1]
}

// ─── Sample data ─────────────────────────────────────────────────────────────

const tenantId = '123e4567-e89b-12d3-a456-426614174000'
const terminalId = 'term-uuid-001'
const memberId = 'MBC-8829'

function makeTransaction(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    tenantId,
    memberId,
    terminalId,
    type: 'EXIT',
    amount: -2000,
    balanceBefore: 10000,
    balanceAfter: 8000,
    occurredAt: new Date('2024-06-15T10:00:00Z'),
    terminalType: 'terminal',
    ...overrides,
  }
}

const insertedRow = {
  id: 'tx-uuid-001',
  tenantId,
  memberId,
  terminalId,
  type: 'EXIT',
  amount: -2000,
  balanceBefore: 10000,
  balanceAfter: 8000,
  topUpSource: null,
  entryTime: null,
  exitTime: null,
  durationHours: null,
  syncedAt: new Date(),
  occurredAt: new Date('2024-06-15T10:00:00Z'),
  terminalType: 'terminal',
  isSimulated: false,
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('validateTransaction', () => {
  it('returns null for valid EXIT transaction', () => {
    const tx = makeTransaction({ type: 'EXIT', amount: -2000, balanceBefore: 10000, balanceAfter: 8000 })
    expect(validateTransaction(tx)).toBeNull()
  })

  it('returns null for valid TOPUP transaction', () => {
    const tx = makeTransaction({ type: 'TOPUP', amount: 5000, balanceBefore: 3000, balanceAfter: 8000 })
    expect(validateTransaction(tx)).toBeNull()
  })

  it('returns null for valid CHECKIN transaction', () => {
    const tx = makeTransaction({ type: 'CHECKIN', amount: 0, balanceBefore: 5000, balanceAfter: 5000 })
    expect(validateTransaction(tx)).toBeNull()
  })

  it('rejects EXIT with positive amount', () => {
    const tx = makeTransaction({ type: 'EXIT', amount: 2000, balanceBefore: 10000, balanceAfter: 12000 })
    expect(validateTransaction(tx)).toBe('EXIT transaction amount must be negative')
  })

  it('rejects EXIT with zero amount', () => {
    const tx = makeTransaction({ type: 'EXIT', amount: 0, balanceBefore: 10000, balanceAfter: 10000 })
    expect(validateTransaction(tx)).toBe('EXIT transaction amount must be negative')
  })

  it('rejects TOPUP with negative amount', () => {
    const tx = makeTransaction({ type: 'TOPUP', amount: -1000, balanceBefore: 5000, balanceAfter: 4000 })
    expect(validateTransaction(tx)).toBe('TOPUP transaction amount must be positive')
  })

  it('rejects TOPUP with zero amount', () => {
    const tx = makeTransaction({ type: 'TOPUP', amount: 0, balanceBefore: 5000, balanceAfter: 5000 })
    expect(validateTransaction(tx)).toBe('TOPUP transaction amount must be positive')
  })

  it('rejects CHECKIN with non-zero amount', () => {
    const tx = makeTransaction({ type: 'CHECKIN', amount: 100, balanceBefore: 5000, balanceAfter: 5100 })
    expect(validateTransaction(tx)).toBe('CHECKIN transaction amount must be 0')
  })

  it('rejects when balanceAfter != balanceBefore + amount', () => {
    const tx = makeTransaction({ type: 'EXIT', amount: -2000, balanceBefore: 10000, balanceAfter: 9000 })
    expect(validateTransaction(tx)).toContain('balanceAfter')
  })

  it('rejects when balanceAfter is negative', () => {
    const tx = makeTransaction({ type: 'EXIT', amount: -15000, balanceBefore: 10000, balanceAfter: -5000 })
    expect(validateTransaction(tx)).toBe('balanceAfter must be >= 0')
  })
})

describe('isDuplicateTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when duplicate exists', async () => {
    const mockDb = createMockDb({
      selectResults: [[{ id: 'existing-tx' }]],
    })

    const result = await isDuplicateTransaction(
      new Date('2024-06-15T10:00:00Z'),
      terminalId,
      mockDb,
    )

    expect(result).toBe(true)
  })

  it('returns false when no duplicate exists', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
    })

    const result = await isDuplicateTransaction(
      new Date('2024-06-15T10:00:00Z'),
      terminalId,
      mockDb,
    )

    expect(result).toBe(false)
  })
})

describe('syncTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('syncs valid transactions and returns correct counts', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [], // no duplicate for tx 1
        [], // no duplicate for tx 2
      ],
      insertReturning: [
        [insertedRow],
        [{ ...insertedRow, id: 'tx-uuid-002' }],
      ],
    })

    const batch = [
      makeTransaction(),
      makeTransaction({ occurredAt: new Date('2024-06-15T11:00:00Z') }),
    ]

    const result = await syncTransactions(batch, mockDb)

    expect(result.syncedCount).toBe(2)
    expect(result.rejectedCount).toBe(0)
    expect(result.conflictIndices).toEqual([])
    expect(result.validationErrors).toEqual([])
  })

  it('rejects transactions that fail validation', async () => {
    const mockDb = createMockDb()

    const batch = [
      makeTransaction({ type: 'EXIT', amount: 2000, balanceBefore: 10000, balanceAfter: 12000 }),
    ]

    const result = await syncTransactions(batch, mockDb)

    expect(result.syncedCount).toBe(0)
    expect(result.rejectedCount).toBe(1)
    expect(result.validationErrors).toHaveLength(1)
    expect(result.validationErrors[0]!.index).toBe(0)
  })

  it('detects duplicate transactions and returns conflict indices', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [{ id: 'existing-tx' }], // duplicate found
      ],
    })

    const batch = [makeTransaction()]

    const result = await syncTransactions(batch, mockDb)

    expect(result.syncedCount).toBe(0)
    expect(result.rejectedCount).toBe(1)
    expect(result.conflictIndices).toEqual([0])
  })

  it('handles mixed valid, invalid, and duplicate transactions', async () => {
    const mockDb = createMockDb({
      selectResults: [
        [],                        // no duplicate for tx at index 1 (index 0 fails validation)
        [{ id: 'existing-tx' }],   // duplicate for tx at index 2
      ],
      insertReturning: [
        [insertedRow], // tx at index 1 inserted
      ],
    })

    const batch = [
      makeTransaction({ type: 'EXIT', amount: 2000, balanceBefore: 10000, balanceAfter: 12000 }), // invalid
      makeTransaction({ occurredAt: new Date('2024-06-15T11:00:00Z') }), // valid
      makeTransaction({ occurredAt: new Date('2024-06-15T12:00:00Z') }), // duplicate
    ]

    const result = await syncTransactions(batch, mockDb)

    expect(result.syncedCount).toBe(1)
    expect(result.rejectedCount).toBe(2)
    expect(result.validationErrors).toHaveLength(1)
    expect(result.validationErrors[0]!.index).toBe(0)
    expect(result.conflictIndices).toEqual([2])
  })

  it('stores simulation-flagged transactions with isSimulated=true', async () => {
    const mockDb = createMockDb({
      selectResults: [[]],
      insertReturning: [[{ ...insertedRow, isSimulated: true }]],
    })

    const batch = [makeTransaction({ isSimulated: true })]

    const result = await syncTransactions(batch, mockDb)

    expect(result.syncedCount).toBe(1)
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })

  it('handles empty batch', async () => {
    const mockDb = createMockDb()

    const result = await syncTransactions([], mockDb)

    expect(result.syncedCount).toBe(0)
    expect(result.rejectedCount).toBe(0)
    expect(result.conflictIndices).toEqual([])
    expect(result.validationErrors).toEqual([])
  })
})
