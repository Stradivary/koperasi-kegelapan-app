/**
 * Tests for Web NFC Writer wrapper
 * Covers: 6.2 (NFC write wrapper with error detection)
 *
 * Since Web NFC is not available in Node.js, we mock the NDEFReader API.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { writeNfcCard } from './writer.ts'

// ─── Mock NDEFReader for write operations ───────────────────────────────────

function createMockWriter(behavior: {
  writeResult?: 'success' | 'not-readable' | 'network-error' | 'not-allowed' | 'abort' | 'generic-error'
}) {
  return class MockNDEFReader {
    onreading = null
    onreadingerror = null

    async scan() {}

    async write() {
      switch (behavior.writeResult) {
        case 'success':
          return
        case 'not-readable':
          throw new DOMException('Card removed', 'NotReadableError')
        case 'network-error':
          throw new DOMException('Communication failed', 'NetworkError')
        case 'not-allowed':
          throw new DOMException('Permission denied', 'NotAllowedError')
        case 'abort':
          throw new DOMException('Aborted', 'AbortError')
        case 'generic-error':
          throw new DOMException('Unknown error', 'UnknownError')
        default:
          return
      }
    }

    addEventListener() {}
    removeEventListener() {}
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('writeNfcCard (6.2)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).NDEFReader
  })

  it('returns NFC_NOT_SUPPORTED when Web NFC is unavailable', async () => {
    const result = await writeNfcCard(new Uint8Array([1, 2, 3]))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_NOT_SUPPORTED')
    }
  })

  it('writes payload successfully', async () => {
    ;(globalThis as Record<string, unknown>).NDEFReader =
      createMockWriter({ writeResult: 'success' })

    const result = await writeNfcCard(new Uint8Array([1, 2, 3, 4]))
    expect(result.success).toBe(true)
  })

  it('detects card removed during write (NotReadableError)', async () => {
    ;(globalThis as Record<string, unknown>).NDEFReader =
      createMockWriter({ writeResult: 'not-readable' })

    const result = await writeNfcCard(new Uint8Array([1, 2, 3]))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_CARD_REMOVED')
      expect(result.error).toContain('removed')
    }
  })

  it('detects NFC communication error (NetworkError)', async () => {
    ;(globalThis as Record<string, unknown>).NDEFReader =
      createMockWriter({ writeResult: 'network-error' })

    const result = await writeNfcCard(new Uint8Array([1, 2, 3]))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_WRITE_ERROR')
    }
  })

  it('detects permission denied', async () => {
    ;(globalThis as Record<string, unknown>).NDEFReader =
      createMockWriter({ writeResult: 'not-allowed' })

    const result = await writeNfcCard(new Uint8Array([1, 2, 3]))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_PERMISSION_DENIED')
    }
  })

  it('detects abort', async () => {
    ;(globalThis as Record<string, unknown>).NDEFReader =
      createMockWriter({ writeResult: 'abort' })

    const result = await writeNfcCard(new Uint8Array([1, 2, 3]))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_ABORTED')
    }
  })

  it('handles generic DOMException errors', async () => {
    ;(globalThis as Record<string, unknown>).NDEFReader =
      createMockWriter({ writeResult: 'generic-error' })

    const result = await writeNfcCard(new Uint8Array([1, 2, 3]))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_WRITE_ERROR')
    }
  })
})
