/**
 * Unit tests for CardClassifier
 *
 * Tests the card classification logic for the Generic NFC Layer.
 *
 * @see Requirements 1.3, 1.4, 2.2, 2.3, 2.4, 2.5
 */

import { describe, it, expect } from "vitest";
import { classify } from "./cardClassifier";
import type { NfcRecord } from "./adapters/types";
import { MAGIC, WIRE_SIZE, CARD_SCHEMA_VERSION } from "../payload/types";

// Helper to create a valid payload structure
function createValidPayload(): Uint8Array {
  const bytes = new Uint8Array(WIRE_SIZE);
  const view = new DataView(bytes.buffer);

  // Magic bytes (big-endian)
  view.setUint32(0, MAGIC, false);

  // Version
  bytes[4] = CARD_SCHEMA_VERSION;

  // Type (0 for standard)
  bytes[5] = 0;

  // CardId (6 bytes, non-zero)
  bytes[6] = 0x01;
  bytes[7] = 0x02;
  bytes[8] = 0x03;
  bytes[9] = 0x04;
  bytes[10] = 0x05;
  bytes[11] = 0x06;

  return bytes;
}

// Helper to create a record
function createRecord(data: Uint8Array | null): NfcRecord {
  return { recordType: "unknown", data };
}

describe("CardClassifier", () => {
  describe("classify()", () => {
    describe("empty classification", () => {
      it("should classify as 'empty' when there are no NDEF records", () => {
        const result = classify(null, []);
        expect(result).toBe("empty");
      });

      it("should classify as 'empty' when records array is empty regardless of rawBytes", () => {
        // Even if rawBytes is provided, empty records means empty card
        const result = classify(new Uint8Array([1, 2, 3]), []);
        expect(result).toBe("empty");
      });
    });

    describe("unknown classification", () => {
      it("should classify as 'unknown' when records exist but rawBytes is null", () => {
        const records: NfcRecord[] = [createRecord(null)];
        const result = classify(null, records);
        expect(result).toBe("unknown");
      });

      it("should classify as 'unknown' with multiple records but null rawBytes", () => {
        const records: NfcRecord[] = [createRecord(null), createRecord(new Uint8Array([1, 2, 3]))];
        const result = classify(null, records);
        expect(result).toBe("unknown");
      });
    });

    describe("foreign classification", () => {
      it("should classify as 'foreign' when magic bytes do not match", () => {
        const bytes = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x01, 0x00]);
        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("foreign");
      });

      it("should classify as 'foreign' when rawBytes is too short for magic", () => {
        const bytes = new Uint8Array([0x4b, 0x4f, 0x50]); // Only 3 bytes
        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("foreign");
      });

      it("should classify as 'foreign' with random data", () => {
        const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02]);
        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("foreign");
      });

      it("should classify as 'foreign' with partial magic match", () => {
        // First 3 bytes match but 4th doesn't
        const bytes = new Uint8Array([0x4b, 0x4f, 0x50, 0x00, 0x01, 0x00]);
        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("foreign");
      });
    });

    describe("invalid_format classification", () => {
      it("should classify as 'invalid_format' when magic matches but size is too small", () => {
        // Magic bytes correct but not enough data
        const bytes = new Uint8Array(20);
        const view = new DataView(bytes.buffer);
        view.setUint32(0, MAGIC, false);
        bytes[4] = CARD_SCHEMA_VERSION;
        bytes[5] = 0;
        bytes[6] = 0x01; // Non-zero cardId

        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("invalid_format");
      });

      it("should classify as 'invalid_format' when version is 0", () => {
        const bytes = createValidPayload();
        bytes[4] = 0; // Invalid version

        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("invalid_format");
      });

      it("should classify as 'invalid_format' when version is too high", () => {
        const bytes = createValidPayload();
        bytes[4] = CARD_SCHEMA_VERSION + 1; // Unsupported version

        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("invalid_format");
      });

      it("should classify as 'invalid_format' when type is not 0", () => {
        const bytes = createValidPayload();
        bytes[5] = 1; // Invalid type

        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("invalid_format");
      });

      it("should classify as 'invalid_format' when cardId is all zeros", () => {
        const bytes = createValidPayload();
        // Zero out cardId
        for (let i = 6; i < 12; i++) {
          bytes[i] = 0;
        }

        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("invalid_format");
      });
    });

    describe("valid_payload classification", () => {
      it("should classify as 'valid_payload' with correct structure", () => {
        const bytes = createValidPayload();
        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("valid_payload");
      });

      it("should classify as 'valid_payload' with version 1", () => {
        const bytes = createValidPayload();
        bytes[4] = 1; // Version 1 is also valid

        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("valid_payload");
      });

      it("should classify as 'valid_payload' with current schema version", () => {
        const bytes = createValidPayload();
        bytes[4] = CARD_SCHEMA_VERSION;

        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("valid_payload");
      });

      it("should classify as 'valid_payload' with single non-zero cardId byte", () => {
        const bytes = createValidPayload();
        // Only one non-zero byte in cardId
        for (let i = 6; i < 12; i++) {
          bytes[i] = 0;
        }
        bytes[11] = 0x01; // Last byte non-zero

        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("valid_payload");
      });

      it("should classify as 'valid_payload' with larger than minimum size", () => {
        // Create a larger payload
        const bytes = new Uint8Array(WIRE_SIZE + 100);
        const view = new DataView(bytes.buffer);
        view.setUint32(0, MAGIC, false);
        bytes[4] = CARD_SCHEMA_VERSION;
        bytes[5] = 0;
        bytes[6] = 0x01;

        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("valid_payload");
      });
    });

    describe("edge cases", () => {
      it("should handle empty Uint8Array with records", () => {
        const bytes = new Uint8Array(0);
        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("foreign"); // No magic bytes
      });

      it("should handle exactly 4 bytes with wrong magic", () => {
        const bytes = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("foreign");
      });

      it("should handle exactly WIRE_SIZE bytes", () => {
        const bytes = createValidPayload();
        expect(bytes.length).toBe(WIRE_SIZE);

        const records: NfcRecord[] = [createRecord(bytes)];
        const result = classify(bytes, records);
        expect(result).toBe("valid_payload");
      });

      it("should handle multiple records with valid first record", () => {
        const validBytes = createValidPayload();
        const records: NfcRecord[] = [
          createRecord(validBytes),
          createRecord(new Uint8Array([1, 2, 3])),
        ];
        const result = classify(validBytes, records);
        expect(result).toBe("valid_payload");
      });
    });
  });
});
