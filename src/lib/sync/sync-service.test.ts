/**
 * Tests for Background Sync Service (Task 7.2)
 * Covers: batch sending, exponential backoff, conflict handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  syncPendingTransactions,
  calculateBackoffDelay,
  getSyncableCount,
  MAX_BATCH_SIZE,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
} from './sync-service.ts'
import {
  openDatabase,
  addPendingTransaction,
  getAllPendingTransactions,
} from './indexed-db.ts'
import type { PendingTransaction } from './types.ts'
import { DB_NAME } from './types.ts'

function makePendingTx(
  overrides: Partial<Omit<PendingTransaction, 'id'>> = {},
): Omit<PendingTransaction, 'id'> {
  return {
    tenantId: 'KOP-001',
    memberId: 'MBC-8829',
    terminalId: 'TERM-001',
    terminalType: 'gate',
    transaction: {
      type: 'CHECKIN',
      amount: 0,
      balanceBefore: 50000,
      balanceAfter: 50000,
      occurredAt: 1700000000,
    },
    queuedAt: Date.now(),
    status: 'pending',
    retryCount: 0,
    lastError: null,
    ...overrides,
  }
}

function mockFetch(
  status: number,
  body: unknown = {},
): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as typeof fetch
}

describe('calculateBackoffDelay', () => {
  it('returns 1s for retry 0', () => {
    expect(calculateBackoffDelay(0)).toBe(1000)
  })

  it('returns 2s for retry 1', () => {
    expect(calculateBackoffDelay(1)).toBe(2000)
  })

  it('returns 4s for retry 2', () => {
    expect(calculateBackoffDelay(2)).toBe(4000)
  })

  it('returns 8s for retry 3', () => {
    expect(calculateBackoffDelay(3)).toBe(8000)
  })

  it('returns 16s for retry 4', () => {
    expect(calculateBackoffDelay(4)).toBe(16000)
  })

  it('returns 32s for retry 5', () => {
    expect(calculateBackoffDelay(5)).toBe(32000)
  })

  it('returns 64s for retry 6', () => {
    expect(calculateBackoffDelay(6)).toBe(64000)
  })

  it('returns 128s for retry 7', () => {
    expect(calculateBackoffDelay(7)).toBe(128000)
  })

  it('returns 256s for retry 8', () => {
    expect(calculateBackoffDelay(8)).toBe(256000)
  })

  it('caps at 300s (5 min) for retry 9+', () => {
    // 2^9 * 1000 = 512000 > 300000, so capped
    expect(calculateBackoffDelay(9)).toBe(300000)
    expect(calculateBackoffDelay(10)).toBe(300000)
    expect(calculateBackoffDelay(20)).toBe(300000)
  })
})

describe('syncPendingTransactions (7.2)', () => {
  let db: IDBDatabase

  beforeEach(async () => {
    db = await openDatabase(indexedDB)
  })

  afterEach(() => {
    db.close()
    indexedDB.deleteDatabase(DB_NAME)
  })

  it('returns zero counts when no pending transactions', async () => {
    const result = await syncPendingTransactions({
      db,
      fetchFn: mockFetch(200),
    })

    expect(result.synced).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.conflicts).toBe(0)
  })

  it('syncs pending transactions and removes them on success', async () => {
    await addPendingTransaction(db, makePendingTx())
    await addPendingTransaction(db, makePendingTx({ memberId: 'MBC-0002' }))

    const fetchFn = mockFetch(200)
    const result = await syncPendingTransactions({ db, fetchFn })

    expect(result.synced).toBe(2)
    expect(result.failed).toBe(0)

    const remaining = await getAllPendingTransactions(db)
    expect(remaining).toHaveLength(0)
  })

  it('sends transactions as POST with correct payload shape', async () => {
    await addPendingTransaction(db, makePendingTx())

    const fetchFn = mockFetch(200)
    await syncPendingTransactions({ db, fetchFn })

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, options] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/transactions/sync')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' })

    const body = JSON.parse(options.body as string) as { transactions: unknown[] }
    expect(body.transactions).toHaveLength(1)
  })

  it('marks transactions as failed on server error', async () => {
    await addPendingTransaction(db, makePendingTx())

    const fetchFn = mockFetch(500, 'Internal Server Error')
    const result = await syncPendingTransactions({ db, fetchFn })

    expect(result.failed).toBe(1)
    expect(result.synced).toBe(0)

    const remaining = await getAllPendingTransactions(db)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].status).toBe('failed')
    expect(remaining[0].retryCount).toBe(1)
    expect(remaining[0].lastError).toContain('500')
  })

  it('marks transactions as failed on network error', async () => {
    await addPendingTransaction(db, makePendingTx())

    const fetchFn = vi.fn().mockRejectedValue(
      new Error('Network error'),
    ) as unknown as typeof fetch
    const result = await syncPendingTransactions({ db, fetchFn })

    expect(result.failed).toBe(1)

    const remaining = await getAllPendingTransactions(db)
    expect(remaining[0].status).toBe('failed')
    expect(remaining[0].lastError).toBe('Network error')
  })

  it('handles 409 conflict by marking conflicted transactions', async () => {
    await addPendingTransaction(db, makePendingTx())
    await addPendingTransaction(db, makePendingTx({ memberId: 'MBC-0002' }))

    // Server says index 0 is a conflict, index 1 is fine
    const fetchFn = mockFetch(409, { conflicts: [0] })
    const result = await syncPendingTransactions({ db, fetchFn })

    expect(result.conflicts).toBe(1)
    expect(result.synced).toBe(1)

    const remaining = await getAllPendingTransactions(db)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].status).toBe('conflict')
    expect(remaining[0].lastError).toContain('duplicate')
  })

  it('batches transactions in groups of MAX_BATCH_SIZE', async () => {
    // Add 60 transactions (should be 2 batches: 50 + 10)
    for (let i = 0; i < 60; i++) {
      await addPendingTransaction(
        db,
        makePendingTx({ memberId: `MBC-${String(i).padStart(4, '0')}` }),
      )
    }

    const fetchFn = mockFetch(200)
    const result = await syncPendingTransactions({ db, fetchFn })

    expect(result.synced).toBe(60)
    expect(fetchFn).toHaveBeenCalledTimes(2)

    // First batch should have 50 transactions
    const firstCall = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const firstBody = JSON.parse(firstCall[1].body as string) as { transactions: unknown[] }
    expect(firstBody.transactions).toHaveLength(MAX_BATCH_SIZE)

    // Second batch should have 10 transactions
    const secondCall = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit]
    const secondBody = JSON.parse(secondCall[1].body as string) as { transactions: unknown[] }
    expect(secondBody.transactions).toHaveLength(10)
  })

  it('calls onSyncAttempt callback with result', async () => {
    await addPendingTransaction(db, makePendingTx())

    const onSyncAttempt = vi.fn()
    await syncPendingTransactions({
      db,
      fetchFn: mockFetch(200),
      onSyncAttempt,
    })

    expect(onSyncAttempt).toHaveBeenCalledWith({
      synced: 1,
      failed: 0,
      conflicts: 0,
    })
  })

  it('uses custom endpoint when provided', async () => {
    await addPendingTransaction(db, makePendingTx())

    const fetchFn = mockFetch(200)
    await syncPendingTransactions({
      db,
      fetchFn,
      endpoint: '/custom/sync',
    })

    const [url] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/custom/sync')
  })
})

describe('getSyncableCount', () => {
  let db: IDBDatabase

  beforeEach(async () => {
    db = await openDatabase(indexedDB)
  })

  afterEach(() => {
    db.close()
    indexedDB.deleteDatabase(DB_NAME)
  })

  it('counts pending and failed transactions', async () => {
    await addPendingTransaction(db, makePendingTx({ status: 'pending' }))
    await addPendingTransaction(db, makePendingTx({ status: 'failed' }))
    await addPendingTransaction(db, makePendingTx({ status: 'conflict' }))

    const count = await getSyncableCount(db)
    expect(count).toBe(2) // pending + failed, not conflict
  })
})
