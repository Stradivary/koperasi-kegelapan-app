// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDecryptCardBody = vi.fn();
const mockDecodePayload = vi.fn();

vi.mock("#/core/nfc/pipelineEngine", () => ({
  decryptCardBody: (...args: unknown[]) => mockDecryptCardBody(...args),
}));

vi.mock("#/core/payload/engine", () => ({
  decodePayload: (...args: unknown[]) => mockDecodePayload(...args),
}));

vi.mock("#/core/payload/types", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    BUFFER_SIZE: 64,
    WIRE_SIZE: 80,
    TRAILER_COUNTER_BIND: 0,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("decryptRawCard", () => {
  it("returns raw bytes unchanged when version < 2", async () => {
    const { decryptRawCard } = await import("../cardDecryption");
    const raw = new Uint8Array(80);
    raw[4] = 1; // version = 1

    const grant = {
      sessionKey: new Uint8Array(32),
      tenantId: "t-1",
    };

    const result = await decryptRawCard(raw, grant as never);
    expect(result).toBe(raw);
    expect(mockDecryptCardBody).not.toHaveBeenCalled();
  });

  it("decrypts when version >= 2", async () => {
    const { decryptRawCard } = await import("../cardDecryption");
    const raw = new Uint8Array(80);
    raw[4] = 2; // version = 2

    const decryptedBuf = new Uint8Array(64).fill(0xab);
    mockDecryptCardBody.mockResolvedValue(decryptedBuf);

    const grant = {
      sessionKey: new Uint8Array(32),
      tenantId: "t-1",
    };

    const result = await decryptRawCard(raw, grant as never);
    expect(mockDecryptCardBody).toHaveBeenCalled();
    // Result should be a new Uint8Array of WIRE_SIZE (80)
    expect(result.length).toBe(80);
  });

  it("passes cardId bytes (offset 6-12) to decryptCardBody", async () => {
    const { decryptRawCard } = await import("../cardDecryption");
    const raw = new Uint8Array(80);
    raw[4] = 2;
    // Set cardId bytes at positions 6-11
    raw[6] = 0xaa;
    raw[7] = 0xbb;
    raw[8] = 0xcc;
    raw[9] = 0xdd;
    raw[10] = 0xee;
    raw[11] = 0xff;

    mockDecryptCardBody.mockResolvedValue(new Uint8Array(64));

    const grant = { sessionKey: new Uint8Array(32), tenantId: "t-1" };
    await decryptRawCard(raw, grant as never);

    const callArgs = mockDecryptCardBody.mock.calls[0];
    const cardIdArg = callArgs[2] as Uint8Array;
    expect(cardIdArg[0]).toBe(0xaa);
    expect(cardIdArg[5]).toBe(0xff);
  });
});

describe("decodeCardPayloadForVerification", () => {
  it("decrypts and decodes the payload", async () => {
    const { decodeCardPayloadForVerification } = await import("../cardDecryption");
    const raw = new Uint8Array(80);
    raw[4] = 1; // version 1 - no decryption needed

    const fakePayload = { identity: { name: "Test" } };
    mockDecodePayload.mockReturnValue(fakePayload);

    const grant = { sessionKey: new Uint8Array(32), tenantId: "t-1" };
    const result = await decodeCardPayloadForVerification(raw, grant as never);

    expect(mockDecodePayload).toHaveBeenCalledWith(raw);
    expect(result).toBe(fakePayload);
  });

  it("decrypts before decoding when version >= 2", async () => {
    const { decodeCardPayloadForVerification } = await import("../cardDecryption");
    const raw = new Uint8Array(80);
    raw[4] = 2;

    const decryptedBuf = new Uint8Array(64).fill(0x01);
    mockDecryptCardBody.mockResolvedValue(decryptedBuf);

    const fakePayload = { identity: { name: "Decrypted" } };
    mockDecodePayload.mockReturnValue(fakePayload);

    const grant = { sessionKey: new Uint8Array(32), tenantId: "t-1" };
    const result = await decodeCardPayloadForVerification(raw, grant as never);

    expect(mockDecryptCardBody).toHaveBeenCalled();
    expect(mockDecodePayload).toHaveBeenCalled();
    expect(result).toBe(fakePayload);
  });
});
