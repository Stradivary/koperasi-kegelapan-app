/**
 * Conflict Detection and Handling
 *
 * Handles server-rejected transactions (409 Conflict) by marking them
 * with 'conflict' status and logging details for admin review.
 * Conflicted transactions are never retried.
 *
 * Requirements: 9.3
 */

import {
  getAllPendingTransactions,
  updatePendingTransaction,
} from './indexed-db.ts'
import type { PendingTransaction, ConflictInfo } from './types.ts'

/**
 * Marks a transaction as conflicted. Conflicted transactions are
 * excluded from retry logic and preserved for admin review.
 */
export async function markAsConflict(
  db: IDBDatabase,
  transactionId: number,
  reason: string,
  serverMessage: string,
): Promise<ConflictInfo> {
  await updatePendingTransaction(db, transactionId, {
    status: 'conflict',
    lastError: `Conflict: ${reason} — ${serverMessage}`,
  })

  return {
    transactionId,
    reason,
    serverMessage,
    detectedAt: Date.now(),
  }
}

/**
 * Retrieves all conflicted transactions for admin review.
 */
export async function getConflictedTransactions(
  db: IDBDatabase,
): Promise<PendingTransaction[]> {
  return getAllPendingTransactions(db, 'conflict')
}

/**
 * Resolves a conflict by removing the transaction from the queue.
 * Called after an admin has reviewed and acknowledged the conflict.
 */
export async function resolveConflict(
  db: IDBDatabase,
  transactionId: number,
): Promise<void> {
  // We import here to avoid circular dependency at module level
  const { removePendingTransaction } = await import('./indexed-db.ts')
  await removePendingTransaction(db, transactionId)
}

/**
 * Checks if a transaction is a duplicate based on occurredAt + terminalId.
 * Used client-side as a pre-check before queuing (optional optimization).
 */
export async function isDuplicateTransaction(
  db: IDBDatabase,
  terminalId: string,
  occurredAt: number,
): Promise<boolean> {
  const all = await getAllPendingTransactions(db)
  return all.some(
    (tx) =>
      tx.terminalId === terminalId &&
      tx.transaction.occurredAt === occurredAt,
  )
}

/**
 * Builds a ConflictInfo from a server 409 response.
 */
export function parseConflictResponse(
  transactionId: number,
  serverBody: { message?: string; reason?: string },
): ConflictInfo {
  return {
    transactionId,
    reason: serverBody.reason ?? 'duplicate timestamp+terminalId',
    serverMessage: serverBody.message ?? 'Transaction already exists',
    detectedAt: Date.now(),
  }
}
