/**
 * Web NFC Integration Layer — Writer
 *
 * Wrapper around the Web NFC API (NDEFReader.write) for writing NDEF
 * payloads to NFC cards with error detection for card-removed-during-write
 * and other communication failures.
 *
 * Requirements: 15.3
 */

import type {
  NDEFReader,
  NDEFReaderConstructor,
  NfcWriteResult,
} from './types.ts'
import { isNfcSupported } from './reader.ts'

/**
 * Get the NDEFReader constructor from the global scope.
 */
function getNDEFReaderConstructor(): NDEFReaderConstructor | null {
  if (!isNfcSupported()) return null
  return (globalThis as unknown as { NDEFReader: NDEFReaderConstructor })
    .NDEFReader
}

/**
 * Write a binary payload to an NFC card as an NDEF record.
 *
 * Detects write failures including:
 * - Card removed during write
 * - NFC communication errors
 * - Permission denied
 *
 * The write uses recordType "unknown" for raw binary data, matching
 * the card payload format (encrypted data + HMAC).
 *
 * @param payload - Binary data to write to the card
 * @param options.signal - Optional AbortSignal to cancel the write
 * @returns NfcWriteResult indicating success or failure with error details
 */
export async function writeNfcCard(
  payload: Uint8Array,
  options?: { signal?: AbortSignal },
): Promise<NfcWriteResult> {
  const ReaderCtor = getNDEFReaderConstructor()
  if (!ReaderCtor) {
    return {
      success: false,
      error:
        'Web NFC is not supported on this device. Use Chrome/Edge on Android or a USB NFC reader.',
      code: 'NFC_NOT_SUPPORTED',
    }
  }

  try {
    const writer: NDEFReader = new ReaderCtor()

    await writer.write(
      {
        records: [
          {
            recordType: 'unknown',
            data: payload,
          },
        ],
      },
      {
        overwrite: true,
        signal: options?.signal,
      },
    )

    return { success: true }
  } catch (err: unknown) {
    if (err instanceof DOMException) {
      switch (err.name) {
        case 'NotAllowedError':
          return {
            success: false,
            error: 'NFC permission was denied. Please allow NFC access.',
            code: 'NFC_PERMISSION_DENIED',
          }
        case 'AbortError':
          return {
            success: false,
            error: 'NFC write was cancelled.',
            code: 'NFC_ABORTED',
          }
        case 'NotReadableError':
          // Card removed during write or communication error
          return {
            success: false,
            error:
              'Card was removed during write or NFC communication failed. The card retains its previous data. Please try again.',
            code: 'NFC_CARD_REMOVED',
          }
        case 'NetworkError':
          // NFC communication failure
          return {
            success: false,
            error:
              'NFC communication error. The card may have been removed. Please try again.',
            code: 'NFC_WRITE_ERROR',
          }
        default:
          return {
            success: false,
            error: `NFC write failed: ${err.message}`,
            code: 'NFC_WRITE_ERROR',
          }
      }
    }

    return {
      success: false,
      error: 'NFC write failed. Please try again.',
      code: 'NFC_WRITE_ERROR',
    }
  }
}
