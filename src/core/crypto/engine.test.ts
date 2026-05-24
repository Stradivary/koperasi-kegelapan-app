import { describe, it, expect } from "vitest";
import { computeChainHash, computeHmac, verifyHmac, encryptBuffer, decryptBuffer } from "./engine";

describe("computeChainHash", () => {
  it("produces a 4-byte hash", async () => {
    const prevHash = new Uint8Array(4);
    const hash = await computeChainHash(100, 15000, 485000, 0x00, prevHash);
    expect(hash).toHaveLength(4);
  });

  it("is deterministic", async () => {
    const prevHash = new Uint8Array(4);
    const h1 = await computeChainHash(100, 15000, 485000, 0x00, prevHash);
    const h2 = await computeChainHash(100, 15000, 485000, 0x00, prevHash);
    expect(h1).toEqual(h2);
  });

  it("changes with different input", async () => {
    const prevHash = new Uint8Array(4);
    const h1 = await computeChainHash(100, 15000, 485000, 0x00, prevHash);
    const h2 = await computeChainHash(100, 20000, 480000, 0x00, prevHash);
    expect(h1).not.toEqual(h2);
  });

  it("chains correctly: second hash depends on first", async () => {
    const genesis = new Uint8Array(4);
    const h1 = await computeChainHash(100, 15000, 485000, 0x00, genesis);
    const h2a = await computeChainHash(200, 5000, 480000, 0x00, h1);
    const h2b = await computeChainHash(200, 5000, 480000, 0x00, genesis);
    expect(h2a).not.toEqual(h2b);
  });

  it("right-pads prevHash with zeros if shorter than 4 bytes", async () => {
    const shortPrev = new Uint8Array([0xab, 0xcd]);
    const paddedPrev = new Uint8Array([0xab, 0xcd, 0x00, 0x00]);
    const h1 = await computeChainHash(100, 15000, 485000, 0x00, shortPrev);
    const h2 = await computeChainHash(100, 15000, 485000, 0x00, paddedPrev);
    expect(h1).toEqual(h2);
  });
});

describe("HMAC", () => {
  const sessionKey = crypto.getRandomValues(new Uint8Array(32));
  const cardId = crypto.getRandomValues(new Uint8Array(6));
  const data = crypto.getRandomValues(new Uint8Array(64));

  it("produces an 8-byte HMAC", async () => {
    const mac = await computeHmac(sessionKey, cardId, data);
    expect(mac).toHaveLength(8);
  });

  it("verifies correctly", async () => {
    const mac = await computeHmac(sessionKey, cardId, data);
    const valid = await verifyHmac(sessionKey, cardId, data, mac);
    expect(valid).toBe(true);
  });

  it("rejects tampered data", async () => {
    const mac = await computeHmac(sessionKey, cardId, data);
    const tampered = new Uint8Array(data);
    tampered[0] ^= 0xff;
    const valid = await verifyHmac(sessionKey, cardId, tampered, mac);
    expect(valid).toBe(false);
  });

  it("rejects wrong key", async () => {
    const mac = await computeHmac(sessionKey, cardId, data);
    const wrongKey = crypto.getRandomValues(new Uint8Array(32));
    const valid = await verifyHmac(wrongKey, cardId, data, mac);
    expect(valid).toBe(false);
  });
});

