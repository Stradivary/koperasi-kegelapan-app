/**
 * Property-Based Tests for CardClassifier
 *
 * **Validates: Requirements 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5**
 *
 * Property 1: Classification Completeness and Correctness
 *
 * For any NFC tag data, the classification SHALL be exactly one of:
 * "empty", "invalid_format", "valid_payload", "unknown", or "foreign".
 *
 * Furthermore:
 * - For any tag with zero NDEF records, classification SHALL be "empty"
 * - For any tag with NDEF data where first 4 bytes ≠ MAGIC (0x4b4f5057), classification SHALL be "foreign"
 * - For any tag with valid magic but invalid structure, classification SHALL be "invalid_format"
 * - For any tag with valid magic and valid structure, classification SHALL be "valid_payload"
 *
 * @module core/nfc/__tests__/properties/classification.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { classify } from "../../cardClassifier";
import type { NfcRecord } from "../../adapters/types";
import type { CardClassification } from "../../types";
import { MAGIC, WIRE_SIZE, CARD_SCHEMA_VERSION } from "../../../payload/types";

// ============================================================================
// Constants
// ============================================================================

const VALID_CLASSIFICATIONS: CardClassification[] = [
  "empty",
  "foreign",
  "invalid_format",
  "valid_payload",
  "unknown",
];

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generates an arbitrary NfcRecord with random recordType and optional data.
 */
const arbitraryNfcRecord: fc.Arbitrary<NfcRecord> = fc.record({
  recordType: fc.string({ minLength: 0, maxLength: 20 }),
  data: fc.option(fc.uint8Array({ minLength: 0, maxLength: 500 }), { nil: null }),
});

/**
 * Generates an array of NfcRecords (can be empty).
 */
const arbitraryNfcRecords: fc.Arbitrary<NfcRecord[]> = fc.array(arbitraryNfcRecord, {
  minLength: 0,
  maxLength: 10,
});

/**
 * Generates arbitrary raw bytes (can be null or any byte array).
 */
const arbitraryRawBytes: fc.Arbitrary<Uint8Array | null> = fc.option(
  fc.uint8Array({ minLength: 0, maxLength: 500 }),
  { nil: null },
);

/**
 * Generates raw bytes that do NOT start with the magic bytes (0x4b4f5057).
 * Used to test "foreign" classification.
 */
const arbitraryNonMagicBytes: fc.Arbitrary<Uint8Array> = fc
  .uint8Array({ minLength: 4, maxLength: 500 })
  .filter((bytes) => {
    // Ensure the first 4 bytes don't match MAGIC (0x4b4f5057)
    if (bytes.length < 4) return true;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = view.getUint32(0, false); // big-endian
    return magic !== MAGIC;
  });

/**
 * Generates raw bytes with valid magic but invalid structure.
 * Invalid structure means:
 * - Size < WIRE_SIZE (280 bytes), OR
 * - Version byte is 0 or > CARD_SCHEMA_VERSION, OR
 * - Type byte is not 0, OR
 * - CardId is all zeros
 */
const arbitraryInvalidStructureBytes: fc.Arbitrary<Uint8Array> = fc.oneof(
  // Case 1: Valid magic but too short
  fc.integer({ min: 4, max: WIRE_SIZE - 1 }).map((length) => {
    const bytes = new Uint8Array(length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, MAGIC, false); // big-endian magic
    return bytes;
  }),
  // Case 2: Valid magic, correct size, but invalid version (0)
  fc.constant(null).map(() => {
    const bytes = new Uint8Array(WIRE_SIZE);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, MAGIC, false); // big-endian magic
    bytes[4] = 0; // invalid version
    bytes[5] = 0; // valid type
    // Set a non-zero cardId
    bytes[6] = 1;
    return bytes;
  }),
  // Case 3: Valid magic, correct size, but invalid version (too high)
  fc.constant(null).map(() => {
    const bytes = new Uint8Array(WIRE_SIZE);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, MAGIC, false); // big-endian magic
    bytes[4] = CARD_SCHEMA_VERSION + 1; // invalid version (too high)
    bytes[5] = 0; // valid type
    // Set a non-zero cardId
    bytes[6] = 1;
    return bytes;
  }),
  // Case 4: Valid magic, correct size, valid version, but invalid type
  fc.integer({ min: 1, max: 255 }).map((invalidType) => {
    const bytes = new Uint8Array(WIRE_SIZE);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, MAGIC, false); // big-endian magic
    bytes[4] = CARD_SCHEMA_VERSION; // valid version
    bytes[5] = invalidType; // invalid type (not 0)
    // Set a non-zero cardId
    bytes[6] = 1;
    return bytes;
  }),
  // Case 5: Valid magic, correct size, valid version, valid type, but all-zero cardId
  fc.constant(null).map(() => {
    const bytes = new Uint8Array(WIRE_SIZE);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, MAGIC, false); // big-endian magic
    bytes[4] = CARD_SCHEMA_VERSION; // valid version
    bytes[5] = 0; // valid type
    // CardId at bytes 6-11 is all zeros (default)
    return bytes;
  }),
);

