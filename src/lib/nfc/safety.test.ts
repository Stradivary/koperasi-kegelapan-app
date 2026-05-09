/**
 * Tests for NFC Write Failure Safety
 * Covers: 6.3 (abort transaction and discard queued transaction on write error)
 */

import { describe, it, expect, vi } from 'vitest'
import { handleWriteFailure, safeWrite } from './safety.ts'

describe('handleWriteFailure (6.3)', () => {
  it('returns pipeline error from write failure', async () => {
    const result = await handleWriteFailure({
      success: false,
      error: 'Card was removed during write.',
      code: 'NFC_CARD_REMOVED',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NFC_CARD_REMOVED')
      expect(result.error).toContain('Transaction aborted')
      expect(result.error).toContain('Card was removed')
    }
  })

  it('calls discardTransaction callback on write failure', async () => {
    const discard = vi.fn().mockResolvedValue(undefined)

    await handleWriteFailure(
      {
        success: false,
        error: 'Write failed.',
        code: 'NFC_WRITE_ERROR',
      },
      discard,
    )

    expect(discard).toHaveBeenCalledOnce()
  })

  it('handles discardTransaction callback failure gracefully', async () => {
    const discard = vi.fn().mockRejectedValue(new Error('Discard failed'))

    const result = await handleWriteFailure(
      {
        success: false,
        error: 'Write failed.',
        code: 'NFC_WRITE_ERROR',
      },
      discard,
    )

    // Should still return the write failure, not throw
    expect(result.success).toBe(false)
    expect(discard).toHaveBeenCalledOnce()
  })

  it('works without discardTransaction callback', async () => {
    const result = await handleWriteFailure({
      success: false,
      error: 'Write failed.',
      code: 'NFC_WRITE_ERROR',
    })

    expect(result.success).toBe(false)
  })
})

describe('safeWrite (6.3)', () => {
  it('returns success when write succeeds', async () => {
    const writeFn = vi.fn().mockResolvedValue({ success: true })

    const result = await safeWrite(writeFn)

    expect(result.success).toBe(true)
  })

  it('calls discardTransaction when write fails', async () => {
    const writeFn = vi.fn().mockResolvedValue({
      success: false,
      error: 'Card removed.',
      code: 'NFC_CARD_REMOVED',
    })
    const discard = vi.fn().mockResolvedValue(undefined)

    const result = await safeWrite(writeFn, discard)

    expect(result.success).toBe(false)
    expect(discard).toHaveBeenCalledOnce()
  })

  it('does not call discardTransaction when write succeeds', async () => {
    const writeFn = vi.fn().mockResolvedValue({ success: true })
    const discard = vi.fn().mockResolvedValue(undefined)

    await safeWrite(writeFn, discard)

    expect(discard).not.toHaveBeenCalled()
  })

  it('handles discardTransaction failure gracefully on write failure', async () => {
    const writeFn = vi.fn().mockResolvedValue({
      success: false,
      error: 'Write failed.',
      code: 'NFC_WRITE_ERROR',
    })
    const discard = vi.fn().mockRejectedValue(new Error('Discard failed'))

    // Should not throw
    const result = await safeWrite(writeFn, discard)

    expect(result.success).toBe(false)
    expect(discard).toHaveBeenCalledOnce()
  })
})
