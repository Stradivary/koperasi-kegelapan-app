/**
 * Tests for NFC Card Operations module
 * Covers: 5.4 (processCheckIn), 5.5 (processCheckOut),
 *         5.6 (processTopUp), 5.9 (initializeCard), 5.10 (resetCardStatus)
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  processCheckIn,
  processCheckOut,
  processTopUp,
  initializeCard,
  resetCardStatus,
} from './operations.ts'
import type { CardPayload, TenantCardConfig } from './types.ts'

const defaultConfig: TenantCardConfig = {
  tid: 'KOP-001',
  tariffRatePerHour: 2000,
  maxBalance: 10_000_000,
  minBalanceForEntry: 2000,
}

function makeIdleCard(overrides: Partial<CardPayload> = {}): CardPayload {
  return {
    v: 1,
    tid: 'KOP-001',
    id: 'MBC-8829',
    bal: 50000,
    status: 0,
    lastIn: 0,
    logs: [],
    ...overrides,
  }
}

function makeCheckedInCard(
  overrides: Partial<CardPayload> = {},
): CardPayload {
  return {
    v: 1,
    tid: 'KOP-001',
    id: 'MBC-8829',
    bal: 50000,
    status: 1,
    lastIn: 1700000000,
    logs: [{ t: 1700000000, a: 'CHECKIN', v: 0 }],
    ...overrides,
  }
}

// ─── 5.4: processCheckIn ────────────────────────────────────────────────────

describe('processCheckIn (5.4)', () => {
  it('succeeds for idle card with sufficient balance and matching tenant', () => {
    const card = makeIdleCard()
    const now = 1700000000

    const result = processCheckIn(card, defaultConfig, now)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.payload.status).toBe(1)
      expect(result.payload.lastIn).toBe(now)
      expect(result.payload.logs).toHaveLength(1)
      expect(result.payload.logs[0]).toEqual({
        t: now,
        a: 'CHECKIN',
        v: 0,
      })
      expect(result.transaction.type).toBe('CHECKIN')
      expect(result.transaction.amount).toBe(0)
      expect(result.transaction.balanceBefore).toBe(50000)
      expect(result.transaction.balanceAfter).toBe(50000)
    }
  })

  it('rejects double tap-in (status === 1)', () => {
    const card = makeCheckedInCard()

    const result = processCheckIn(card, defaultConfig)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ALREADY_CHECKED_IN')
      expect(result.error).toContain('already checked in')
    }
  })

  it('rejects when balance < minBalanceForEntry', () => {
    const card = makeIdleCard({ bal: 1000 })

    const result = processCheckIn(card, defaultConfig)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INSUFFICIENT_BALANCE_ENTRY')
      expect(result.error).toContain('Balance too low')
      expect(result.error).toContain('Rp 1000')
      expect(result.error).toContain('Rp 2000')
    }
  })

  it('rejects when tid does not match terminal tenant', () => {
    const card = makeIdleCard({ tid: 'OTHER-TENANT' })

    const result = processCheckIn(card, defaultConfig)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('TENANT_MISMATCH')
      expect(result.error).toContain('different cooperative')
    }
  })

  it('does not modify balance on check-in', () => {
    const card = makeIdleCard({ bal: 100000 })
    const result = processCheckIn(card, defaultConfig)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.payload.bal).toBe(100000)
    }
  })

  /**
   * Property: Check-in preserves balance
   * **Validates: Requirements 4.1**
   */
  it('property: check-in never changes balance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 10_000_000 }),
        fc.integer({ min: 1_000_000_000, max: 2_000_000_000 }),
        (bal, now) => {
          const card = makeIdleCard({ bal })
          const result = processCheckIn(card, defaultConfig, now)
          if (result.success) {
            expect(result.payload.bal).toBe(bal)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── 5.5: processCheckOut ───────────────────────────────────────────────────

describe('processCheckOut (5.5)', () => {
  it('succeeds for checked-in card with sufficient balance', () => {
    const entryTime = 1700000000
    const exitTime = entryTime + 7200 // 2 hours
    const card = makeCheckedInCard({ lastIn: entryTime, bal: 50000 })

    const result = processCheckOut(card, defaultConfig, exitTime)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.payload.status).toBe(0)
      expect(result.payload.bal).toBe(50000 - 4000) // 2 hours * 2000
      expect(result.transaction.type).toBe('EXIT')
      expect(result.transaction.amount).toBe(-4000)
      expect(result.transaction.entryTime).toBe(entryTime)
      expect(result.transaction.exitTime).toBe(exitTime)
      expect(result.transaction.durationHours).toBe(2)
    }
  })

  it('rounds up partial hours (ceiling)', () => {
    const entryTime = 1700000000
    const exitTime = entryTime + 3601 // 1 hour + 1 second → 2 hours
    const card = makeCheckedInCard({ lastIn: entryTime, bal: 50000 })

    const result = processCheckOut(card, defaultConfig, exitTime)

    expect(result.success).toBe(true)
    if (result.success) {
      // ceil(3601/3600) = 2 hours → 4000
      expect(result.payload.bal).toBe(50000 - 4000)
      expect(result.transaction.durationHours).toBe(2)
    }
  })

  it('rejects double tap-out (status === 0)', () => {
    const card = makeIdleCard()

    const result = processCheckOut(card, defaultConfig)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_CHECKED_IN')
      expect(result.error).toContain('not checked in')
    }
  })

  it('rejects when balance < tariff', () => {
    const entryTime = 1700000000
    const exitTime = entryTime + 7200 // 2 hours → 4000
    const card = makeCheckedInCard({ lastIn: entryTime, bal: 3000 })

    const result = processCheckOut(card, defaultConfig, exitTime)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INSUFFICIENT_BALANCE_EXIT')
      expect(result.error).toContain('Insufficient balance')
      expect(result.error).toContain('Rp 4000')
      expect(result.error).toContain('Rp 3000')
    }
  })

  it('appends EXIT log with negative amount', () => {
    const entryTime = 1700000000
    const exitTime = entryTime + 3600 // 1 hour
    const card = makeCheckedInCard({ lastIn: entryTime, bal: 50000 })

    const result = processCheckOut(card, defaultConfig, exitTime)

    expect(result.success).toBe(true)
    if (result.success) {
      const lastLog = result.payload.logs[result.payload.logs.length - 1]
      expect(lastLog.a).toBe('EXIT')
      expect(lastLog.v).toBe(-2000)
    }
  })

  /**
   * Property: Balance conservation on check-out
   * **Validates: Requirements 5.1, 5.4**
   */
  it('property: balanceBefore - tariff === balanceAfter', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100_000, max: 10_000_000 }),
        fc.integer({ min: 1_000_000_000, max: 1_900_000_000 }),
        fc.integer({ min: 1, max: 86400 }),
        (bal, entryTime, durationSec) => {
          const exitTime = entryTime + durationSec
          const card = makeCheckedInCard({ lastIn: entryTime, bal })
          const result = processCheckOut(card, defaultConfig, exitTime)
          if (result.success) {
            const tariff =
              Math.ceil(durationSec / 3600) * defaultConfig.tariffRatePerHour
            expect(result.payload.bal).toBe(bal - tariff)
            expect(result.transaction.balanceAfter).toBe(bal - tariff)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── 5.6: processTopUp ─────────────────────────────────────────────────────

describe('processTopUp (5.6)', () => {
  it('succeeds for valid top-up amount', () => {
    const card = makeIdleCard({ bal: 50000 })
    const now = 1700000000

    const result = processTopUp(card, 10000, defaultConfig, 'cash', now)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.payload.bal).toBe(60000)
      expect(result.transaction.type).toBe('TOPUP')
      expect(result.transaction.amount).toBe(10000)
      expect(result.transaction.topUpSource).toBe('cash')
    }
  })

  it('rejects when new balance would exceed maxBalance', () => {
    const card = makeIdleCard({ bal: 9_500_000 })

    const result = processTopUp(card, 600_000, defaultConfig)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('BALANCE_OVERFLOW')
      expect(result.error).toContain('exceed maximum balance')
      expect(result.error).toContain('Rp 9500000')
      expect(result.error).toContain('Rp 10000000')
    }
  })

  it('allows top-up to exactly maxBalance', () => {
    const card = makeIdleCard({ bal: 9_000_000 })

    const result = processTopUp(card, 1_000_000, defaultConfig)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.payload.bal).toBe(10_000_000)
    }
  })

  it('rejects zero amount', () => {
    const card = makeIdleCard()
    const result = processTopUp(card, 0, defaultConfig)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INVALID_AMOUNT')
    }
  })

  it('rejects negative amount', () => {
    const card = makeIdleCard()
    const result = processTopUp(card, -1000, defaultConfig)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INVALID_AMOUNT')
    }
  })

  it('appends TOPUP log with positive amount', () => {
    const card = makeIdleCard({ bal: 50000 })
    const now = 1700000000

    const result = processTopUp(card, 10000, defaultConfig, 'cash', now)

    expect(result.success).toBe(true)
    if (result.success) {
      const lastLog = result.payload.logs[result.payload.logs.length - 1]
      expect(lastLog.a).toBe('TOPUP')
      expect(lastLog.v).toBe(10000)
    }
  })

  /**
   * Property: Top-up increases balance by exact amount
   * **Validates: Requirements 6.1**
   */
  it('property: balance increases by exactly the top-up amount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 1, max: 5_000_000 }),
        (bal, amount) => {
          const card = makeIdleCard({ bal })
          const result = processTopUp(card, amount, defaultConfig)
          if (result.success) {
            expect(result.payload.bal).toBe(bal + amount)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── 5.9: initializeCard ───────────────────────────────────────────────────

describe('initializeCard (5.9)', () => {
  it('creates a card with zero balance and idle status', () => {
    const card = initializeCard('MBC-8829', 'KOP-001')

    expect(card.v).toBe(1)
    expect(card.tid).toBe('KOP-001')
    expect(card.id).toBe('MBC-8829')
    expect(card.bal).toBe(0)
    expect(card.status).toBe(0)
    expect(card.lastIn).toBe(0)
    expect(card.logs).toEqual([])
  })

  it('uses current schema version', () => {
    const card = initializeCard('MBC-0001', 'KOP-002')
    expect(card.v).toBe(1)
  })
})

// ─── 5.10: resetCardStatus ─────────────────────────────────────────────────

describe('resetCardStatus (5.10)', () => {
  it('resets checked-in card to idle', () => {
    const card = makeCheckedInCard()

    const reset = resetCardStatus(card)

    expect(reset.status).toBe(0)
    expect(reset.lastIn).toBe(0)
  })

  it('preserves balance and other fields', () => {
    const card = makeCheckedInCard({ bal: 75000 })

    const reset = resetCardStatus(card)

    expect(reset.bal).toBe(75000)
    expect(reset.tid).toBe(card.tid)
    expect(reset.id).toBe(card.id)
    expect(reset.v).toBe(card.v)
    expect(reset.logs).toEqual(card.logs)
  })

  it('is idempotent on already-idle card', () => {
    const card = makeIdleCard()

    const reset = resetCardStatus(card)

    expect(reset.status).toBe(0)
    expect(reset.lastIn).toBe(0)
  })
})
