/**
 * Tests for NFC Card Log Buffer module
 * Covers: 5.7 (FIFO buffer management, max 5 entries)
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { appendLog } from './log-buffer.ts'
import type { TransactionLogEntry } from './types.ts'
import { MAX_LOG_ENTRIES } from './types.ts'

function makeLogEntry(
  t: number = 1700000000,
  a: TransactionLogEntry['a'] = 'CHECKIN',
  v: number = 0,
): TransactionLogEntry {
  return { t, a, v }
}

describe('appendLog FIFO buffer (5.7)', () => {
  it('appends to empty log', () => {
    const entry = makeLogEntry()
    const result = appendLog([], entry)
    expect(result).toEqual([entry])
  })

  it('appends to non-full log', () => {
    const existing = [makeLogEntry(1), makeLogEntry(2)]
    const newEntry = makeLogEntry(3)
    const result = appendLog(existing, newEntry)
    expect(result).toHaveLength(3)
    expect(result[2]).toEqual(newEntry)
  })

  it('evicts oldest when at max capacity (5)', () => {
    const logs = Array.from({ length: 5 }, (_, i) => makeLogEntry(i))
    const newEntry = makeLogEntry(99, 'TOPUP', 5000)

    const result = appendLog(logs, newEntry)

    expect(result).toHaveLength(5)
    // Oldest (t=0) should be gone
    expect(result[0].t).toBe(1)
    // Newest should be last
    expect(result[4]).toEqual(newEntry)
  })

  it('does not mutate the input array', () => {
    const logs = [makeLogEntry(1), makeLogEntry(2)]
    const original = [...logs]
    appendLog(logs, makeLogEntry(3))
    expect(logs).toEqual(original)
  })

  it('handles exactly MAX_LOG_ENTRIES entries', () => {
    const logs = Array.from({ length: MAX_LOG_ENTRIES }, (_, i) =>
      makeLogEntry(i),
    )
    const result = appendLog(logs, makeLogEntry(100))
    expect(result).toHaveLength(MAX_LOG_ENTRIES)
  })

  /**
   * Property: Log buffer never exceeds MAX_LOG_ENTRIES
   * **Validates: Requirements 9.1**
   */
  it('property: log buffer length is always <= MAX_LOG_ENTRIES after any sequence of appends', () => {
    const logEntryArb = fc.record({
      t: fc.integer({ min: 0, max: 0xffffffff }),
      a: fc.constantFrom(
        'TOPUP' as const,
        'CHECKIN' as const,
        'EXIT' as const,
      ),
      v: fc.integer({ min: -10_000_000, max: 10_000_000 }),
    })

    fc.assert(
      fc.property(
        fc.array(logEntryArb, { minLength: 1, maxLength: 20 }),
        (entries) => {
          let logs: TransactionLogEntry[] = []
          for (const entry of entries) {
            logs = appendLog(logs, entry)
          }
          expect(logs.length).toBeLessThanOrEqual(MAX_LOG_ENTRIES)
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: The newest entry is always the last element
   * **Validates: Requirements 9.1**
   */
  it('property: the appended entry is always the last element', () => {
    const logEntryArb = fc.record({
      t: fc.integer({ min: 0, max: 0xffffffff }),
      a: fc.constantFrom(
        'TOPUP' as const,
        'CHECKIN' as const,
        'EXIT' as const,
      ),
      v: fc.integer({ min: -10_000_000, max: 10_000_000 }),
    })

    fc.assert(
      fc.property(
        fc.array(logEntryArb, { minLength: 0, maxLength: 5 }),
        logEntryArb,
        (logs, newEntry) => {
          const result = appendLog(logs, newEntry)
          expect(result[result.length - 1]).toEqual(newEntry)
        },
      ),
      { numRuns: 100 },
    )
  })
})
