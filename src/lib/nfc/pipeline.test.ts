/**
 * Tests for the full card operation pipeline
 * Covers: 6.4 (read → decrypt → verify → process → encrypt → write)
 *
 * Uses mocked NFC APIs with real crypto operations to test the full flow.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { executeCardPipeline } from './pipeline.ts'
import {
  importKey,
  importHMACKey,
  encrypt,
  generateHMAC,
} from '#/lib/card/crypto.ts'
import { serialize } from '#/lib/card/serialization.ts'
import type { CardPayload, TenantCardConfig } from '#/lib/card/types.ts'
import type { CardCryptoKeys, CardOperationFn } from './types.ts'

// ─── Helpers ────────────────────────────────────────────────────────────────

async function generateTestKeyBase64(): Promise<string> {
  const key = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...key))
}

async function createTestKeys(): Promise<CardCryptoKeys> {
  const encBase64 = await generateTestKeyBase64()
  const hmacBase64 = await generateTestKeyBase64()
  return {
    encryptionKey: await importKey(encBase64),
    rotatingEncryptionKey: null,
    hmacKey: await importHMACKey(hmacBase64),
  }
}

const TEST_CONFIG: TenantCardConfig = {
  tid: 'KOP-001',
  tariffRatePerHour: 2000,
  maxBalance: 10_000_000,
  minBalanceForEntry: 2000,
}

function createTestPayload(overrides?: Partial<CardPayload>): CardPayload {
  return {
    v: 1,
    tid: 'KOP-001',
    id: 'MBC-0001',
    bal: 50000,
    status: 0,
    lastIn: 0,
    logs: [],
    ...overrides,
  }
}

/**
 * Build a valid NFC card binary: encrypted payload + HMAC
 */
async function buildCardBinary(
  payload: CardPayload,
  keys: CardCryptoKeys,
): Promise<Uint8Array> {
  const serialized = serialize(payload)
  const encrypted = await encrypt(serialized, keys.encryptionKey)
  const hmac = await generateHMAC(encrypted, keys.hmacKey)
  const combined = new Uint8Array(encrypted.length + hmac.length)
  combined.set(encrypted, 0)
  combined.set(hmac, encrypted.length)
  return combined
}

/** Captured write payload from mock */
let capturedWritePayload: Uint8Array | null = null

/**
 * Install a mock NDEFReader that reads the given binary data and
 * captures write payloads.
 */
