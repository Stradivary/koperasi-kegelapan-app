/**
 * Tests for NFC Card Tariff Calculation module
 * Covers: 5.8 (calculateTariff with ceiling-based hourly rounding)
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { calculateTariff } from './tariff.ts'

describe('calculateTariff (5.8)', () => {
  it('charges 1 hour for exactly 1 hour', () => {
    const tariff = calculateTariff(1000, 4600, 2000) // 3600 seconds
    expect(tariff).toBe(2000)
  })

  it('charges 1 hour for 1 second', () => {
    const tariff = calculateTariff(1000, 1001, 2000)
    expect(tariff).toBe(2000) // ceil(1/3600) = 1
  })

  it('charges 2 hours for 1 hour + 1 second', () => {
    const tariff = calculateTariff(1000, 4601, 2000) // 3601 seconds
    expect(tariff).toBe(4000) // ceil(3601/3600) = 2
  })

  it('charges 24 hours for exactly 24 hours', () => {
    const tariff = calculateTariff(0, 86400, 2000)
    expect(tariff).toBe(48000) // 24 * 2000
  })

  it('charges 25 hours for 24 hours + 1 second', () => {
    const tariff = calculateTariff(0, 86401, 2000)
    expect(tariff).toBe(50000) // 25 * 2000
  })

  it('throws when exitTime <= entryTime', () => {
    expect(() => calculateTariff(1000, 1000, 2000)).toThrow(
      'Exit time must be after entry time',
    )
    expect(() => calculateTariff(1000, 999, 2000)).toThrow(
      'Exit time must be after entry time',
    )
  })

  it('throws when ratePerHour <= 0', () => {
    expect(() => calculateTariff(0, 3600, 0)).toThrow(
      'Rate per hour must be positive',
    )
    expect(() => calculateTariff(0, 3600, -1000)).toThrow(
      'Rate per hour must be positive',
    )
  })

  /**
   * Property: Tariff monotonicity — longer durations produce equal or higher tariffs
   * **Validates: Requirements 5.4**
   */
  it('property: longer duration produces equal or higher tariff', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 50_000 }),
        (entryTime, dur1, dur2, rate) => {
          const shortDur = Math.min(dur1, dur2)
          const longDur = Math.max(dur1, dur2)
          const shortTariff = calculateTariff(
            entryTime,
            entryTime + shortDur,
            rate,
          )
          const longTariff = calculateTariff(
            entryTime,
            entryTime + longDur,
            rate,
          )
          expect(longTariff).toBeGreaterThanOrEqual(shortTariff)
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Tariff is always a positive multiple of ratePerHour
   * **Validates: Requirements 5.4**
   */
  it('property: tariff is always a positive multiple of ratePerHour', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 50_000 }),
        (entryTime, duration, rate) => {
          const tariff = calculateTariff(entryTime, entryTime + duration, rate)
          expect(tariff).toBeGreaterThan(0)
          expect(tariff % rate).toBe(0)
        },
      ),
      { numRuns: 100 },
    )
  })
})
