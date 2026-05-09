/**
 * NFC Card Operations — Shared Types
 *
 * Type definitions for the on-card payload schema, transaction log entries,
 * and card operation results used across all card operation modules.
 */

// ─── On-Card Payload Schema ─────────────────────────────────────────────────

/**
 * Transaction log entry stored on the NFC card.
 * Part of the rolling 5-entry FIFO buffer.
 */
export interface TransactionLogEntry {
  /** Unix timestamp of the transaction */
  t: number
  /** Action type */
  a: 'TOPUP' | 'CHECKIN' | 'EXIT'
  /** Value: positive for top-up, negative for deduction */
  v: number
}

/**
 * Card payload stored on the NFC card.
 * This is the decrypted, deserialized representation of the card data.
 */
export interface CardPayload {
  /** Schema version (currently 1) */
  v: number
  /** Tenant ID (e.g., "KOP-001") */
  tid: string
  /** Member ID (e.g., "MBC-8829") */
  id: string
  /** Balance in Rupiah (0 to maxBalance) */
  bal: number
  /** Card status: 0 = Idle, 1 = Checked-In */
  status: 0 | 1
  /** Unix timestamp of last entry (0 if never checked in) */
  lastIn: number
  /** Rolling transaction log buffer (max 5 entries) */
  logs: TransactionLogEntry[]
}

// ─── Card Operation Results ─────────────────────────────────────────────────

/**
 * Server-side transaction record generated from a card operation.
 * Queued for sync when the terminal is online.
 */
export interface TransactionRecord {
  type: 'CHECKIN' | 'EXIT' | 'TOPUP'
  amount: number
  balanceBefore: number
  balanceAfter: number
  occurredAt: number
  entryTime?: number
  exitTime?: number
  durationHours?: number
  topUpSource?: string
}

/**
 * Result of a card operation (check-in, check-out, top-up, etc.).
 * Discriminated union: success includes updated payload + transaction record,
 * failure includes error message and machine-readable code.
 */
export type CardOperationResult =
  | { success: true; payload: CardPayload; transaction: TransactionRecord }
  | { success: false; error: string; code: string }

// ─── Configuration Types ────────────────────────────────────────────────────

/**
 * Tenant configuration needed for card operations.
 * Cached locally on terminals for offline operation.
 */
export interface TenantCardConfig {
  tid: string
  tariffRatePerHour: number
  maxBalance: number
  minBalanceForEntry: number
}

/** Current schema version for card payloads */
export const CURRENT_SCHEMA_VERSION = 1

/** Maximum number of transaction log entries on a card */
export const MAX_LOG_ENTRIES = 5

/** Maximum serialized + encrypted + HMAC payload size in bytes */
export const MAX_PAYLOAD_SIZE = 256

/** AES-GCM IV size in bytes */
export const AES_GCM_IV_SIZE = 12

/** HMAC-SHA256 hash size in bytes */
export const HMAC_SHA256_SIZE = 32

/** AES-GCM auth tag size in bytes (included in ciphertext by Web Crypto) */
export const AES_GCM_TAG_SIZE = 16
