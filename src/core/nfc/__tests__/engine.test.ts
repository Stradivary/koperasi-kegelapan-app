import { describe, it, expect, vi } from "vitest";
import { isNfcSupported, friendlyReadError, friendlyWriteError, extractCardBytes } from "../engine";

// Mock the validation module
vi.mock("../../validation/blockEnforcer", () => ({
  checkBlocked: vi.fn().mockResolvedValue({ blocked: false }),
  checkBlockedSync: vi.fn().mockReturnValue({ blocked: false }),
}));

describe("nfc/engine", () => {
  describe("isNfcSupported", () => {
    it("returns false when NDEFReader is not in globalThis", () => {
      expect(isNfcSupported()).toBe(false);
    });
  });

  describe("friendlyReadError", () => {
    it("returns generic message for undefined error", () => {
      const msg = friendlyReadError(undefined);
      expect(msg).toBe("Gagal membaca kartu NFC");
    });

    it("returns NDEF message for ndef-related errors", () => {
      const err = new DOMException("Tag is not NDEF formatted", "NotSupportedError");
      const msg = friendlyReadError(err);
      expect(msg).toContain("NDEF");
    });

    it("returns abort message for AbortError", () => {
      const err = new DOMException("Operation was aborted", "AbortError");
      const msg = friendlyReadError(err);
      expect(msg).toContain("dibatalkan");
    });

    it("returns original message for other errors", () => {
      const err = new DOMException("Some other error", "UnknownError");
      const msg = friendlyReadError(err);
      expect(msg).toBe("Some other error");
    });
  });

  describe("friendlyWriteError", () => {
    it("returns string representation for non-DOMException", () => {
      expect(friendlyWriteError("simple error")).toBe("simple error");
      expect(friendlyWriteError(new Error("regular"))).toBe("Error: regular");
    });

    it("returns NDEF compatibility message for NotSupportedError", () => {
      const err = new DOMException("not ndef", "NotSupportedError");
      const msg = friendlyWriteError(err);
      expect(msg).toContain("NDEF");
      expect(msg).toContain("NTAG");
    });

    it("returns I/O message for io errors", () => {
      const err = new DOMException("I/O error during write", "NetworkError");
      const msg = friendlyWriteError(err);
      expect(msg).toContain("terlalu cepat");
    });

    it("returns abort message for AbortError", () => {
      const err = new DOMException("Aborted", "AbortError");
      const msg = friendlyWriteError(err);
      expect(msg).toContain("dibatalkan");
    });

    it("returns original message for other DOMExceptions", () => {
      const err = new DOMException("Unknown issue", "DataError");
      const msg = friendlyWriteError(err);
      expect(msg).toBe("Unknown issue");
    });
  });

  describe("extractCardBytes", () => {
    it("returns null for empty message", () => {
      const msg = { records: [] } as unknown as NDEFMessage;
      expect(extractCardBytes(msg)).toBeNull();
    });

    it("returns null when record has no data", () => {
      const msg = { records: [{ recordType: "unknown", data: null }] } as unknown as NDEFMessage;
      expect(extractCardBytes(msg)).toBeNull();
    });

    it("returns null when data is too small", () => {
      const smallBuf = new ArrayBuffer(10);
      const msg = {
        records: [{ recordType: "unknown", data: new DataView(smallBuf) }],
      } as unknown as NDEFMessage;
      expect(extractCardBytes(msg)).toBeNull();
    });

    it("extracts CARD_SIZE (496) bytes when data is large enough", () => {
      // CARD_SIZE = 496 (BUFFER_SIZE*2 + TRAILER_SIZE)
      const buf = new ArrayBuffer(500);
      const view = new DataView(buf);
      for (let i = 0; i < 500; i++) {
        view.setUint8(i, i % 256);
      }
      const msg = {
        records: [{ recordType: "unknown", data: new DataView(buf) }],
      } as unknown as NDEFMessage;
      const result = extractCardBytes(msg);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(496); // CARD_SIZE
      expect(result![0]).toBe(0);
      expect(result![1]).toBe(1);
    });

    it("extracts WIRE_SIZE (280) bytes when data is >= WIRE_SIZE but < CARD_SIZE", () => {
      // WIRE_SIZE = 280, CARD_SIZE = 496
      const buf = new ArrayBuffer(300);
      const view = new DataView(buf);
      for (let i = 0; i < 300; i++) {
        view.setUint8(i, i % 256);
      }
      const msg = {
        records: [{ recordType: "unknown", data: new DataView(buf) }],
      } as unknown as NDEFMessage;
      const result = extractCardBytes(msg);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(280); // WIRE_SIZE
    });

    it("skips records without data and finds one with data", () => {
      // Need >= WIRE_SIZE (280) bytes for extraction
      const buf = new ArrayBuffer(300);
      const msg = {
        records: [
          { recordType: "text", data: null },
          { recordType: "unknown", data: new DataView(buf) },
        ],
      } as unknown as NDEFMessage;
      const result = extractCardBytes(msg);
      expect(result).not.toBeNull();
    });
  });
});

// Declare global types for test
declare global {
  interface NDEFMessage {
    records: NDEFRecord[];
  }
  interface NDEFRecord {
    recordType: string;
    data: DataView | null;
  }
}
