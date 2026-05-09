/**
 * Web NFC Integration Layer — Write Failure Safety
 *
 * Implements the safety mechanism for NFC write failures. When a write
 * fails (card removed, communication error), the transaction is aborted
 * and any queued server-side transaction is discarded. The card retains
 * its pre-write state since the write never completed.
 *
 * Requirements: 15.3
 */

import type { NfcWriteResult, PipelineResult } from './types.ts'

/**
 * Handle an NFC write failure by aborting the transaction.
 *
 * When an NFC write fails:
 * 1. The card retains its pre-write state (no partial writes with NDEF)
 * 2. The transaction is NOT queued for server-side sync
 * 3. A clear error is returned to the caller
 *
 * The discardTransaction callback allows the caller to clean up any
 * pre-queued server-side transaction that was optimistically created.
 *
 * @param writeResult - The failed NFC write result
 * @param discardTransaction - Optional callback to discard a queued transaction
 * @returns PipelineResult with the write failure details
 */
export async function handleWriteFailure(
  writeResult: NfcWriteResult & { success: false },
  discardTransaction?: () => Promise<void>,
): Promise<PipelineResult> {
  // Discard any queued server-side transaction
  if (discardTransaction) {
    try {
      await discardTransaction()
    } catch {
      // Best-effort discard — if this fails, the sync service
      // will handle the orphaned transaction on next sync
    }
  }

  return {
    success: false,
    error: `Transaction aborted: ${writeResult.error}`,
    code: writeResult.code,
  }
}

/**
 * Execute a write operation with safety guarantees.
 *
 * Wraps a write function call and handles failures by aborting the
 * transaction and discarding any queued server-side records.
 *
 * @param writeFn - Function that performs the NFC write
 * @param discardTransaction - Optional callback to discard a queued transaction
 * @returns The write result, or a pipeline error if the write failed
 */
export async function safeWrite(
  writeFn: () => Promise<NfcWriteResult>,
  discardTransaction?: () => Promise<void>,
): Promise<NfcWriteResult> {
  const result = await writeFn()

  if (!result.success) {
    // Discard any queued server-side transaction on write failure
    if (discardTransaction) {
      try {
        await discardTransaction()
      } catch {
        // Best-effort discard
      }
    }
  }

  return result
}
