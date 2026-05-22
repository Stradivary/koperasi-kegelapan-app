import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TENANT_MISMATCH_REASON,
  UNREGISTERED_CARD_MESSAGE,
  decryptCardBody,
  validateCard,
  prepareWrite,
  commitWrite,
  readAndValidateCard,
  recoverFromIncompleteWrite,
} from "../pipelineEngine";
import type { CardPayload, SessionGrant } from "../../payload/types";
import { BUFFER_SIZE, WIRE_SIZE, MAGIC } from "../../payload/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../engine", () => ({
  readCard: vi.fn(),
  writeCard: vi.fn(),
}));

vi.mock("../../crypto/engine", () => ({
  computeHmac: vi.fn().mockResolvedValue(new Uint8Array(8)),
  verifyHmac: vi.fn().mockResolvedValue(true),
  computeChainHash: vi.fn().mockResolvedValue(new Uint8Array(6)),
  encryptBuffer: vi.fn().mockResolvedValue(new Uint8Array(184)), // ENCRYPTED_BODY_END - ENCRYPTED_BODY_START + 16 auth tag
  decryptBuffer: vi.fn().mockResolvedValue(new Uint8Array(168)), // ENCRYPTED_BODY_END - ENCRYPTED_BODY_START
}));

vi.mock("../../payload/engine", () => ({
  decodePayload: vi.fn(),
  encodePayloadWire: vi.fn().mockReturnValue(new Uint8Array(280)), // WIRE_SIZE = 216 + 64
  buildHmacInput: vi.fn().mockReturnValue(new Uint8Array(231)), // BUFFER_SIZE + anchorSize
  validateMagic: vi.fn().mockReturnValue(true),
}));

