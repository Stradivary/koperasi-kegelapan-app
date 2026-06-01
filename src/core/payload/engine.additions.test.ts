/**
 * Additional tests for payload/engine - covering gaps in the existing suite:
 * - buildHmacInput structure and field placement
 * - validateMagic (unit-tested directly, not just mocked)
 * - getActiveBufferOffset / getInactiveBufferOffset
 * - Wire-format decode branch (raw.length < CARD_SIZE)
 * - Log entry early-exit on all-zero hash
 * - tenantBind round-trip through encode/decode
 * - encodePayload places buffer in correct slot for activePtr=1
 */

import { describe, it, expect } from "vitest";
import {
  decodePayload,
  encodePayload,
  encodePayloadWire,
  buildHmacInput,
  validateMagic,
  getActiveBufferOffset,
  getInactiveBufferOffset,
} from "./engine";
import {
  MAGIC,
  CARD_SCHEMA_VERSION,
  BUFFER_SIZE,
  WIRE_SIZE,
  CARD_SIZE,
  CardStatus,
  type CardPayload,
} from "./types";
import { encodeTenantBind } from "./tenantBind";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalCard(activePtr = 0): Uint8Array {
  const raw = new Uint8Array(CARD_SIZE);
  const view = new DataView(raw.buffer);
  const bufOffset = activePtr === 0 ? 0 : BUFFER_SIZE;

  view.setUint32(bufOffset + 0, MAGIC, true);
  view.setUint8(bufOffset + 4, CARD_SCHEMA_VERSION);
  view.setUint8(bufOffset + 5, 0);
  for (let i = 0; i < 6; i++) raw[bufOffset + 6 + i] = i + 1;

  const nameBytes = new TextEncoder().encode("Test User");
  raw.set(nameBytes, bufOffset + 16);
  const userIdBytes = new TextEncoder().encode("GJWt7u3g");
  raw.set(userIdBytes, bufOffset + 16 + 24);
  view.setUint8(bufOffset + 16 + 33, CardStatus.ACTIVE);

  view.setUint32(bufOffset + 64, 500000, true);
  view.setUint32(bufOffset + 64 + 4, 500000, true);
  view.setBigUint64(bufOffset + 64 + 8, 10n, true);
  view.setUint32(bufOffset + 64 + 16, 1700000000, true);

  const trailerOffset = BUFFER_SIZE * 2;
  view.setUint32(trailerOffset + 0, 1800000000, true);
  view.setUint8(trailerOffset + 4, 1);
  view.setUint32(trailerOffset + 16, 10, true);
  view.setUint8(trailerOffset + 28, activePtr);

  return raw;
}

function makeWireCard(): Uint8Array {
  const full = makeMinimalCard(0);
  const wire = new Uint8Array(WIRE_SIZE);
  wire.set(full.slice(0, BUFFER_SIZE), 0);
  wire.set(full.slice(BUFFER_SIZE * 2), BUFFER_SIZE);
  return wire;
}

function makeTrailer(
  overrides: {
    expiresAt?: number;
    keyVersion?: number;
    rootHash?: Uint8Array;
    counterBind?: number;
    hmac?: Uint8Array;
    activePtr?: number;
  } = {},
): CardPayload["trailer"] {
  return {
    expiresAt: overrides.expiresAt ?? 1800000000,
    keyVersion: overrides.keyVersion ?? 1,
    rootHash: overrides.rootHash ?? new Uint8Array(6),
    counterBind: overrides.counterBind ?? 10,
    hmac: overrides.hmac ?? new Uint8Array(8),
    activePtr: overrides.activePtr ?? 0,
  };
}

// ---------------------------------------------------------------------------
// validateMagic
// ---------------------------------------------------------------------------