function installMockNfc(options: {
  readData?: Uint8Array
  readError?: boolean
  writeResult?: 'success' | 'fail'
  noRecords?: boolean
}) {
  capturedWritePayload = null

  const MockNDEFReader = class {
    onreading: ((event: unknown) => void) | null = null
    onreadingerror: ((event: unknown) => void) | null = null

    async scan() {
      setTimeout(() => {
        if (options.readError && this.onreadingerror) {
          this.onreadingerror(new Event('readingerror'))
          return
        }
        if (this.onreading) {
          if (options.noRecords) {
            this.onreading({
              serialNumber: 'TEST-SERIAL',
              message: { records: [] },
            })
            return
          }
          if (options.readData) {
            const dataView = new DataView(
              options.readData.buffer,
              options.readData.byteOffset,
              options.readData.byteLength,
            )
            this.onreading({
              serialNumber: 'TEST-SERIAL',
              message: {
                records: [{ recordType: 'unknown', data: dataView }],
              },
            })
          }
        }
      }, 0)
    }

    async write(message: { records: Array<{ data?: unknown }> }) {
      if (options.writeResult === 'fail') {
        throw new DOMException('Card removed', 'NotReadableError')
      }
      // Capture the written payload
      const record = message.records[0]
      if (record?.data instanceof Uint8Array) {
        capturedWritePayload = record.data
      }
    }

    addEventListener() {}
    removeEventListener() {}
  }

  ;(globalThis as Record<string, unknown>).NDEFReader = MockNDEFReader
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('executeCardPipeline (6.4)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).NDEFReader
    capturedWritePayload = null
  })

  it('executes full check-in pipeline successfully', async () => {
    const keys = await createTestKeys()
    const payload = createTestPayload()
    const cardBinary = await buildCardBinary(payload, keys)

    installMockNfc({ readData: cardBinary, writeResult: 'success' })

    const checkIn: CardOperationFn = (p, config) => {
      return {
        success: true,
        payload: { ...p, status: 1, lastIn: 1000 },
        transaction: {
          type: 'CHECKIN',
          amount: 0,
          balanceBefore: p.bal,
          balanceAfter: p.bal,
          occurredAt: 1000,
        },
      }
    }

    const result = await executeCardPipeline(checkIn, TEST_CONFIG, keys)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.transaction.transaction.type).toBe('CHECKIN')
    }
  })

  it('returns error when NFC is not supported', async () => {
    // No mock installed — NFC not available
    const keys = await createTestKeys()

    const operation: CardOperationFn = () => ({
      success: false,
      error: 'Should not be called',
      code: 'UNEXPECTED',
    })

    const result = await executeCardPipeline(operation, TEST_CONFIG, keys)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_NOT_SUPPORTED')
    }
  })

  it('returns error when NFC read fails', async () => {
    const keys = await createTestKeys()
    installMockNfc({ readError: true })

    const operation: CardOperationFn = () => ({
      success: false,
      error: 'Should not be called',
      code: 'UNEXPECTED',
    })

    const result = await executeCardPipeline(operation, TEST_CONFIG, keys)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_READ_ERROR')
    }
  })

  it('returns error when card data is too short', async () => {
    const keys = await createTestKeys()
    // Data shorter than HMAC_SHA256_SIZE (32 bytes)
    installMockNfc({ readData: new Uint8Array(10), writeResult: 'success' })

    const operation: CardOperationFn = () => ({
      success: false,
      error: 'Should not be called',
      code: 'UNEXPECTED',
    })

    const result = await executeCardPipeline(operation, TEST_CONFIG, keys)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INVALID_CARD_DATA')
    }
  })

  it('returns error when HMAC verification fails (tampered data)', async () => {
    const keys = await createTestKeys()
    const payload = createTestPayload()
    const cardBinary = await buildCardBinary(payload, keys)

    // Tamper with the encrypted data portion
    cardBinary[5] ^= 0xff

    installMockNfc({ readData: cardBinary, writeResult: 'success' })

    const operation: CardOperationFn = () => ({
      success: false,
      error: 'Should not be called',
      code: 'UNEXPECTED',
    })

    const result = await executeCardPipeline(operation, TEST_CONFIG, keys)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('HMAC_VERIFICATION_FAILED')
      expect(result.error).toContain('integrity check failed')
    }
  })

  it('returns error when decryption fails (wrong key)', async () => {
    const keys = await createTestKeys()
    const wrongKeys = await createTestKeys()
    const payload = createTestPayload()

    // Encrypt with wrong encryption key but sign HMAC with correct key
    const serialized = serialize(payload)
    const encrypted = await encrypt(serialized, wrongKeys.encryptionKey)
    const hmac = await generateHMAC(encrypted, keys.hmacKey)
    const combined = new Uint8Array(encrypted.length + hmac.length)
    combined.set(encrypted, 0)
    combined.set(hmac, encrypted.length)

    installMockNfc({ readData: combined, writeResult: 'success' })

    const operation: CardOperationFn = () => ({
      success: false,
      error: 'Should not be called',
      code: 'UNEXPECTED',
    })

    const result = await executeCardPipeline(operation, TEST_CONFIG, keys)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('DECRYPTION_FAILED')
    }
  })

  it('returns error when card operation fails', async () => {
    const keys = await createTestKeys()
    const payload = createTestPayload({ status: 1 }) // Already checked in
    const cardBinary = await buildCardBinary(payload, keys)

    installMockNfc({ readData: cardBinary, writeResult: 'success' })

    const failingOperation: CardOperationFn = () => ({
      success: false,
      error: 'Card already checked in.',
      code: 'ALREADY_CHECKED_IN',
    })

    const result = await executeCardPipeline(
      failingOperation,
      TEST_CONFIG,
      keys,
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ALREADY_CHECKED_IN')
    }
  })

  it('aborts transaction and returns error when NFC write fails', async () => {
    const keys = await createTestKeys()
    const payload = createTestPayload()
    const cardBinary = await buildCardBinary(payload, keys)

    installMockNfc({ readData: cardBinary, writeResult: 'fail' })

    const operation: CardOperationFn = (p) => ({
      success: true,
      payload: { ...p, status: 1, lastIn: 1000 },
      transaction: {
        type: 'CHECKIN',
        amount: 0,
        balanceBefore: p.bal,
        balanceAfter: p.bal,
        occurredAt: 1000,
      },
    })

    const result = await executeCardPipeline(operation, TEST_CONFIG, keys)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Transaction aborted')
    }
  })

  it('calls discardTransaction on write failure', async () => {
    const keys = await createTestKeys()
    const payload = createTestPayload()
    const cardBinary = await buildCardBinary(payload, keys)

    installMockNfc({ readData: cardBinary, writeResult: 'fail' })

    const discard = vi.fn().mockResolvedValue(undefined)

    const operation: CardOperationFn = (p) => ({
      success: true,
      payload: { ...p, status: 1, lastIn: 1000 },
      transaction: {
        type: 'CHECKIN',
        amount: 0,
        balanceBefore: p.bal,
        balanceAfter: p.bal,
        occurredAt: 1000,
      },
    })

    await executeCardPipeline(operation, TEST_CONFIG, keys, {
      discardTransaction: discard,
    })

    expect(discard).toHaveBeenCalledOnce()
  })

  it('does not call discardTransaction on successful write', async () => {
    const keys = await createTestKeys()
    const payload = createTestPayload()
    const cardBinary = await buildCardBinary(payload, keys)

    installMockNfc({ readData: cardBinary, writeResult: 'success' })

    const discard = vi.fn().mockResolvedValue(undefined)

    const operation: CardOperationFn = (p) => ({
      success: true,
      payload: { ...p, status: 1, lastIn: 1000 },
      transaction: {
        type: 'CHECKIN',
        amount: 0,
        balanceBefore: p.bal,
        balanceAfter: p.bal,
        occurredAt: 1000,
      },
    })

    const result = await executeCardPipeline(operation, TEST_CONFIG, keys, {
      discardTransaction: discard,
    })

    expect(result.success).toBe(true)
    expect(discard).not.toHaveBeenCalled()
  })

  it('returns error when card has no NDEF records', async () => {
    const keys = await createTestKeys()
    installMockNfc({ noRecords: true })

    const operation: CardOperationFn = () => ({
      success: false,
      error: 'Should not be called',
      code: 'UNEXPECTED',
    })

    const result = await executeCardPipeline(operation, TEST_CONFIG, keys)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_NO_RECORDS')
    }
  })
})
