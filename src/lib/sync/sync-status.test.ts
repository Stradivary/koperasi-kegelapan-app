/**
 * Tests for Sync Status Tracker (Task 7.3)
 * Covers: pending count, last sync timestamp, syncing state, reactive subscriptions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { createSyncStatusTracker } from './sync-status.ts'
import { openDatabase, addPendingTransaction } from './indexed-db.ts'
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

describe('SyncStatusTracker (7.3)', () => {
  let db: IDBDatabase

  beforeEach(async () => {
    db = await openDatabase(indexedDB)
  })

  afterEach(() => {
    db.close()
    indexedDB.deleteDatabase(DB_NAME)
  })

  it('starts with zero pending count, null timestamp, not syncing', () => {
    const tracker = createSyncStatusTracker(db)
    const status = tracker.getStatus()

    expect(status.pendingCount).toBe(0)
    expect(status.lastSyncTimestamp).toBeNull()
    expect(status.isSyncing).toBe(false)
  })

  it('refreshPendingCount reads from IndexedDB', async () => {
    await addPendingTransaction(db, makePendingTx({ status: 'pending' }))
    await addPendingTransaction(db, makePendingTx({ status: 'pending' }))
    await addPendingTransaction(db, makePendingTx({ status: 'failed' }))
    // conflict should not be counted
    await addPendingTransaction(db, makePendingTx({ status: 'conflict' }))

    const tracker = createSyncStatusTracker(db)
    await tracker.refreshPendingCount()

    expect(tracker.getStatus().pendingCount).toBe(3)
  })

  it('setSyncing updates isSyncing flag', () => {
    const tracker = createSyncStatusTracker(db)

    tracker.setSyncing(true)
    expect(tracker.getStatus().isSyncing).toBe(true)

    tracker.setSyncing(false)
    expect(tracker.getStatus().isSyncing).toBe(false)
  })

  it('recordSuccessfulSync updates lastSyncTimestamp', () => {
    const tracker = createSyncStatusTracker(db)

    const before = Date.now()
    tracker.recordSuccessfulSync(5)
    const after = Date.now()

    const ts = tracker.getStatus().lastSyncTimestamp
    expect(ts).not.toBeNull()
    expect(ts!).toBeGreaterThanOrEqual(before)
    expect(ts!).toBeLessThanOrEqual(after)
  })

  it('recordSuccessfulSync does not update timestamp when syncedCount is 0', () => {
    const tracker = createSyncStatusTracker(db)

    tracker.recordSuccessfulSync(0)

    expect(tracker.getStatus().lastSyncTimestamp).toBeNull()
  })

  it('adjustPendingCount modifies count by delta', () => {
    const tracker = createSyncStatusTracker(db)

    tracker.adjustPendingCount(5)
    expect(tracker.getStatus().pendingCount).toBe(5)

    tracker.adjustPendingCount(-2)
    expect(tracker.getStatus().pendingCount).toBe(3)
  })

  it('adjustPendingCount does not go below zero', () => {
    const tracker = createSyncStatusTracker(db)

    tracker.adjustPendingCount(-10)
    expect(tracker.getStatus().pendingCount).toBe(0)
  })

  // ─── Reactive Subscriptions ─────────────────────────────────────────────

  it('subscribe immediately notifies with current status', () => {
    const tracker = createSyncStatusTracker(db)
    const listener = vi.fn()

    tracker.subscribe(listener)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({
      pendingCount: 0,
      lastSyncTimestamp: null,
      isSyncing: false,
    })
  })

  it('subscribe notifies on status changes', () => {
    const tracker = createSyncStatusTracker(db)
    const listener = vi.fn()

    tracker.subscribe(listener)
    listener.mockClear()

    tracker.setSyncing(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].isSyncing).toBe(true)

    tracker.adjustPendingCount(3)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener.mock.calls[1][0].pendingCount).toBe(3)
  })

  it('unsubscribe stops notifications', () => {
    const tracker = createSyncStatusTracker(db)
    const listener = vi.fn()

    const unsubscribe = tracker.subscribe(listener)
    listener.mockClear()

    unsubscribe()

    tracker.setSyncing(true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('supports multiple subscribers', () => {
    const tracker = createSyncStatusTracker(db)
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    tracker.subscribe(listener1)
    tracker.subscribe(listener2)
    listener1.mockClear()
    listener2.mockClear()

    tracker.adjustPendingCount(1)

    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener2).toHaveBeenCalledTimes(1)
  })

  it('getStatus returns a snapshot (not a reference)', () => {
    const tracker = createSyncStatusTracker(db)

    const status1 = tracker.getStatus()
    tracker.adjustPendingCount(5)
    const status2 = tracker.getStatus()

    expect(status1.pendingCount).toBe(0)
    expect(status2.pendingCount).toBe(5)
  })
})
