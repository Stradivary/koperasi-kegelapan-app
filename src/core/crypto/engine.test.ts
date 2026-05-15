import { describe, it, expect } from "vitest";
import { computeChainHash, computeHmac, verifyHmac, encryptBuffer, decryptBuffer } from "./engine";

describe("computeChainHash", () => {
  it("produces a 6-byte hash", async () => {
    const prevHash = new Uint8Array(6);
    const hash = await computeChainHash(100, 15000, 485000, 0x00, prevHash);
    expect(hash).toHaveLength(6);
  });

  it("is deterministic", async () => {
    const prevHash = new Uint8Array(6);
    const h1 = await computeChainHash(100, 15000, 485000, 0x00, prevHash);
    const h2 = await computeChainHash(100, 15000, 485000, 0x00, prevHash);
    expect(h1).toEqual(h2);
  });

  it("changes with different input", async () => {
    const prevHash = new Uint8Array(6);
    const h1 = await computeChainHash(100, 15000, 485000, 0x00, prevHash);
    const h2 = await computeChainHash(100, 20000, 480000, 0x00, prevHash);
    expect(h1).not.toEqual(h2);
  });

  it("chains correctly: second hash depends on first", async () => {
    const genesis = new Uint8Array(6);
    const h1 = await computeChainHash(100, 15000, 485000, 0x00, genesis);
    const h2a = await computeChainHash(200, 5000, 480000, 0x00, h1);
    const h2b = await computeChainHash(200, 5000, 480000, 0x00, genesis);
    expect(h2a).not.toEqual(h2b);
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
