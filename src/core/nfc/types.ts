/**
 * Core NFC Types for the Unified NFC Scanner
 *
 * This module defines the core types for the Generic NFC Layer,
 * including raw scan results and card classification.
 *
 * @module core/nfc/types
 */

import type { NfcRecord } from "./adapters/types";

// ============================================================================
// Card Classification Types
// ============================================================================

/**
 * Classification of a scanned NFC card based on data analysis.
 *
 * - "empty": No NDEF data on the card
 * - "foreign": NDEF data present but wrong magic bytes (not our card format)
 * - "invalid_format": Correct magic bytes but structural validation failed
 * - "valid_payload": Valid CardPayload structure that can be processed
 * - "unknown": Unrecognized data format
 *
 * @see Requirements 1.1, 2.1
 */
export type CardClassification =
  | "empty" // No NDEF data
  | "foreign" // NDEF data but wrong magic bytes
  | "invalid_format" // Correct magic but structural validation failed
  | "valid_payload" // Valid CardPayload structure
  | "unknown"; // Unrecognized data format

// ============================================================================
// Write Phase Types
// ============================================================================

/**
 * Phases of an NFC write operation.
 *
 * - "preparing": Preparing the data to be written
 * - "waiting": Waiting for the user to tap the card
 * - "writing": Actively writing data to the card
 * - "complete": Write operation completed successfully
 *
 * @see Requirement 2.6
 */
export type WritePhase = "preparing" | "waiting" | "writing" | "complete";

// ============================================================================
// Raw NFC Result Types
// ============================================================================

/**
 * Metadata about the scanned NFC tag.
 */
export interface NfcTagMetadata {
  /** Number of NDEF records on the tag */
  recordCount: number;
  /** Total bytes of data on the tag */
  totalBytes: number;
  /** Whether the tag has NDEF data */
  hasNdef: boolean;
}

/**
 * Result of a raw NFC scan from the Generic NFC Layer.
 *
 * This interface represents the data returned from scanning any NFC tag,
 * before any payload-specific processing. It contains the raw data and
 * classification needed for the UI to decide how to handle the card.
 *
 * @see Requirement 1.1
 */
export interface RawNfcResult {
  /** Card serial number (UID) */
  serialNumber: string;

  /** Raw bytes from the first valid NDEF record, or null if no data */
  rawBytes: Uint8Array | null;

  /** All NDEF records from the tag */
  records: NfcRecord[];

  /** Card classification based on data analysis */
  classification: CardClassification;

  /** Tag metadata */
  metadata: NfcTagMetadata;
}
