/**
 * NFC Card Operations — Transaction Log FIFO Buffer
 *
 * Manages the rolling 5-entry transaction log buffer on the NFC card.
 * When the buffer is full, the oldest entry is evicted before appending.
 *
 * Requirement: 9.1
 */

import { MAX_LOG_ENTRIES } from './types.ts'
import type { TransactionLogEntry } from './types.ts'

/**
 * Append a new log entry to the transaction log buffer.
 * If the buffer already has MAX_LOG_ENTRIES (5) entries,
 * the oldest entry (index 0) is removed before appending.
 *
 * @param logs - Current log entries
 * @param entry - New entry to append
 * @returns Updated log array (new reference, does not mutate input)
 */
export function appendLog(
  logs: TransactionLogEntry[],
  entry: TransactionLogEntry,
): TransactionLogEntry[] {
  const updated = [...logs]
  if (updated.length >= MAX_LOG_ENTRIES) {
    updated.shift()
  }
  updated.push(entry)
  return updated
}
