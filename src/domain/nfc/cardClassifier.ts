/**
 * Card Classifier for the Generic NFC Layer
 *
 * This module provides card classification functionality that determines
 * the type of NFC card based on its raw data and NDEF records.
 *
 * Classification Logic:
 * 1. No NDEF records → "empty"
 * 2. Has records but rawBytes is null → "unknown"
 * 3. Magic bytes ≠ 0x4b4f5057 → "foreign"
 * 4. Magic bytes match but structure invalid → "invalid_format"
 * 5. Magic bytes match and structure valid → "valid_payload"
 *
 * @module core/nfc/cardClassifier
 * @see Requirements 1.3, 1.4, 2.2, 2.3, 2.4, 2.5
 */

import type { NfcRecord } from "./adapters/types";
import type { CardClassification } from "./types";
import { MAGIC, WIRE_SIZE, CARD_SCHEMA_VERSION } from "../payload/types";

/**
 * Minimum valid payload size.
 * The wire format is BUFFER_SIZE (216) + TRAILER_SIZE (64) = 280 bytes.
 */
const MIN_PAYLOAD_SIZE = WIRE_SIZE;

/**
 * Maximum supported schema version.
 * Cards with versions higher than this are considered invalid.
 */
const MAX_SUPPORTED_VERSION = CARD_SCHEMA_VERSION;

/**
 * Classifies an NFC card based on its raw bytes and NDEF records.
 *
 * This is a pure function with no side effects that determines the
 * card type for UI decision-making and further processing.
 *
 * @param rawBytes - Raw bytes from the first valid NDEF record, or null if no data
 * @param records - All NDEF records from the tag
 * @returns The card classification
 *
 * @example
 * ```typescript
 * // Empty card (no NDEF records)
 * classify(null, []) // → "empty"
 *
 * // Foreign card (wrong magic bytes)
 * classify(new Uint8Array([0x00, 0x01, 0x02, 0x03]), [{ recordType: "unknown", data: ... }])
 * // → "foreign"
 *
 * // Valid payload
 * classify(validPayloadBytes, [{ recordType: "unknown", data: validPayloadBytes }])
 * // → "valid_payload"
 * ```
 *
 * @see Requirements 1.3, 1.4, 2.2, 2.3, 2.4, 2.5
 */
export function classify(rawBytes: Uint8Array | null, records: NfcRecord[]): CardClassification {
  // Step 1: Check for empty tags (no NDEF records)
  // Requirement 2.2: WHEN a card has no NDEF records, classify as "empty"
  if (records.length === 0) {
    return "empty";
  }

  // Step 2: Check if we have raw bytes to analyze
  // If we have records but no extractable raw bytes, it's unknown
  if (rawBytes === null) {
    return "unknown";
  }

  // Step 3: Check magic bytes
  // Requirement 2.3: WHEN magic bytes ≠ 0x4b4f5057, classify as "foreign"
  if (!hasMagicBytes(rawBytes)) {
    return "foreign";
  }

  // Step 4: Validate structure
  // Requirement 2.4: WHEN magic matches but structure invalid → "invalid_format"
  // Requirement 2.5: WHEN structure valid → "valid_payload"
  if (!isValidStructure(rawBytes)) {
    return "invalid_format";
  }

  return "valid_payload";
}

/**
 * Checks if the raw bytes start with the expected magic bytes (0x4b4f5057 = "KOPW").
 *
 * The magic bytes are stored in big-endian format at the start of the payload.
 *
 * @param rawBytes - The raw bytes to check
 * @returns true if the magic bytes match
 */
function hasMagicBytes(rawBytes: Uint8Array): boolean {
  // Need at least 4 bytes for magic
  if (rawBytes.length < 4) {
    return false;
  }

  // Read magic as big-endian uint32
  const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
  const magic = view.getUint32(0, false); // big-endian

  return magic === MAGIC;
}

/**
 * Validates the structural integrity of a card payload.
 *
 * This performs basic structural validation without cryptographic verification:
 * - Minimum size check (WIRE_SIZE = 280 bytes)
 * - Version byte validation
 * - Basic header structure
 *
 * Note: This does NOT validate HMAC, counter binding, or chain hash.
 * Those validations happen in the Payload Operation Layer after decryption.
 *
 * @param rawBytes - The raw bytes to validate
 * @returns true if the structure is valid
 */
function isValidStructure(rawBytes: Uint8Array): boolean {
  // Check minimum size
  if (rawBytes.length < MIN_PAYLOAD_SIZE) {
    return false;
  }

  // Check version byte (offset 4, after magic)
  const version = rawBytes[4];
  if (version === 0 || version > MAX_SUPPORTED_VERSION) {
    return false;
  }

  // Check type byte (offset 5) - should be 0 for standard cards
  const type = rawBytes[5];
  if (type !== 0) {
    return false;
  }

  // Check cardId exists (6 bytes at offset 6-11)
  // CardId should not be all zeros
  const cardIdStart = 6;
  const cardIdEnd = 12;
  let hasNonZeroCardId = false;
  for (let i = cardIdStart; i < cardIdEnd; i++) {
    if (rawBytes[i] !== 0) {
      hasNonZeroCardId = true;
      break;
    }
  }
  if (!hasNonZeroCardId) {
    return false;
  }

  return true;
}
