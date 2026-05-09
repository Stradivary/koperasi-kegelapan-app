/**
 * Background Sync Service
 *
 * Manages syncing pending transactions from IndexedDB to the server.
 * Supports batch sending (up to 50 per request) and exponential backoff
 * retry (1s, 2s, 4s, 8s... capped at 5 minutes).
 *
 * Requirements: 8.3
 */

import {
  getAllPendingTransactions,
  updatePendingTransaction,
  removePendingTransaction,
  getPendingTransactionCount,
} from './indexed-db.ts'
import type { PendingTransaction, SyncResult } from './types.ts'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum transactions per sync batch */
export const MAX_BATCH_SIZE = 50

/** Base delay for exponential backoff in milliseconds */
export const BASE_DELAY_MS = 1000

/** Maximum delay cap in milliseconds (5 minutes) */
export const MAX_DELAY_MS = 300_000

/** Sync API endpoint */
export const SYNC_ENDPOINT = '/api/transactions/sync'

// ─── Backoff Calculation ────────────────────────────────────────────────────

/**
 * Calculates the delay for exponential backoff.
 * delay = min(BASE_DELAY_MS * 2^retryCount, MAX_DELAY_MS)
 */
export function calculateBackoffDelay(retryCount: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, retryCount)
  return Math.min(delay, MAX_DELAY_MS)
}

// ─── Sync Service ───────────────────────────────────────────────────────────

export interface SyncServiceOptions {
  /** The IDBDatabase instance to use */
  db: IDBDatabase
  /** Function to perform the HTTP POST (injectable for testing) */
  fetchFn?: typeof fetch
  /** Sync API endpoint override */
  endpoint?: string
  /** Callback invoked after each sync attempt */
  onSyncAttempt?: (result: SyncResult) => void
}

/**
 * Syncs pending transactions to the server in batches.
 *
 * 1. Fetches all transactions with status 'pending' or 'failed'
 * 2. Marks them as 'syncing'
 * 3. Sends in batches of up to 50
 * 4. On success: removes from queue
 * 5. On 409 Conflict: marks as 'conflict'
 * 6. On other failure: marks as 'pending', increments retryCount
 */
export async function syncPendingTransactions(
  options: SyncServiceOptions,
): Promise<SyncResult> {
  const {
    db,
    fetchFn = fetch,
    endpoint = SYNC_ENDPOINT,
    onSyncAttempt,
  } = options

  const result: SyncResult = { synced: 0, failed: 0, conflicts: 0 }

  // Get all syncable transactions (pending or failed that are ready for retry)
  const pending = await getAllPendingTransactions(db, 'pending')
  const failed = await getRetryableTransactions(db)
  const allSyncable = [...pending, ...failed]

  if (allSyncable.length === 0) {
    onSyncAttempt?.(result)
    return result
  }

  // Process in batches of MAX_BATCH_SIZE
  for (let i = 0; i < allSyncable.length; i += MAX_BATCH_SIZE) {
    const batch = allSyncable.slice(i, i + MAX_BATCH_SIZE)

    // Mark batch as syncing
    for (const tx of batch) {
      if (tx.id != null) {
        await updatePendingTransaction(db, tx.id, { status: 'syncing' })
      }
    }

    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: batch.map((tx) => ({
            tenantId: tx.tenantId,
            memberId: tx.memberId,
            terminalId: tx.terminalId,
            terminalType: tx.terminalType,
            ...tx.transaction,
          })),
        }),
      })

      if (response.ok) {
        // Success — remove all transactions in this batch
        for (const tx of batch) {
          if (tx.id != null) {
            await removePendingTransaction(db, tx.id)
          }
        }
        result.synced += batch.length
      } else if (response.status === 409) {
        // Conflict — handle per-transaction conflicts
        const body = await response.json() as { conflicts?: number[] }
        const conflictIds = new Set(body.conflicts ?? [])

        for (let j = 0; j < batch.length; j++) {
          const tx = batch[j]
          if (tx.id == null) continue

          if (conflictIds.has(j)) {
            await updatePendingTransaction(db, tx.id, {
              status: 'conflict',
              lastError: 'Server rejected: duplicate transaction',
            })
            result.conflicts++
          } else {
            await removePendingTransaction(db, tx.id)
            result.synced++
          }
        }
      } else {
        // Other failure — mark as failed with incremented retry count
        const errorText = await response.text().catch(() => 'Unknown error')
        for (const tx of batch) {
          if (tx.id != null) {
            await updatePendingTransaction(db, tx.id, {
              status: 'failed',
              retryCount: tx.retryCount + 1,
              lastError: `HTTP ${response.status}: ${errorText}`,
            })
          }
        }
        result.failed += batch.length
      }
    } catch (error) {
      // Network error — mark as failed
      const errorMessage =
        error instanceof Error ? error.message : 'Network error'
      for (const tx of batch) {
        if (tx.id != null) {
          await updatePendingTransaction(db, tx.id, {
            status: 'failed',
            retryCount: tx.retryCount + 1,
            lastError: errorMessage,
          })
        }
      }
      result.failed += batch.length
    }
  }

  onSyncAttempt?.(result)
  return result
}

/**
 * Gets failed transactions that are ready for retry based on their backoff delay.
 */
async function getRetryableTransactions(
  db: IDBDatabase,
): Promise<PendingTransaction[]> {
  const failed = await getAllPendingTransactions(db, 'failed')
  const now = Date.now()

  return failed.filter((tx) => {
    const delay = calculateBackoffDelay(tx.retryCount)
    const readyAt = tx.queuedAt + delay
    return now >= readyAt
  })
}

/**
 * Returns the count of transactions that need syncing (pending + failed).
 */
export async function getSyncableCount(db: IDBDatabase): Promise<number> {
  const pending = await getPendingTransactionCount(db, 'pending')
  const failed = await getPendingTransactionCount(db, 'failed')
  return pending + failed
}
