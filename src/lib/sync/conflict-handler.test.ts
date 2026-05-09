/**
 * Tests for Conflict Detection and Handling (Task 7.4)
 * Covers: marking conflicts, retrieving conflicts, resolving, duplicate detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  markAsConflict,
  getConflictedTransactions,
  resolveConflict,
  isDuplicateTransaction,
  parseConflictResponse,
} from './conflict-handler.ts'
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

describe('Conflict Handler (7.4)', () => {
  let db: IDBDatabase

  beforeEach(async () => {
    db = await openDatabase(indexedDB)
  })

  afterEach(() => {
    db.close()
    indexedDB.deleteDatabase(DB_NAME)
  })

  // ─── markAsConflict ─────────────────────────────────────────────────────

  it('marks a transaction as conflict status', async () => {
    const id = await addPendingTransaction(db, makePendingTx())

    const info = await markAsConflict(
      db,
      id,
      'duplicate timestamp+terminalId',
      'Transaction already exists',
    )

    expect(info.transactionId).toBe(id)
    expect(info.reason).toBe('duplicate timestamp+terminalId')
    expect(info.serverMessage).toBe('Transaction already exists')
    expect(info.detectedAt).toBeGreaterThan(0)

    const all = await getAllPendingTransactions(db)
    expect(all[0].status).toBe('conflict')
    expect(all[0].lastError).toContain('Conflict')
    expect(all[0].lastError).toContain('duplicate')
  })

  // ─── getConflictedTransactions ──────────────────────────────────────────

  it('retrieves only conflicted transactions', async () => {
    await addPendingTransaction(db, makePendingTx({ status: 'pending' }))
    await addPendingTransaction(db, makePendingTx({ status: 'conflict' }))
    await addPendingTransaction(db, makePendingTx({ status: 'failed' }))

    const conflicts = await getConflictedTransactions(db)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].status).toBe('conflict')
  })

  it('returns empty array when no conflicts exist', async () => {
    await addPendingTransaction(db, makePendingTx({ status: 'pending' }))

    const conflicts = await getConflictedTransactions(db)
    expect(conflicts).toHaveLength(0)
  })

  // ─── resolveConflict ────────────────────────────────────────────────────

  it('removes a conflicted transaction from the queue', async () => {
    const id = await addPendingTransaction(
      db,
      makePendingTx({ status: 'conflict' }),
    )

    await resolveConflict(db, id)

    const all = await getAllPendingTransactions(db)
    expect(all).toHaveLength(0)
  })

  // ─── isDuplicateTransaction ─────────────────────────────────────────────

  it('detects duplicate by terminalId + occurredAt', async () => {
    await addPendingTransaction(
      db,
      makePendingTx({
        terminalId: 'TERM-001',
        transaction: {
          type: 'CHECKIN',
          amount: 0,
          balanceBefore: 50000,
          balanceAfter: 50000,
          occurredAt: 1700000000,
        },
      }),
    )

    const isDup = await isDuplicateTransaction(db, 'TERM-001', 1700000000)
    expect(isDup).toBe(true)
  })

  it('returns false for non-duplicate', async () => {
    await addPendingTransaction(
      db,
      makePendingTx({
        terminalId: 'TERM-001',
        transaction: {
          type: 'CHECKIN',
          amount: 0,
          balanceBefore: 50000,
          balanceAfter: 50000,
          occurredAt: 1700000000,
        },
      }),
    )

    const isDup = await isDuplicateTransaction(db, 'TERM-001', 1700000001)
    expect(isDup).toBe(false)
  })

  it('returns false for different terminal same timestamp', async () => {
    await addPendingTransaction(
      db,
      makePendingTx({
        terminalId: 'TERM-001',
        transaction: {
          type: 'CHECKIN',
          amount: 0,
          balanceBefore: 50000,
          balanceAfter: 50000,
          occurredAt: 1700000000,
        },
      }),
    )

    const isDup = await isDuplicateTransaction(db, 'TERM-002', 1700000000)
    expect(isDup).toBe(false)
  })

  // ─── parseConflictResponse ──────────────────────────────────────────────

  it('parses server conflict response with all fields', () => {
    const info = parseConflictResponse(42, {
      reason: 'duplicate entry',
      message: 'Transaction with same timestamp exists',
    })

    expect(info.transactionId).toBe(42)
    expect(info.reason).toBe('duplicate entry')
    expect(info.serverMessage).toBe('Transaction with same timestamp exists')
    expect(info.detectedAt).toBeGreaterThan(0)
  })

  it('uses defaults when server response fields are missing', () => {
    const info = parseConflictResponse(42, {})

    expect(info.reason).toBe('duplicate timestamp+terminalId')
    expect(info.serverMessage).toBe('Transaction already exists')
  })
})
