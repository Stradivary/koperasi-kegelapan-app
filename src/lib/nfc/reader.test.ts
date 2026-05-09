/**
 * Tests for Web NFC Reader wrapper
 * Covers: 6.1 (NFC read wrapper)
 *
 * Since Web NFC is not available in Node.js, we mock the NDEFReader API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isNfcSupported, readNfcCard } from './reader.ts'

// ─── Mock NDEFReader ────────────────────────────────────────────────────────

function createMockNDEFReader(behavior: {
  scanResult?: 'success' | 'permission-denied' | 'error'
  readingEvent?: {
    serialNumber: string
    records: Array<{ recordType: string; data?: DataView }>
  }
  readingError?: boolean
}) {
  return class MockNDEFReader {
    onreading: ((event: unknown) => void) | null = null
    onreadingerror: ((event: unknown) => void) | null = null

    async scan(_options?: { signal?: AbortSignal }) {
      if (behavior.scanResult === 'permission-denied') {
        const err = new DOMException('Not allowed', 'NotAllowedError')
        throw err
      }
      if (behavior.scanResult === 'error') {
        throw new Error('Scan failed')
      }

      // Simulate async card tap
      setTimeout(() => {
        if (behavior.readingError && this.onreadingerror) {
          this.onreadingerror(new Event('readingerror'))
        } else if (behavior.readingEvent && this.onreading) {
          this.onreading({
            serialNumber: behavior.readingEvent.serialNumber,
            message: { records: behavior.readingEvent.records },
          })
        }
      }, 0)
    }

    async write() {
      // Not used in reader tests
    }

    addEventListener() {}
    removeEventListener() {}
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('isNfcSupported', () => {
  afterEach(() => {
    // Clean up global mock
    delete (globalThis as Record<string, unknown>).NDEFReader
  })

  it('returns false when NDEFReader is not in globalThis', () => {
    expect(isNfcSupported()).toBe(false)
  })

  it('returns true when NDEFReader is in globalThis', () => {
    ;(globalThis as Record<string, unknown>).NDEFReader =
      createMockNDEFReader({ scanResult: 'success' })
    expect(isNfcSupported()).toBe(true)
  })
})

describe('readNfcCard (6.1)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).NDEFReader
  })

  it('returns NFC_NOT_SUPPORTED when Web NFC is unavailable', async () => {
    const result = await readNfcCard()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_NOT_SUPPORTED')
    }
  })

  it('reads binary payload from first NDEF record', async () => {
    const testData = new Uint8Array([1, 2, 3, 4, 5])
    const dataView = new DataView(
      testData.buffer,
      testData.byteOffset,
      testData.byteLength,
    )

    ;(globalThis as Record<string, unknown>).NDEFReader =
      createMockNDEFReader({
        scanResult: 'success',
        readingEvent: {
          serialNumber: 'ABC123',
          records: [{ recordType: 'unknown', data: dataView }],
        },
      })

    const result = await readNfcCard()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(testData)
      expect(result.serialNumber).toBe('ABC123')
    }
  })

  it('returns NFC_NO_RECORDS when card has no records', async () => {
    ;(globalThis as Record<string, unknown>).NDEFReader =
      createMockNDEFReader({
        scanResult: 'success',
        readingEvent: {
          serialNumber: 'ABC123',
          records: [],
        },
      })

    const result = await readNfcCard()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_NO_RECORDS')
    }
  })

  it('returns NFC_NO_RECORDS when first record has no data', async () => {
    ;(globalThis as Record<string, unknown>).NDEFReader =
      createMockNDEFReader({
        scanResult: 'success',
        readingEvent: {
          serialNumber: 'ABC123',
          records: [{ recordType: 'unknown' }],
        },
      })

    const result = await readNfcCard()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_NO_RECORDS')
    }
  })

  it('returns NFC_READ_ERROR on reading error', async () => {
    ;(globalThis as Record<string, unknown>).NDEFReader =
      createMockNDEFReader({
        scanResult: 'success',
        readingError: true,
      })

    const result = await readNfcCard()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_READ_ERROR')
    }
  })

  it('returns NFC_PERMISSION_DENIED when scan permission is denied', async () => {
    ;(globalThis as Record<string, unknown>).NDEFReader =
      createMockNDEFReader({ scanResult: 'permission-denied' })

    const result = await readNfcCard()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_PERMISSION_DENIED')
    }
  })

  it('returns NFC_ABORTED when signal is already aborted', async () => {
    ;(globalThis as Record<string, unknown>).NDEFReader =
      createMockNDEFReader({ scanResult: 'success' })

    const controller = new AbortController()
    controller.abort()

    const result = await readNfcCard({ signal: controller.signal })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_ABORTED')
    }
  })
})
