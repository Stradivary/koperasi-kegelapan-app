/**
 * Web NFC Integration Layer — Types
 *
 * Type definitions for the NFC integration layer including Web NFC API
 * type declarations (not available in standard TypeScript libs) and
 * NFC-specific result types.
 *
 * Requirements: 4.1, 5.1, 6.1, 7.1, 7.2, 15.3
 */

import type {
  CardPayload,
  CardOperationResult,
  TenantCardConfig,
} from '#/lib/card/types.ts'

// ─── Web NFC API Type Declarations ──────────────────────────────────────────
// These types are not in standard TypeScript libs. They mirror the Web NFC spec
// available in Chrome/Edge on Android and via USB readers (ACR122U).

export interface NDEFReadingEvent extends Event {
  serialNumber: string
  message: NDEFMessage
}

export interface NDEFMessage {
  records: NDEFRecord[]
}

export interface NDEFRecord {
  recordType: string
  mediaType?: string
  id?: string
  data?: DataView
  encoding?: string
  lang?: string
}

export interface NDEFWriteOptions {
  overwrite?: boolean
  signal?: AbortSignal
}

export interface NDEFScanOptions {
  signal?: AbortSignal
}

export interface NDEFMessageInit {
  records: NDEFRecordInit[]
}

export interface NDEFRecordInit {
  recordType: string
  mediaType?: string
  id?: string
  data?: ArrayBuffer | Uint8Array | DataView | string
  encoding?: string
  lang?: string
}

/**
 * Web NFC NDEFReader interface.
 * Used for both reading and writing NFC cards.
 */
export interface NDEFReader {
  scan(options?: NDEFScanOptions): Promise<void>
  write(
    message: NDEFMessageInit,
    options?: NDEFWriteOptions,
  ): Promise<void>
  onreading: ((event: NDEFReadingEvent) => void) | null
  onreadingerror: ((event: Event) => void) | null
  addEventListener(
    type: 'reading',
    listener: (event: NDEFReadingEvent) => void,
  ): void
  addEventListener(type: 'readingerror', listener: (event: Event) => void): void
  removeEventListener(
    type: 'reading',
    listener: (event: NDEFReadingEvent) => void,
  ): void
  removeEventListener(
    type: 'readingerror',
    listener: (event: Event) => void,
  ): void
}

export interface NDEFReaderConstructor {
  new (): NDEFReader
}

// ─── NFC Operation Result Types ─────────────────────────────────────────────

/** Result of an NFC read operation */
export type NfcReadResult =
  | { success: true; data: Uint8Array; serialNumber: string }
  | { success: false; error: string; code: NfcErrorCode }

/** Result of an NFC write operation */
export type NfcWriteResult =
  | { success: true }
  | { success: false; error: string; code: NfcErrorCode }

/** Machine-readable NFC error codes */
export type NfcErrorCode =
  | 'NFC_NOT_SUPPORTED'
  | 'NFC_PERMISSION_DENIED'
  | 'NFC_READ_ERROR'
  | 'NFC_WRITE_ERROR'
  | 'NFC_CARD_REMOVED'
  | 'NFC_NO_RECORDS'
  | 'NFC_ABORTED'

/** Operation function signature for the pipeline */
export type CardOperationFn = (
  payload: CardPayload,
  config: TenantCardConfig,
) => CardOperationResult

/** Keys needed for card crypto operations */
export interface CardCryptoKeys {
  /** Active AES-GCM encryption key */
  encryptionKey: CryptoKey
  /** Rotating AES-GCM key during key rotation (null if not rotating) */
  rotatingEncryptionKey: CryptoKey | null
  /** HMAC-SHA256 key for tamper-evident hashing */
  hmacKey: CryptoKey
}

/** Full pipeline result including the transaction record */
export type PipelineResult =
  | {
      success: true
      transaction: CardOperationResult & { success: true }
    }
  | {
      success: false
      error: string
      code: string
    }