describe("validateMagic", () => {
  it("returns true when magic bytes at offset match MAGIC", () => {
    const raw = new Uint8Array(8);
    const view = new DataView(raw.buffer);
    view.setUint32(0, MAGIC, true);
    expect(validateMagic(raw, 0)).toBe(true);
  });

  it("returns true when magic is at a non-zero offset", () => {
    const raw = new Uint8Array(12);
    const view = new DataView(raw.buffer);
    view.setUint32(4, MAGIC, true);
    expect(validateMagic(raw, 4)).toBe(true);
  });

  it("returns false when magic bytes do not match", () => {
    const raw = new Uint8Array(8);
    const view = new DataView(raw.buffer);
    view.setUint32(0, 0xdeadbeef, true);
    expect(validateMagic(raw, 0)).toBe(false);
  });

  it("returns false when buffer is too short for the given offset", () => {
    const raw = new Uint8Array(3); // less than offset + 4
    expect(validateMagic(raw, 0)).toBe(false);
  });

  it("returns false when offset + 4 exceeds buffer length", () => {
    const raw = new Uint8Array(8);
    const view = new DataView(raw.buffer);
    view.setUint32(0, MAGIC, true);
    expect(validateMagic(raw, 6)).toBe(false); // 6 + 4 = 10 > 8
  });

  it("validates magic in a real card buffer at offset 0", () => {
    const raw = makeMinimalCard(0);
    expect(validateMagic(raw, 0)).toBe(true);
  });

  it("validates magic in a real card buffer at buffer B offset (216)", () => {
    const raw = makeMinimalCard(1);
    expect(validateMagic(raw, BUFFER_SIZE)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getActiveBufferOffset / getInactiveBufferOffset
// ---------------------------------------------------------------------------

describe("getActiveBufferOffset", () => {
  it("returns 0 when activePtr is 0 (buffer A)", () => {
    expect(getActiveBufferOffset(0)).toBe(0);
  });

  it("returns BUFFER_SIZE (216) when activePtr is 1 (buffer B)", () => {
    expect(getActiveBufferOffset(1)).toBe(BUFFER_SIZE);
  });
});

describe("getInactiveBufferOffset", () => {
  it("returns BUFFER_SIZE (216) when activePtr is 0 (inactive is B)", () => {
    expect(getInactiveBufferOffset(0)).toBe(BUFFER_SIZE);
  });

  it("returns 0 when activePtr is 1 (inactive is A)", () => {
    expect(getInactiveBufferOffset(1)).toBe(0);
  });

  it("is always the complement of getActiveBufferOffset", () => {
    expect(getActiveBufferOffset(0) + getInactiveBufferOffset(0)).toBe(BUFFER_SIZE);
    expect(getActiveBufferOffset(1) + getInactiveBufferOffset(1)).toBe(BUFFER_SIZE);
  });
});

// ---------------------------------------------------------------------------
// buildHmacInput
// ---------------------------------------------------------------------------

describe("buildHmacInput", () => {
  it("returns a buffer of BUFFER_SIZE + 15 bytes (anchorSize = 4+1+6+4)", () => {
    const bufferBytes = new Uint8Array(BUFFER_SIZE);
    const trailer = makeTrailer();
    const result = buildHmacInput(bufferBytes, trailer);
    expect(result.length).toBe(BUFFER_SIZE + 15);
  });

  it("copies the full buffer bytes into the first BUFFER_SIZE bytes", () => {
    const bufferBytes = new Uint8Array(BUFFER_SIZE).fill(0xab);
    const trailer = makeTrailer();
    const result = buildHmacInput(bufferBytes, trailer);
    expect(result.slice(0, BUFFER_SIZE)).toEqual(bufferBytes);
  });

  it("encodes expiresAt at BUFFER_SIZE+0 (little-endian uint32)", () => {
    const bufferBytes = new Uint8Array(BUFFER_SIZE);
    const trailer = makeTrailer({ expiresAt: 0x12345678 });
    const result = buildHmacInput(bufferBytes, trailer);
    const view = new DataView(result.buffer);
    expect(view.getUint32(BUFFER_SIZE, true)).toBe(0x12345678);
  });

  it("encodes keyVersion at BUFFER_SIZE+4 (uint8)", () => {
    const bufferBytes = new Uint8Array(BUFFER_SIZE);
    const trailer = makeTrailer({ keyVersion: 7 });
    const result = buildHmacInput(bufferBytes, trailer);
    expect(result[BUFFER_SIZE + 4]).toBe(7);
  });

  it("encodes rootHash at BUFFER_SIZE+5 (6 bytes)", () => {
    const bufferBytes = new Uint8Array(BUFFER_SIZE);
    const rootHash = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66]);
    const trailer = makeTrailer({ rootHash });
    const result = buildHmacInput(bufferBytes, trailer);
    expect(result.slice(BUFFER_SIZE + 5, BUFFER_SIZE + 11)).toEqual(rootHash);
  });

  it("encodes counterBind at BUFFER_SIZE+11 (little-endian uint32)", () => {
    const bufferBytes = new Uint8Array(BUFFER_SIZE);
    const trailer = makeTrailer({ counterBind: 0xaabbccdd });
    const result = buildHmacInput(bufferBytes, trailer);
    const view = new DataView(result.buffer);
    expect(view.getUint32(BUFFER_SIZE + 11, true)).toBe(0xaabbccdd);
  });

  it("produces different output when expiresAt changes", () => {
    const bufferBytes = new Uint8Array(BUFFER_SIZE);
    const r1 = buildHmacInput(bufferBytes, makeTrailer({ expiresAt: 100 }));
    const r2 = buildHmacInput(bufferBytes, makeTrailer({ expiresAt: 200 }));
    expect(r1).not.toEqual(r2);
  });

  it("produces different output when counterBind changes", () => {
    const bufferBytes = new Uint8Array(BUFFER_SIZE);
    const r1 = buildHmacInput(bufferBytes, makeTrailer({ counterBind: 1 }));
    const r2 = buildHmacInput(bufferBytes, makeTrailer({ counterBind: 2 }));
    expect(r1).not.toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// Wire-format decode branch (raw.length < CARD_SIZE)
// ---------------------------------------------------------------------------

describe("decodePayload - wire format (WIRE_SIZE bytes)", () => {
  it("decodes a WIRE_SIZE buffer using the wire-format branch", () => {
    const wire = makeWireCard();
    expect(wire.length).toBe(WIRE_SIZE);
    const payload = decodePayload(wire);
    expect(payload.header.magic).toBe(MAGIC);
    expect(payload.header.version).toBe(CARD_SCHEMA_VERSION);
  });

  it("wire-format decode always reads from offset 0 (no activePtr selection)", () => {
    const wire = makeWireCard();
    const payload = decodePayload(wire);
    // Wire format has only one buffer at offset 0
    expect(payload.header.cardId).toEqual(Uint8Array.from([1, 2, 3, 4, 5, 6]));
  });

  it("wire-format trailer activePtr is always 0 after encodePayloadWire", () => {
    const full = makeMinimalCard(1); // activePtr=1 in full format
    const decoded = decodePayload(full);
    const wire = encodePayloadWire(decoded);
    const redecoded = decodePayload(wire);
    expect(redecoded.trailer.activePtr).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Log entry early-exit on all-zero hash
// ---------------------------------------------------------------------------

describe("decodePayload - log entry early-exit", () => {
  it("stops reading log entries when a hash is all zeros", () => {
    const raw = makeMinimalCard(0);
    const view = new DataView(raw.buffer);
    const LOG_OFFSET = 104;
    const LOG_ENTRY_SIZE = 16;

    // Write entry 0 with a non-zero hash (v4 layout: hash at offset 12)
    view.setUint32(LOG_OFFSET, 1719849600, true); // timestamp
    view.setUint8(LOG_OFFSET + 4, 0x10); // amount low byte
    view.setUint32(LOG_OFFSET + 7, 490000, true); // balanceAfter
    raw[LOG_OFFSET + 12] = 0x01; // non-zero hash byte → entry is valid

    // Entry 1 has all-zero hash (default) → should stop here
    // Entry 2 also has non-zero hash - should NOT be read
    const entry2Base = LOG_OFFSET + 2 * LOG_ENTRY_SIZE;
    raw[entry2Base + 12] = 0x02; // non-zero hash in entry 2

    const payload = decodePayload(raw);
    // Should only have 1 entry (entry 0), not 2
    expect(payload.logEntries.length).toBe(1);
  });

  it("returns empty logEntries when first entry hash is all zeros", () => {
    const raw = makeMinimalCard(0);
    // All log bytes are zero by default → no entries
    const payload = decodePayload(raw);
    expect(payload.logEntries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// tenantBind round-trip
// ---------------------------------------------------------------------------

describe("tenantBind round-trip through encode/decode", () => {
  it("preserves tenantBind through encodePayload/decodePayload", () => {
    const raw = makeMinimalCard(0);
    const decoded = decodePayload(raw);
    const tenantId = "koperasi-maju";
    const bind = encodeTenantBind(tenantId);

    const withBind = {
      ...decoded,
      header: { ...decoded.header, tenantBind: bind },
    };

    const encoded = encodePayload(withBind);
    const redecoded = decodePayload(encoded);

    expect(redecoded.header.tenantBind).toBe(bind);
  });

  it("preserves tenantBind=0 (legacy unbound) through encode/decode", () => {
    const raw = makeMinimalCard(0);
    const decoded = decodePayload(raw);
    const withZeroBind = {
      ...decoded,
      header: { ...decoded.header, tenantBind: 0 },
    };

    const encoded = encodePayload(withZeroBind);
    const redecoded = decodePayload(encoded);

    expect(redecoded.header.tenantBind).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// encodePayload places buffer in correct slot for activePtr=1
// ---------------------------------------------------------------------------

describe("encodePayload - activePtr=1 places buffer in slot B", () => {
  it("writes buffer data at offset BUFFER_SIZE (216) when activePtr=1", () => {
    const raw = makeMinimalCard(0);
    const decoded = decodePayload(raw);
    const withPtrB = {
      ...decoded,
      trailer: { ...decoded.trailer, activePtr: 1 },
    };

    const encoded = encodePayload(withPtrB);

    // Buffer B starts at BUFFER_SIZE; magic should be there
    const view = new DataView(encoded.buffer);
    expect(view.getUint32(BUFFER_SIZE, true)).toBe(MAGIC);
    // Buffer A should be all zeros (not written)
    expect(view.getUint32(0, true)).toBe(0);
  });

  it("round-trips correctly with activePtr=1", () => {
    const raw = makeMinimalCard(1);
    const decoded = decodePayload(raw);
    const reencoded = encodePayload(decoded);
    const redecoded = decodePayload(reencoded);

    expect(redecoded.trailer.activePtr).toBe(1);
    expect(redecoded.header.magic).toBe(MAGIC);
    expect(redecoded.identity.name).toBe(decoded.identity.name);
  });
});
