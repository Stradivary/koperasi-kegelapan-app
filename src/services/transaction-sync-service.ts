/**
 * Transaction Sync Service (Server-Side)
 * Requirements: 9.2, 9.3, 13.3
 *
 * Accepts batched transactions from terminals, validates each record,
 * detects duplicates, and inserts valid records into D1.
 * Simulation-flagged transactions are stored but excluded from analytics.
 */

import { and, eq } from 'drizzle-orm'
import { transactions } from '#/db/schema.ts'
import type { db as DbType } from '#/db/index.ts'

// ─── Types ───────────────────────────────────────────────────────────────────

export type TransactionType = 'CHECKIN' | 'EXIT' | 'TOPUP'
export type TopUpSource = 'cash' | 'bank_transfer' | 'e_wallet' | 'other'
export type TerminalType = 'gate' | 'terminal' | 'station' | 'scout'

export interface TransactionInput {
  tenantId: string
  memberId: string
  terminalId: string
  type: TransactionType
  amount: number
  balanceBefore: number
  balanceAfter: number
  topUpSource?: TopUpSource | null
  entryTime?: Date | null
  exitTime?: Date | null
  durationHours?: number | null
  occurredAt: Date
  terminalType: TerminalType
  isSimulated?: boolean
}

export interface SyncResult {
  syncedCount: number
  rejectedCount: number
  conflictIndices: number[]
  validationErrors: Array<{ index: number; error: string }>
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate a single transaction record.
 * Requirements: 9.2
 *
 * - EXIT: amount must be negative
 * - TOPUP: amount must be positive
 * - CHECKIN: amount must be 0
 * - balanceAfter must equal balanceBefore + amount
 * - balanceAfter must be >= 0
 */
export function validateTransaction(
  tx: TransactionInput,
): string | null {
  // Validate amount sign matches type
  if (tx.type === 'EXIT' && tx.amount >= 0) {
    return 'EXIT transaction amount must be negative'
  }
  if (tx.type === 'TOPUP' && tx.amount <= 0) {
    return 'TOPUP transaction amount must be positive'
  }
  if (tx.type === 'CHECKIN' && tx.amount !== 0) {
    return 'CHECKIN transaction amount must be 0'
  }

  // Validate balance conservation
  if (tx.balanceAfter !== tx.balanceBefore + tx.amount) {
    return `balanceAfter (${tx.balanceAfter}) must equal balanceBefore (${tx.balanceBefore}) + amount (${tx.amount})`
  }

  // Validate balanceAfter within bounds
  if (tx.balanceAfter < 0) {
    return 'balanceAfter must be >= 0'
  }

  return null
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Check for duplicate transactions by (occurredAt, terminalId).
 * Requirement: 9.3
 *
 * @param occurredAt - Timestamp of the transaction
 * @param terminalId - Terminal that processed the transaction
 * @param database - Drizzle database instance
 * @returns true if a duplicate exists
 */
export async function isDuplicateTransaction(
  occurredAt: Date,
  terminalId: string,
  database: typeof DbType,
): Promise<boolean> {
  const [existing] = await database
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.occurredAt, occurredAt),
        eq(transactions.terminalId, terminalId),
      ),
    )
    .limit(1)

  return !!existing
}

/**
 * Sync a batch of transactions from a terminal.
 * Requirements: 9.2, 9.3, 13.3
 *
 * Accepts an array of transaction records, validates each one,
 * checks for duplicates, and inserts valid records into D1.
 *
 * @param batch - Array of transaction inputs
 * @param database - Drizzle database instance
 * @returns SyncResult with counts and error details
 */
export async function syncTransactions(
  batch: TransactionInput[],
  database: typeof DbType,
): Promise<SyncResult> {
  const result: SyncResult = {
    syncedCount: 0,
    rejectedCount: 0,
    conflictIndices: [],
    validationErrors: [],
  }

  for (let i = 0; i < batch.length; i++) {
    const tx = batch[i]!

    // 1. Validate the transaction record
    const validationError = validateTransaction(tx)
    if (validationError) {
      result.rejectedCount++
      result.validationErrors.push({ index: i, error: validationError })
      continue
    }

    // 2. Check for duplicates (occurredAt + terminalId)
    const duplicate = await isDuplicateTransaction(
      tx.occurredAt,
      tx.terminalId,
      database,
    )
    if (duplicate) {
      result.rejectedCount++
      result.conflictIndices.push(i)
      continue
    }

    // 3. Insert valid transaction
    const [inserted] = await database
      .insert(transactions)
      .values({
        tenantId: tx.tenantId,
        memberId: tx.memberId,
        terminalId: tx.terminalId,
        type: tx.type,
        amount: tx.amount,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
        topUpSource: tx.topUpSource ?? null,
        entryTime: tx.entryTime ?? null,
        exitTime: tx.exitTime ?? null,
        durationHours: tx.durationHours ?? null,
        occurredAt: tx.occurredAt,
        terminalType: tx.terminalType,
        isSimulated: tx.isSimulated ?? false,
      })
      .returning()

    if (inserted) {
      result.syncedCount++
    } else {
      result.rejectedCount++
      result.validationErrors.push({ index: i, error: 'Failed to insert transaction' })
    }
  }

  return result
}