vi.mock("../../payload/tenantBind", () => ({
  isTenantBindValid: vi.fn().mockReturnValue(true),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCardId(): Uint8Array {
  return new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
}

function makeSessionGrant(overrides: Partial<SessionGrant> = {}): SessionGrant {
  return {
    keyVersion: 1,
    sessionKey: new Uint8Array(32).fill(0xab),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    allowedOps: ["checkin", "checkout"],
    signature: new Uint8Array(64),
    tenantId: "tenant-abc",
    accountId: "account-1",
    deviceId: "device-1",
    ...overrides,
  };
}

function makePayload(overrides: Partial<CardPayload> = {}): CardPayload {
  const cardId = makeCardId();
  return {
    header: {
      magic: MAGIC,
      version: 1,
      type: 0,
      cardId,
      tenantBind: 0,
    },
    identity: {
      name: "Test User",
      userId: "ABCD1234",
      gender: 0,
      status: 0,
      createdAt: 1700000000,
    },
    wallet: {
      balance: 50000,
      lastBalance: 40000,
      counter: 5n,
      lastTimestamp: 1700000100,
      state: 0,
      flags: 0,
    },
    session: {
      startTime: 0,
      endTime: 0,
      terminalId: 0,
    },
    logEntries: [],
    trailer: {
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 5, // lower 32 bits of counter
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("TENANT_MISMATCH_REASON equals 'TENANT_MISMATCH'", () => {
    expect(TENANT_MISMATCH_REASON).toBe("TENANT_MISMATCH");
  });

  it("UNREGISTERED_CARD_MESSAGE is the Indonesian unregistered-card string", () => {
    expect(UNREGISTERED_CARD_MESSAGE).toContain("tidak terdaftar");
    expect(UNREGISTERED_CARD_MESSAGE).toContain("station");
  });
});

// ---------------------------------------------------------------------------
// decryptCardBody
// ---------------------------------------------------------------------------

describe("decryptCardBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Uint8Array of BUFFER_SIZE (216)", async () => {
    const { decryptBuffer } = await import("../../crypto/engine");
    vi.mocked(decryptBuffer).mockResolvedValue(new Uint8Array(168));

    const result = await decryptCardBody(
      new Uint8Array(216),
      new Uint8Array(32),
      new Uint8Array(6),
      1n,
    );

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(BUFFER_SIZE);
  });

  it("preserves the first 16 header bytes unchanged", async () => {
    const { decryptBuffer } = await import("../../crypto/engine");
    vi.mocked(decryptBuffer).mockResolvedValue(new Uint8Array(168));

    const bufBytes = new Uint8Array(216);
    bufBytes[0] = 0xaa;
    bufBytes[7] = 0xbb;
    bufBytes[15] = 0xcc;

    const result = await decryptCardBody(bufBytes, new Uint8Array(32), new Uint8Array(6), 0n);

    expect(result[0]).toBe(0xaa);
    expect(result[7]).toBe(0xbb);
    expect(result[15]).toBe(0xcc);
  });

  it("calls decryptBuffer with the correct ciphertext slice (bytes 16–200)", async () => {
    const { decryptBuffer } = await import("../../crypto/engine");
    vi.mocked(decryptBuffer).mockResolvedValue(new Uint8Array(168));

    const bufBytes = new Uint8Array(216);
    const sessionKey = new Uint8Array(32).fill(0x01);
    const cardId = new Uint8Array(6).fill(0x02);
    const counter = 42n;

    await decryptCardBody(bufBytes, sessionKey, cardId, counter);

    expect(decryptBuffer).toHaveBeenCalledOnce();
    const [calledKey, calledId, calledCounter, calledCipher] =
      vi.mocked(decryptBuffer).mock.calls[0];
    expect(calledKey).toEqual(sessionKey);
    expect(calledId).toEqual(cardId);
    expect(calledCounter).toBe(counter);
    // ciphertext = bytes 16..184 + bytes 184..200 = 184 bytes total
    expect(calledCipher.length).toBe(184);
  });

  it("places decrypted plaintext starting at byte 16", async () => {
    const { decryptBuffer } = await import("../../crypto/engine");
    const plainBody = new Uint8Array(168).fill(0x55);
    vi.mocked(decryptBuffer).mockResolvedValue(plainBody);

    const result = await decryptCardBody(
      new Uint8Array(216),
      new Uint8Array(32),
      new Uint8Array(6),
      0n,
    );

    expect(result[16]).toBe(0x55);
    expect(result[183]).toBe(0x55);
  });
});

// ---------------------------------------------------------------------------
// validateCard
// ---------------------------------------------------------------------------

describe("validateCard", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { verifyHmac } = await import("../../crypto/engine");
    const { isTenantBindValid } = await import("../../payload/tenantBind");
    const { buildHmacInput } = await import("../../payload/engine");
    vi.mocked(verifyHmac).mockResolvedValue(true);
    vi.mocked(isTenantBindValid).mockReturnValue(true);
    vi.mocked(buildHmacInput).mockReturnValue(new Uint8Array(231));
  });

  it("returns valid=true for a well-formed payload", async () => {
    const payload = makePayload();
    const grant = makeSessionGrant();
    const raw = new Uint8Array(BUFFER_SIZE * 2 + 64);

    const result = await validateCard(payload, raw, grant);

    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("rejects when card keyVersion does not match grant keyVersion", async () => {
    const payload = makePayload({ trailer: { ...makePayload().trailer, keyVersion: 2 } });
    const grant = makeSessionGrant({ keyVersion: 1 });
    const raw = new Uint8Array(BUFFER_SIZE * 2 + 64);

    const result = await validateCard(payload, raw, grant);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/key version mismatch/i);
    expect(result.tamper).toBe(false);
  });

  it("rejects and sets tamper=true when HMAC verification fails", async () => {
    const { verifyHmac } = await import("../../crypto/engine");
    vi.mocked(verifyHmac).mockResolvedValue(false);

    const payload = makePayload();
    const grant = makeSessionGrant();
    const raw = new Uint8Array(BUFFER_SIZE * 2 + 64);

    const result = await validateCard(payload, raw, grant);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/hmac/i);
    expect(result.tamper).toBe(true);
  });

  it("rejects and sets tamper=true when counter bind does not match", async () => {
    // counter = 5n → lower 32 bits = 5, but trailer says 99
    const payload = makePayload({
      wallet: { ...makePayload().wallet, counter: 5n },
      trailer: { ...makePayload().trailer, counterBind: 99 },
    });
    const grant = makeSessionGrant();
    const raw = new Uint8Array(BUFFER_SIZE * 2 + 64);

    const result = await validateCard(payload, raw, grant);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/counter bind/i);
    expect(result.tamper).toBe(true);
  });

  it("rejects with UNREGISTERED_CARD_MESSAGE and tamper=false when tenant bind is invalid", async () => {
    const { isTenantBindValid } = await import("../../payload/tenantBind");
    vi.mocked(isTenantBindValid).mockReturnValue(false);

    const payload = makePayload();
    const grant = makeSessionGrant();
    const raw = new Uint8Array(BUFFER_SIZE * 2 + 64);

    const result = await validateCard(payload, raw, grant);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe(UNREGISTERED_CARD_MESSAGE);
    expect(result.tamper).toBe(false);
  });

  it("rejects and sets tamper=true when chain hash is invalid", async () => {
    const { computeChainHash } = await import("../../crypto/engine");
    // Return a hash that won't match the stored entry hash (all zeros)
    vi.mocked(computeChainHash).mockResolvedValue(
      new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    );

    const payload = makePayload({
      logEntries: [
        {
          deltaTime: 10,
          amount: 5000,
          balanceAfter: 45000,
          flags: 0,
          hash: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]), // won't match 0xff...
        },
      ],
    });
    const grant = makeSessionGrant();
    const raw = new Uint8Array(BUFFER_SIZE * 2 + 64);

    const result = await validateCard(payload, raw, grant);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/chain hash/i);
    expect(result.tamper).toBe(true);
  });

  it("accepts a payload with no log entries (empty chain is valid)", async () => {
    const payload = makePayload({ logEntries: [] });
    const grant = makeSessionGrant();
    const raw = new Uint8Array(BUFFER_SIZE * 2 + 64);

    const result = await validateCard(payload, raw, grant);

    expect(result.valid).toBe(true);
  });

  it("accepts a payload with matching chain hashes", async () => {
    const { computeChainHash } = await import("../../crypto/engine");
    const matchingHash = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66]);
    vi.mocked(computeChainHash).mockResolvedValue(matchingHash);

    const payload = makePayload({
      logEntries: [
        {
          deltaTime: 10,
          amount: 5000,
          balanceAfter: 45000,
          flags: 0,
          hash: matchingHash,
        },
      ],
    });
    const grant = makeSessionGrant();
    const raw = new Uint8Array(BUFFER_SIZE * 2 + 64);

    const result = await validateCard(payload, raw, grant);

    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// prepareWrite