describe("encryptBuffer / decryptBuffer", () => {
  const sessionKey = crypto.getRandomValues(new Uint8Array(32));
  const cardId = crypto.getRandomValues(new Uint8Array(6));
  const plaintext = crypto.getRandomValues(new Uint8Array(200));
  const counter = 42n;

  it("round-trips correctly", async () => {
    const ct = await encryptBuffer(sessionKey, cardId, counter, plaintext);
    const pt = await decryptBuffer(sessionKey, cardId, counter, ct);
    expect(pt).toEqual(plaintext);
  });

  it("different counters produce different ciphertext", async () => {
    const ct1 = await encryptBuffer(sessionKey, cardId, 1n, plaintext);
    const ct2 = await encryptBuffer(sessionKey, cardId, 2n, plaintext);
    expect(ct1).not.toEqual(ct2);
  });

  it("decryption fails with wrong counter", async () => {
    const ct = await encryptBuffer(sessionKey, cardId, counter, plaintext);
    await expect(decryptBuffer(sessionKey, cardId, counter + 1n, ct)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Additional coverage: sha256, deriveNonce, verifyHmac edge cases
// ---------------------------------------------------------------------------

import { sha256, deriveNonce } from "./engine";

describe("sha256", () => {
  it("produces a 32-byte hash", async () => {
    const result = await sha256(new Uint8Array([1, 2, 3]));
    expect(result).toHaveLength(32);
  });

  it("is deterministic", async () => {
    const data = new Uint8Array([10, 20, 30]);
    const h1 = await sha256(data);
    const h2 = await sha256(data);
    expect(h1).toEqual(h2);
  });

  it("produces different hashes for different inputs", async () => {
    const h1 = await sha256(new Uint8Array([1]));
    const h2 = await sha256(new Uint8Array([2]));
    expect(h1).not.toEqual(h2);
  });

  it("handles empty input", async () => {
    const result = await sha256(new Uint8Array(0));
    expect(result).toHaveLength(32);
  });
});

describe("deriveNonce", () => {
  const sessionKey = crypto.getRandomValues(new Uint8Array(32));
  const cardId = crypto.getRandomValues(new Uint8Array(6));

  it("produces a 12-byte nonce", async () => {
    const nonce = await deriveNonce(sessionKey, cardId, 0n);
    expect(nonce).toHaveLength(12);
  });

  it("is deterministic for the same inputs", async () => {
    const n1 = await deriveNonce(sessionKey, cardId, 42n);
    const n2 = await deriveNonce(sessionKey, cardId, 42n);
    expect(n1).toEqual(n2);
  });

  it("produces different nonces for different counters", async () => {
    const n1 = await deriveNonce(sessionKey, cardId, 1n);
    const n2 = await deriveNonce(sessionKey, cardId, 2n);
    expect(n1).not.toEqual(n2);
  });

  it("produces different nonces for different cardIds", async () => {
    const id1 = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const id2 = new Uint8Array([6, 5, 4, 3, 2, 1]);
    const n1 = await deriveNonce(sessionKey, id1, 0n);
    const n2 = await deriveNonce(sessionKey, id2, 0n);
    expect(n1).not.toEqual(n2);
  });
});

describe("verifyHmac — edge cases", () => {
  const sessionKey = crypto.getRandomValues(new Uint8Array(32));
  const cardId = crypto.getRandomValues(new Uint8Array(6));
  const data = new Uint8Array(32).fill(0xaa);

  it("returns false when expected HMAC has wrong length", async () => {
    const mac = await computeHmac(sessionKey, cardId, data);
    // Truncate to 4 bytes — length mismatch
    const shortMac = mac.slice(0, 4);
    const result = await verifyHmac(sessionKey, cardId, data, shortMac);
    expect(result).toBe(false);
  });

  it("returns false when expected HMAC is all zeros", async () => {
    const result = await verifyHmac(sessionKey, cardId, data, new Uint8Array(8));
    expect(result).toBe(false);
  });

  it("returns false when a single bit is flipped in the HMAC", async () => {
    const mac = await computeHmac(sessionKey, cardId, data);
    const flipped = new Uint8Array(mac);
    flipped[0] ^= 0x01;
    const result = await verifyHmac(sessionKey, cardId, data, flipped);
    expect(result).toBe(false);
  });
});

describe("computeChainHash — additional cases", () => {
  it("produces different hashes for different flags", async () => {
    const prev = new Uint8Array(4);
    const h1 = await computeChainHash(100, 5000, 45000, 0x00, prev);
    const h2 = await computeChainHash(100, 5000, 45000, 0x01, prev);
    expect(h1).not.toEqual(h2);
  });

  it("produces different hashes for different balanceAfter", async () => {
    const prev = new Uint8Array(4);
    const h1 = await computeChainHash(100, 5000, 45000, 0, prev);
    const h2 = await computeChainHash(100, 5000, 46000, 0, prev);
    expect(h1).not.toEqual(h2);
  });

  it("produces different hashes for different timestamp", async () => {
    const prev = new Uint8Array(4);
    const h1 = await computeChainHash(100, 5000, 45000, 0, prev);
    const h2 = await computeChainHash(200, 5000, 45000, 0, prev);
    expect(h1).not.toEqual(h2);
  });
});
