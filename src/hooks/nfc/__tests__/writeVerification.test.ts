// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockExtractCardBytes = vi.fn();
const mockEncodePayloadWire = vi.fn();
const mockDecodeCardPayloadForVerification = vi.fn();

vi.mock("#/core/nfc/engine", () => ({
  extractCardBytes: (...args: unknown[]) => mockExtractCardBytes(...args),
}));

vi.mock("#/core/payload/engine", () => ({
  encodePayloadWire: (...args: unknown[]) => mockEncodePayloadWire(...args),
}));

vi.mock("../cardDecryption", () => ({
  decodeCardPayloadForVerification: (...args: unknown[]) =>
    mockDecodeCardPayloadForVerification(...args),
}));

vi.mock("../types", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    WRITE_VERIFICATION_FAILED_MESSAGE: "Write verification failed",
    VERIFICATION_TIMEOUT_MS: 500, // short timeout for tests
    MAX_VERIFICATION_RETRIES: 1,
  };
});

// ── MockNDEFReader ─────────────────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;

class MockNDEFReader {
  static instances: MockNDEFReader[] = [];
  listeners: Record<string, EventHandler[]> = {};
  scanSignal: AbortSignal | null = null;

  constructor() {
    MockNDEFReader.instances.push(this);
  }

  addEventListener(event: string, handler: EventHandler) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  scan({ signal }: { signal: AbortSignal }) {
    this.scanSignal = signal;
    return Promise.resolve();
  }

  emit(event: string, ...args: unknown[]) {
    (this.listeners[event] ?? []).forEach((h) => h(...args));
  }
}

function makePayload() {
  return { wallet: { balance: 50000 }, identity: { name: "Test" } };
}

function makeGrant() {
  return {
    keyVersion: 1,
    sessionKey: new Uint8Array(32),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    allowedOps: ["read"],
    signature: new Uint8Array(32),
    tenantId: "t-1",
    accountId: "a-1",
    deviceId: "d-1",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  MockNDEFReader.instances = [];
  (globalThis as Record<string, unknown>).NDEFReader = MockNDEFReader;

  mockExtractCardBytes.mockReturnValue(new Uint8Array([0x01, 0x02]));
  mockEncodePayloadWire.mockReturnValue(new Uint8Array([0xaa, 0xbb]));
  mockDecodeCardPayloadForVerification.mockResolvedValue(makePayload());
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).NDEFReader;
  vi.useRealTimers();
});

describe("verifyWrittenPayload", () => {
  it("resolves when payload matches on first attempt", async () => {
    const { verifyWrittenPayload } = await import("../writeVerification");
    const expectedPayload = makePayload();
    const grant = makeGrant();

    // Both encode calls return same bytes → match
    mockEncodePayloadWire.mockReturnValue(new Uint8Array([0xaa, 0xbb]));

    const verifyPromise = verifyWrittenPayload(expectedPayload as never, grant as never);

    // Wait for scan to start, then emit reading event
    await new Promise((r) => setTimeout(r, 20));
    const reader = MockNDEFReader.instances[0];
    reader.emit("reading", {
      message: { records: [] },
      serialNumber: "AA:BB",
    });

    await expect(verifyPromise).resolves.toBeUndefined();
  });

  it("rejects when payload does not match", async () => {
    const { verifyWrittenPayload } = await import("../writeVerification");
    const expectedPayload = makePayload();
    const grant = makeGrant();

    // First call (expected) returns [0xaa, 0xbb], second (actual) returns [0xcc, 0xdd]
    mockEncodePayloadWire
      .mockReturnValueOnce(new Uint8Array([0xaa, 0xbb]))
      .mockReturnValueOnce(new Uint8Array([0xcc, 0xdd]));

    const verifyPromise = verifyWrittenPayload(expectedPayload as never, grant as never);

    await new Promise((r) => setTimeout(r, 20));
    const reader = MockNDEFReader.instances[0];
    reader.emit("reading", {
      message: { records: [] },
      serialNumber: "AA:BB",
    });

    await expect(verifyPromise).rejects.toThrow("Write verification failed");
  });

  it("rejects when extractCardBytes returns null", async () => {
    mockExtractCardBytes.mockReturnValue(null);
    const { verifyWrittenPayload } = await import("../writeVerification");
    const grant = makeGrant();

    const verifyPromise = verifyWrittenPayload(makePayload() as never, grant as never);

    await new Promise((r) => setTimeout(r, 20));
    const reader = MockNDEFReader.instances[0];
    reader.emit("reading", {
      message: { records: [] },
      serialNumber: "AA:BB",
    });

    await expect(verifyPromise).rejects.toThrow("Write verification failed");
  });

  it("rejects on readingerror event", async () => {
    const { verifyWrittenPayload } = await import("../writeVerification");
    const grant = makeGrant();

    const verifyPromise = verifyWrittenPayload(makePayload() as never, grant as never);

    await new Promise((r) => setTimeout(r, 20));
    const reader = MockNDEFReader.instances[0];
    reader.emit("readingerror");

    // Wait for retry (MAX_VERIFICATION_RETRIES=1, so one more attempt)
    await new Promise((r) => setTimeout(r, 50));
    const reader2 = MockNDEFReader.instances.at(-1);
    reader2?.emit("readingerror");

    await expect(verifyPromise).rejects.toThrow("Write verification failed");
  }, 10000);

  it("rejects after timeout when no card is tapped", async () => {
    // VERIFICATION_TIMEOUT_MS is mocked to 500ms, so this should reject quickly
    const { verifyWrittenPayload } = await import("../writeVerification");
    const grant = makeGrant();

    // Don't emit any reading event - let the timeout fire naturally
    const verifyPromise = verifyWrittenPayload(makePayload() as never, grant as never);

    // Wait longer than VERIFICATION_TIMEOUT_MS * (MAX_VERIFICATION_RETRIES + 1) + retry delays
    // 500ms * 2 attempts + 300ms retry delay = ~1300ms
    await expect(verifyPromise).rejects.toThrow("Write verification failed");
  }, 10000);

  it("retries on decode failure and succeeds on second attempt", async () => {
    // Fail first attempt, succeed on second
    mockDecodeCardPayloadForVerification
      .mockRejectedValueOnce(new Error("decode error"))
      .mockResolvedValue(makePayload());

    mockEncodePayloadWire.mockReturnValue(new Uint8Array([0xaa, 0xbb]));

    const { verifyWrittenPayload } = await import("../writeVerification");
    const grant = makeGrant();

    const verifyPromise = verifyWrittenPayload(makePayload() as never, grant as never);

    // First attempt - emit reading, decode fails
    await new Promise((r) => setTimeout(r, 20));
    const reader1 = MockNDEFReader.instances[0];
    reader1.emit("reading", { message: { records: [] }, serialNumber: "AA:BB" });

    // Wait for retry delay (300ms) + second attempt
    await new Promise((r) => setTimeout(r, 400));
    const reader2 = MockNDEFReader.instances.at(-1);
    reader2?.emit("reading", { message: { records: [] }, serialNumber: "AA:BB" });

    await expect(verifyPromise).resolves.toBeUndefined();
  }, 10000);
});