// ---------------------------------------------------------------------------

describe("prepareWrite", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { computeHmac } = await import("../../crypto/engine");
    const { computeChainHash } = await import("../../crypto/engine");
    const { encodePayloadWire } = await import("../../payload/engine");
    const { buildHmacInput } = await import("../../payload/engine");
    vi.mocked(computeHmac).mockResolvedValue(new Uint8Array(8).fill(0x77));
    vi.mocked(computeChainHash).mockResolvedValue(new Uint8Array(6).fill(0x33));
    vi.mocked(encodePayloadWire).mockReturnValue(new Uint8Array(WIRE_SIZE));
    vi.mocked(buildHmacInput).mockReturnValue(new Uint8Array(231));
  });

  it("returns bytes of WIRE_SIZE and a payload", async () => {
    const current = makePayload();
    const updated = makePayload({
      wallet: { ...makePayload().wallet, balance: 45000, counter: 6n },
    });
    const grant = makeSessionGrant();

    const result = await prepareWrite(current, updated, grant);

    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.length).toBe(WIRE_SIZE);
    expect(result.payload).toBeDefined();
  });

  it("sets activePtr to 0 in the new trailer", async () => {
    const current = makePayload({ trailer: { ...makePayload().trailer, activePtr: 1 } });
    const updated = makePayload();
    const grant = makeSessionGrant();

    const result = await prepareWrite(current, updated, grant);

    expect(result.payload.trailer.activePtr).toBe(0);
  });

  it("sets counterBind to lower 32 bits of the new counter", async () => {
    const counter = 0x1_0000_0007n; // lower 32 bits = 7
    const updated = makePayload({ wallet: { ...makePayload().wallet, counter } });
    const grant = makeSessionGrant();

    const result = await prepareWrite(makePayload(), updated, grant);

    expect(result.payload.trailer.counterBind).toBe(7);
  });

  it("sets rootHash to the last log entry hash when entries exist", async () => {
    const { computeChainHash } = await import("../../crypto/engine");
    const lastHash = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
    vi.mocked(computeChainHash).mockResolvedValue(lastHash);

    const updated = makePayload({
      logEntries: [
        { deltaTime: 5, amount: 1000, balanceAfter: 49000, flags: 0, hash: new Uint8Array(6) },
      ],
    });
    const grant = makeSessionGrant();

    const result = await prepareWrite(makePayload(), updated, grant);

    expect(result.payload.trailer.rootHash).toEqual(lastHash);
  });

  it("sets rootHash to all-zeros when there are no log entries", async () => {
    const updated = makePayload({ logEntries: [] });
    const grant = makeSessionGrant();

    const result = await prepareWrite(makePayload(), updated, grant);

    expect(result.payload.trailer.rootHash).toEqual(new Uint8Array(6));
  });

  it("embeds the computed HMAC into the signed trailer", async () => {
    const { computeHmac } = await import("../../crypto/engine");
    const expectedHmac = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    vi.mocked(computeHmac).mockResolvedValue(expectedHmac);

    const grant = makeSessionGrant();
    const result = await prepareWrite(makePayload(), makePayload(), grant);

    expect(result.payload.trailer.hmac).toEqual(expectedHmac);
  });

  it("calls encryptCardBody for v2+ cards", async () => {
    const { encryptBuffer } = await import("../../crypto/engine");
    vi.mocked(encryptBuffer).mockResolvedValue(new Uint8Array(184));

    const updated = makePayload({ header: { ...makePayload().header, version: 2 } });
    const grant = makeSessionGrant();

    await prepareWrite(makePayload(), updated, grant);

    expect(encryptBuffer).toHaveBeenCalled();
  });

  it("does NOT call encryptBuffer for v1 cards", async () => {
    const { encryptBuffer } = await import("../../crypto/engine");

    const updated = makePayload({ header: { ...makePayload().header, version: 1 } });
    const grant = makeSessionGrant();

    await prepareWrite(makePayload(), updated, grant);

    expect(encryptBuffer).not.toHaveBeenCalled();
  });

  it("recomputes chain hashes for all log entries", async () => {
    const { computeChainHash } = await import("../../crypto/engine");
    vi.mocked(computeChainHash).mockResolvedValue(new Uint8Array(6).fill(0x42));

    const updated = makePayload({
      logEntries: [
        { deltaTime: 1, amount: 100, balanceAfter: 900, flags: 0, hash: new Uint8Array(6) },
        { deltaTime: 2, amount: 200, balanceAfter: 700, flags: 0, hash: new Uint8Array(6) },
      ],
    });
    const grant = makeSessionGrant();

    await prepareWrite(makePayload(), updated, grant);

    // Called once per log entry
    expect(computeChainHash).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// commitWrite
// ---------------------------------------------------------------------------

describe("commitWrite", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { writeCard } = await import("../engine");
    vi.mocked(writeCard).mockResolvedValue({ ok: true });
  });

  it("returns ok=true and the payload on successful write", async () => {
    const payload = makePayload();
    const raw = new Uint8Array(WIRE_SIZE);

    const result = await commitWrite(raw, payload, new AbortController().signal);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toBe(payload);
    }
  });

  it("returns ok=false with error when writeCard fails", async () => {
    const { writeCard } = await import("../engine");
    vi.mocked(writeCard).mockResolvedValue({ ok: false, error: "NFC write timeout" });

    const result = await commitWrite(
      new Uint8Array(WIRE_SIZE),
      makePayload(),
      new AbortController().signal,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("NFC write timeout");
    }
  });

  it("passes the AbortSignal through to writeCard", async () => {
    const { writeCard } = await import("../engine");
    const signal = new AbortController().signal;

    await commitWrite(new Uint8Array(WIRE_SIZE), makePayload(), signal);

    expect(writeCard).toHaveBeenCalledWith(expect.any(Uint8Array), signal);
  });
});

