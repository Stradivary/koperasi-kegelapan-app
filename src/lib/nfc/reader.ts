/**
 * Web NFC Integration Layer — Reader
 *
 * Wrapper around the Web NFC API (NDEFReader) for reading NDEF payloads
 * from NFC cards. Supports both Android built-in NFC and USB ACR122U
 * readers — both use the same Web NFC API surface.
 *
 * Requirements: 4.1, 5.1, 6.1
 */

import type {
  NDEFReader,
  NDEFReaderConstructor,
  NDEFReadingEvent,
  NfcReadResult,
} from './types.ts'

/**
 * Check whether the Web NFC API is available in the current browser.
 * Web NFC is supported in Chrome/Edge on Android. Not available on iOS
 * or desktop browsers without a USB NFC reader extension.
 *
 * @returns true if NDEFReader is available in the global scope
 */
export function isNfcSupported(): boolean {
  return typeof globalThis !== 'undefined' && 'NDEFReader' in globalThis
}

/**
 * Get the NDEFReader constructor from the global scope.
 * Returns null if Web NFC is not supported.
 */
function getNDEFReaderConstructor(): NDEFReaderConstructor | null {
  if (!isNfcSupported()) return null
  return (globalThis as unknown as { NDEFReader: NDEFReaderConstructor })
    .NDEFReader
}

/**
 * Read the raw binary payload from the first NDEF record on an NFC card.
 *
 * Initiates an NFC scan and resolves when a card is tapped and read
 * successfully. The scan can be cancelled via an AbortSignal.
 *
 * Works with both Android built-in NFC and USB ACR122U readers since
 * both expose the same Web NFC API.
 *
 * @param options.signal - Optional AbortSignal to cancel the scan
 * @returns NfcReadResult with the raw binary data and card serial number
 */
export async function readNfcCard(options?: {
  signal?: AbortSignal
}): Promise<NfcReadResult> {
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
    const reader: NDEFReader = new ReaderCtor()

    return await new Promise<NfcReadResult>((resolve) => {
      const cleanup = () => {
        reader.onreading = null
        reader.onreadingerror = null
      }

      // Handle abort signal
      if (options?.signal) {
        if (options.signal.aborted) {
          resolve({
            success: false,
            error: 'NFC scan was cancelled.',
            code: 'NFC_ABORTED',
          })
          return
        }
        options.signal.addEventListener(
          'abort',
          () => {
            cleanup()
            resolve({
              success: false,
              error: 'NFC scan was cancelled.',
              code: 'NFC_ABORTED',
            })
          },
          { once: true },
        )
      }

      reader.onreading = (event: NDEFReadingEvent) => {
        cleanup()

        const records = event.message.records
        if (!records || records.length === 0) {
          resolve({
            success: false,
            error: 'NFC card has no NDEF records.',
            code: 'NFC_NO_RECORDS',
          })
          return
        }

        const firstRecord = records[0]
        if (!firstRecord.data) {
          resolve({
            success: false,
            error: 'NFC card has no NDEF records.',
            code: 'NFC_NO_RECORDS',
          })
          return
        }

        // Extract raw binary data from the DataView
        const dataView = firstRecord.data
        const data = new Uint8Array(
          dataView.buffer,
          dataView.byteOffset,
          dataView.byteLength,
        )

        resolve({
          success: true,
          data,
          serialNumber: event.serialNumber,
        })
      }

      reader.onreadingerror = () => {
        cleanup()
        resolve({
          success: false,
          error: 'Failed to read NFC card. Please try again.',
          code: 'NFC_READ_ERROR',
        })
      }

      // Start scanning — this triggers the NFC permission prompt if needed
      reader.scan({ signal: options?.signal }).catch((err: unknown) => {
        cleanup()
        const message =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'NFC permission was denied. Please allow NFC access.'
            : 'Failed to start NFC scan. Please try again.'
        const code =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'NFC_PERMISSION_DENIED'
            : 'NFC_READ_ERROR'
        resolve({ success: false, error: message, code })
      })
    })
  } catch {
    return {
      success: false,
      error: 'Failed to initialize NFC reader. Please try again.',
      code: 'NFC_READ_ERROR',
    }
  }
}
