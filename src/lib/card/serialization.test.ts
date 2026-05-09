/**
 * Tests for NFC Card Serialization module
 * Covers: 5.3 (serialize/deserialize, < 256 byte constraint)
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { serialize, deserialize } from './serialization.ts'
import type { CardPayload, TransactionLogEntry } from './types.ts'
import { AES_GCM_IV_SIZE, AES_GCM_TAG_SIZE, HMAC_SHA256_SIZE } from './types.ts'

function makePayload(overrides: Partial<CardPayload> = {}): CardPayload {
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

// Arbitrary for valid TransactionLogEntry
const logEntryArb: fc.Arbitrary<TransactionLogEntry> = fc.record({
  t: fc.integer({ min: 0, max: 0xffffffff }),
  a: fc.constantFrom('TOPUP' as const, 'CHECKIN' as const, 'EXIT' as const),
  v: fc.integer({ min: -10_000_000, max: 10_000_000 }),
})

// Arbitrary for valid CardPayload (ASCII-safe strings for binary serialization)
const cardPayloadArb: fc.Arbitrary<CardPayload> = fc.record({
  v: fc.constant(1),
  tid: fc.stringMatching(/^[a-z0-9-]{1,20}$/),
  id: fc.stringMatching(/^[a-z0-9-]{1,20}$/),
  bal: fc.integer({ min: 0, max: 10_000_000 }),
  status: fc.constantFrom(0 as const, 1 as const),
  lastIn: fc.integer({ min: 0, max: 0xffffffff }),
  logs: fc.array(logEntryArb, { minLength: 0, maxLength: 5 }),
})

describe('Card payload serialization and deserialization (5.3)', () => {
  it('serialize produces a Uint8Array', () => {
    const payload = makePayload()
    const bytes = serialize(payload)
    expect(bytes).toBeInstanceOf(Uint8Array)
  })

  it('deserialize recovers the original payload', () => {
    const payload = makePayload({
      bal: 100000,
      status: 1,
      lastIn: 1700000000,
      logs: [
        { t: 1700000000, a: 'CHECKIN', v: 0 },
        { t: 1700003600, a: 'EXIT', v: -2000 },
      ],
    })

    const bytes = serialize(payload)
    const recovered = deserialize(bytes)

    expect(recovered).toEqual(payload)
  })

  it('handles empty logs', () => {
    const payload = makePayload({ logs: [] })
    const bytes = serialize(payload)
    const recovered = deserialize(bytes)
    expect(recovered.logs).toEqual([])
  })

  it('handles max 5 log entries', () => {
    const logs: TransactionLogEntry[] = Array.from({ length: 5 }, (_, i) => ({
      t: 1700000000 + i * 3600,
      a: 'TOPUP' as const,
      v: 10000,
    }))
    const payload = makePayload({ logs })
    const bytes = serialize(payload)
    const recovered = deserialize(bytes)
    expect(recovered.logs).toEqual(logs)
    expect(recovered.logs.length).toBe(5)
  })

  it('handles zero balance', () => {
    const payload = makePayload({ bal: 0 })
    const bytes = serialize(payload)
    const recovered = deserialize(bytes)
    expect(recovered.bal).toBe(0)
  })

  it('handles max balance (10,000,000)', () => {
    const payload = makePayload({ bal: 10_000_000 })
    const bytes = serialize(payload)
    const recovered = deserialize(bytes)
    expect(recovered.bal).toBe(10_000_000)
  })

  it('handles negative log values (EXIT deductions)', () => {
    const payload = makePayload({
      logs: [{ t: 1700000000, a: 'EXIT', v: -5000 }],
    })
    const bytes = serialize(payload)
    const recovered = deserialize(bytes)
    expect(recovered.logs[0].v).toBe(-5000)
  })

  it('serialized size with typical payload + encryption overhead < 256 bytes', () => {
    // Typical payload: short tid, short id, 5 log entries
    const payload = makePayload({
      tid: 'KOP-001',
      id: 'MBC-8829',
      bal: 500000,
      status: 1,
      lastIn: 1700000000,
      logs: Array.from({ length: 5 }, (_, i) => ({
        t: 1700000000 + i * 3600,
        a: 'TOPUP' as const,
        v: 10000,
      })),
    })

    const serialized = serialize(payload)
    // Total on-card: IV (12) + ciphertext (serialized + 16 auth tag) + HMAC (32)
    const totalOnCard =
      AES_GCM_IV_SIZE + serialized.length + AES_GCM_TAG_SIZE + HMAC_SHA256_SIZE

    expect(totalOnCard).toBeLessThan(256)
  })

  it('throws on invalid status byte during deserialization', () => {
    const payload = makePayload()
    const bytes = serialize(payload)
    // Find the status byte position and corrupt it
    // Layout: 1(v) + 1(tidLen) + tidLen + 1(idLen) + idLen + 4(bal) + 1(status)
    const tidLen = bytes[1]
    const idLen = bytes[2 + tidLen]
    const statusOffset = 2 + tidLen + 1 + idLen + 4
    bytes[statusOffset] = 5 // Invalid status
    expect(() => deserialize(bytes)).toThrow('Invalid card status byte')
  })

  /**
   * Property: Serialization round-trip
   * **Validates: Requirements 15.1, 15.2**
   */
  it('property: serialize then deserialize is identity for any valid payload', () => {
    fc.assert(
      fc.property(cardPayloadArb, (payload) => {
        const bytes = serialize(payload)
        const recovered = deserialize(bytes)
        expect(recovered).toEqual(payload)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Payload size constraint
   * **Validates: Requirements 15.1**
   */
  it('property: serialized + encrypted + HMAC size < 256 bytes for valid payloads', () => {
    // Use constrained arbitraries matching real-world tid/id lengths
    const constrainedPayloadArb = fc.record({
      v: fc.constant(1),
      tid: fc.stringMatching(/^[a-z0-9-]{3,15}$/),
      id: fc.stringMatching(/^[A-Z0-9-]{3,15}$/),
      bal: fc.integer({ min: 0, max: 10_000_000 }),
      status: fc.constantFrom(0 as const, 1 as const),
      lastIn: fc.integer({ min: 0, max: 0xffffffff }),
      logs: fc.array(logEntryArb, { minLength: 0, maxLength: 5 }),
    })

    fc.assert(
      fc.property(constrainedPayloadArb, (payload) => {
        const serialized = serialize(payload)
        const totalOnCard =
          AES_GCM_IV_SIZE +
          serialized.length +
          AES_GCM_TAG_SIZE +
          HMAC_SHA256_SIZE
        expect(totalOnCard).toBeLessThan(256)
      }),
      { numRuns: 100 },
    )
  })
})