// ---------------------------------------------------------------------------
// readAndValidateCard
// ---------------------------------------------------------------------------

describe("readAndValidateCard", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { verifyHmac } = await import("../../crypto/engine");
    const { isTenantBindValid } = await import("../../payload/tenantBind");
    const { buildHmacInput } = await import("../../payload/engine");
    vi.mocked(verifyHmac).mockResolvedValue(true);
    vi.mocked(isTenantBindValid).mockReturnValue(true);
    vi.mocked(buildHmacInput).mockReturnValue(new Uint8Array(231));
  });

  it("returns ok=false when readCard fails", async () => {
    const { readCard } = await import("../engine");
    vi.mocked(readCard).mockResolvedValue({ ok: false, error: "NFC not supported" });

    const result = await readAndValidateCard(new AbortController().signal, makeSessionGrant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("NFC not supported");
    }
  });

  it("returns ok=false with tamper=true when decodePayload throws", async () => {
    const { readCard } = await import("../engine");
    const { decodePayload } = await import("../../payload/engine");

    const raw = new Uint8Array(WIRE_SIZE);
    vi.mocked(readCard).mockResolvedValue({ ok: true, raw, serialNumber: "AA:BB:CC" });
    vi.mocked(decodePayload).mockImplementation(() => {
      throw new Error("Invalid magic");
    });

    const result = await readAndValidateCard(new AbortController().signal, makeSessionGrant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.tamper).toBe(true);
      expect(result.error).toMatch(/payload decode failed/i);
    }
  });

  it("returns ok=true with payload and serialNumber on success (v1 card)", async () => {
    const { readCard } = await import("../engine");
    const { decodePayload } = await import("../../payload/engine");

    const payload = makePayload();
    const raw = new Uint8Array(WIRE_SIZE);
    // Set version byte to 1 at offset 4
    raw[4] = 1;

    vi.mocked(readCard).mockResolvedValue({ ok: true, raw, serialNumber: "AA:BB:CC:DD:EE:FF" });
    vi.mocked(decodePayload).mockReturnValue(payload);

    const result = await readAndValidateCard(new AbortController().signal, makeSessionGrant());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toBe(payload);
      expect(result.serialNumber).toBe("AA:BB:CC:DD:EE:FF");
    }
  });

  it("decrypts card body for v2+ cards before decoding", async () => {
    const { readCard } = await import("../engine");
    const { decodePayload } = await import("../../payload/engine");
    const { decryptBuffer } = await import("../../crypto/engine");

    const payload = makePayload({ header: { ...makePayload().header, version: 2 } });
    const raw = new Uint8Array(WIRE_SIZE);
    raw[4] = 2; // version = 2

    vi.mocked(readCard).mockResolvedValue({ ok: true, raw, serialNumber: "11:22:33" });
    vi.mocked(decodePayload).mockReturnValue(payload);
    vi.mocked(decryptBuffer).mockResolvedValue(new Uint8Array(168));

    await readAndValidateCard(new AbortController().signal, makeSessionGrant());

    expect(decryptBuffer).toHaveBeenCalled();
  });

  it("returns ok=false when validation fails", async () => {
    const { readCard } = await import("../engine");
    const { decodePayload } = await import("../../payload/engine");
    const { verifyHmac } = await import("../../crypto/engine");

    const payload = makePayload();
    const raw = new Uint8Array(WIRE_SIZE);
    raw[4] = 1;

    vi.mocked(readCard).mockResolvedValue({ ok: true, raw, serialNumber: "AA:BB" });
    vi.mocked(decodePayload).mockReturnValue(payload);
    vi.mocked(verifyHmac).mockResolvedValue(false);

    const result = await readAndValidateCard(new AbortController().signal, makeSessionGrant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.tamper).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// recoverFromIncompleteWrite
// ---------------------------------------------------------------------------

describe("recoverFromIncompleteWrite", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { validateMagic } = await import("../../payload/engine");
    const { readCard } = await import("../engine");
    const { decodePayload } = await import("../../payload/engine");
    const { verifyHmac } = await import("../../crypto/engine");
    const { isTenantBindValid } = await import("../../payload/tenantBind");
    const { buildHmacInput } = await import("../../payload/engine");

    vi.mocked(validateMagic).mockReturnValue(true);
    vi.mocked(readCard).mockResolvedValue({
      ok: true,
      raw: new Uint8Array(WIRE_SIZE),
      serialNumber: "AA:BB",
    });
    vi.mocked(decodePayload).mockReturnValue(makePayload());
    vi.mocked(verifyHmac).mockResolvedValue(true);
    vi.mocked(isTenantBindValid).mockReturnValue(true);
    vi.mocked(buildHmacInput).mockReturnValue(new Uint8Array(231));
  });

  it("returns ok=false when both buffers have invalid magic", async () => {
    const { validateMagic } = await import("../../payload/engine");
    vi.mocked(validateMagic).mockReturnValue(false);

    // Build a 496-byte raw buffer with activePtr=0 at trailer offset 28
    const raw = new Uint8Array(496);
    // trailer starts at 432; activePtr is at offset 28 within trailer → byte 460
    raw[460] = 0; // activePtr = 0

    const result = await recoverFromIncompleteWrite(raw, makeSessionGrant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/both buffers invalid/i);
    }
  });

  it("falls through to readAndValidateCard when inactive buffer magic is valid", async () => {
    const { validateMagic } = await import("../../payload/engine");
    // First call (inactive buffer) returns true → proceed to readAndValidateCard
    vi.mocked(validateMagic).mockReturnValue(true);

    const raw = new Uint8Array(496);
    raw[460] = 0; // activePtr = 0

    const result = await recoverFromIncompleteWrite(raw, makeSessionGrant());

    expect(result.ok).toBe(true);
  });

  it("reads activePtr from the correct trailer offset (byte 460 in 496-byte buffer)", async () => {
    const { validateMagic } = await import("../../payload/engine");
    vi.mocked(validateMagic).mockReturnValue(true);

    const raw = new Uint8Array(496);
    raw[460] = 1; // activePtr = 1 → inactive is buffer A (offset 0)

    const result = await recoverFromIncompleteWrite(raw, makeSessionGrant());

    // validateMagic should have been called with offset 0 (inactive when activePtr=1)
    expect(validateMagic).toHaveBeenCalledWith(raw, 0);
    expect(result.ok).toBe(true);
  });
});