/**
 * Generates raw bytes with valid magic AND valid structure.
 * Valid structure means:
 * - Size >= WIRE_SIZE (280 bytes)
 * - Version byte is 1 or 2 (valid versions)
 * - Type byte is 0
 * - CardId has at least one non-zero byte
 */
const arbitraryValidPayloadBytes: fc.Arbitrary<Uint8Array> = fc
  .tuple(
    fc.integer({ min: WIRE_SIZE, max: WIRE_SIZE + 100 }), // size
    fc.integer({ min: 1, max: CARD_SCHEMA_VERSION }), // version
    fc.uint8Array({ minLength: 6, maxLength: 6 }).filter((cardId) => {
      // Ensure at least one non-zero byte
      return cardId.some((b) => b !== 0);
    }),
  )
  .map(([size, version, cardId]) => {
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, MAGIC, false); // big-endian magic
    bytes[4] = version;
    bytes[5] = 0; // type = 0 for standard cards
    // Copy cardId to bytes 6-11
    bytes.set(cardId, 6);
    return bytes;
  });

/**
 * Generates at least one NfcRecord (non-empty array).
 */
const arbitraryNonEmptyRecords: fc.Arbitrary<NfcRecord[]> = fc.array(arbitraryNfcRecord, {
  minLength: 1,
  maxLength: 10,
});

// ============================================================================
// Property Tests
// ============================================================================

describe("CardClassifier Property Tests", () => {
  describe("Property 1: Classification Completeness and Correctness", () => {
    /**
     * **Validates: Requirements 1.3, 1.4, 2.1**
     *
     * For any NFC tag data, the classification SHALL be exactly one of the valid types.
     */
    it("should always return exactly one of the valid classification types", () => {
      fc.assert(
        fc.property(arbitraryRawBytes, arbitraryNfcRecords, (rawBytes, records) => {
          const classification = classify(rawBytes, records);

          // Classification must be one of the valid types
          expect(VALID_CLASSIFICATIONS).toContain(classification);
        }),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirement 2.2**
     *
     * For any tag with zero NDEF records, classification SHALL be "empty".
     */
    it("should classify tags with zero NDEF records as 'empty'", () => {
      fc.assert(
        fc.property(arbitraryRawBytes, (rawBytes) => {
          const emptyRecords: NfcRecord[] = [];
          const classification = classify(rawBytes, emptyRecords);

          expect(classification).toBe("empty");
        }),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirement 2.3**
     *
     * For any tag with NDEF data where first 4 bytes ≠ MAGIC (0x4b4f5057),
     * classification SHALL be "foreign".
     */
    it("should classify tags with wrong magic bytes as 'foreign'", () => {
      fc.assert(
        fc.property(arbitraryNonMagicBytes, arbitraryNonEmptyRecords, (rawBytes, records) => {
          const classification = classify(rawBytes, records);

          expect(classification).toBe("foreign");
        }),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirement 2.4**
     *
     * For any tag with valid magic but invalid structure,
     * classification SHALL be "invalid_format".
     */
    it("should classify tags with valid magic but invalid structure as 'invalid_format'", () => {
      fc.assert(
        fc.property(
          arbitraryInvalidStructureBytes,
          arbitraryNonEmptyRecords,
          (rawBytes, records) => {
            const classification = classify(rawBytes, records);

            expect(classification).toBe("invalid_format");
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirement 2.5**
     *
     * For any tag with valid magic and valid structure,
     * classification SHALL be "valid_payload".
     */
    it("should classify tags with valid magic and valid structure as 'valid_payload'", () => {
      fc.assert(
        fc.property(arbitraryValidPayloadBytes, arbitraryNonEmptyRecords, (rawBytes, records) => {
          const classification = classify(rawBytes, records);

          expect(classification).toBe("valid_payload");
        }),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirement 1.4**
     *
     * When records exist but rawBytes is null, classification SHALL be "unknown".
     */
    it("should classify tags with records but null rawBytes as 'unknown'", () => {
      fc.assert(
        fc.property(arbitraryNonEmptyRecords, (records) => {
          const classification = classify(null, records);

          expect(classification).toBe("unknown");
        }),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 2.1, 2.3**
     *
     * For any tag with rawBytes shorter than 4 bytes (cannot contain magic),
     * classification SHALL be "foreign" (if records exist).
     */
    it("should classify tags with rawBytes shorter than 4 bytes as 'foreign'", () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 1, maxLength: 3 }),
          arbitraryNonEmptyRecords,
          (rawBytes, records) => {
            const classification = classify(rawBytes, records);

            expect(classification).toBe("foreign");
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
