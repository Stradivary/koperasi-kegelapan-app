/**
 * Tests for NFC Card Schema Migration module
 * Covers: 5.11 (migrateSchema for backward-compatible upgrades)
 */

import { describe, it, expect } from 'vitest'
import { migrateSchema } from './migration.ts'
import { CURRENT_SCHEMA_VERSION } from './types.ts'
import type { CardPayload } from './types.ts'

function makePayload(overrides: Partial<CardPayload> = {}): CardPayload {
  return {
    v: CURRENT_SCHEMA_VERSION,
    tid: 'KOP-001',
    id: 'MBC-8829',
    bal: 50000,
    status: 0,
    lastIn: 0,
    logs: [],
    ...overrides,
  }
}

describe('migrateSchema (5.11)', () => {
  it('returns payload unchanged when version matches expected', () => {
    const payload = makePayload({ v: 1 })
    const result = migrateSchema(payload, 1)
    expect(result).toEqual(payload)
  })

  it('throws for unrecognized version (newer than expected)', () => {
    const payload = makePayload({ v: 99 })
    expect(() => migrateSchema(payload, 1)).toThrow(
      'Card requires update. Please visit The Station.',
    )
  })

  it('throws for older version with no migration path', () => {
    // Version 0 has no migration to version 1 registered
    const payload = makePayload({ v: 0 })
    expect(() => migrateSchema(payload, 1)).toThrow(
      'Card requires update. Please visit The Station.',
    )
  })

  it('uses CURRENT_SCHEMA_VERSION as default expected version', () => {
    const payload = makePayload({ v: CURRENT_SCHEMA_VERSION })
    const result = migrateSchema(payload)
    expect(result.v).toBe(CURRENT_SCHEMA_VERSION)
  })
})
