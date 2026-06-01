/**
 * Coverage tests for nfc/engine.ts - readCard, writeCard,
 * checkNfcAvailability, and enforceBlock* functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../validation/blockEnforcer", () => ({
  checkBlocked: vi.fn(),
  checkBlockedSync: vi.fn(),
}));

import {
  checkNfcAvailability,
  readCard,
  writeCard,
  enforceBlockOnCheckin,
  enforceBlockOnCheckout,
  enforceBlockSync,
} from "../engine";
import type { CardPayload } from "../../payload/types";
import { WIRE_SIZE, CARD_SIZE, MAGIC } from "../../payload/types";
import type { CardRepository } from "../../interfaces/CardRepository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a mock CardRepository for test injection */
const mockCardRepo: CardRepository = {
  getByTenantAndCardId: vi.fn().mockResolvedValue(undefined),
  filterByCardIdExcludingDeleted: vi.fn().mockResolvedValue([]),
  updateStatus: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
};

function makePayload(statusOverride = 0): CardPayload {
  return {
    header: { magic: MAGIC, version: 1, type: 0, cardId: new Uint8Array(6), tenantBind: 0 },
    identity: { name: "Test", userId: "ABCD1234", gender: 0, status: statusOverride, createdAt: 0 },
    wallet: { balance: 0, lastBalance: 0, counter: 0n, lastTimestamp: 0, state: 0, flags: 0 },
    session: { startTime: 0, endTime: 0, terminalId: 0 },
    logEntries: [],
    trailer: {
      expiresAt: 0,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 0,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// checkNfcAvailability
// ---------------------------------------------------------------------------

describe("checkNfcAvailability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 'unavailable' when NDEFReader is not present", async () => {
    const result = await checkNfcAvailability();
    expect(result).toBe("unavailable");
  });

  it("returns 'permission_denied' when NFC permission is denied", async () => {
    vi.stubGlobal("NDEFReader", class {});
    vi.stubGlobal("navigator", {
      permissions: {
        query: vi.fn().mockResolvedValue({ state: "denied" }),
      },
    });
    const result = await checkNfcAvailability();
    expect(result).toBe("permission_denied");
  });

  it("returns 'available' when NFC permission is granted", async () => {
    vi.stubGlobal("NDEFReader", class {});
    vi.stubGlobal("navigator", {
      permissions: {
        query: vi.fn().mockResolvedValue({ state: "granted" }),
      },
    });
    const result = await checkNfcAvailability();
    expect(result).toBe("available");
  });

  it("returns 'unknown' when permissions.query throws", async () => {
    vi.stubGlobal("NDEFReader", class {});
    vi.stubGlobal("navigator", {
      permissions: {
        query: vi.fn().mockRejectedValue(new Error("Not supported")),
      },
    });
    const result = await checkNfcAvailability();
    expect(result).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// readCard
// ---------------------------------------------------------------------------

describe("readCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok=false when NFC is not supported", async () => {
    // NDEFReader not in globalThis (default test env)
    const result = await readCard(new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not supported/i);
  });

  it("resolves ok=true when reading event fires with valid card data", async () => {
    const buf = new ArrayBuffer(WIRE_SIZE);
    const view = new DataView(buf);
    // Write MAGIC at offset 0 so extractCardBytes returns data
    view.setUint32(0, MAGIC, true);

    const listeners: Record<string, Function> = {};
    class MockNDEFReader {
      addEventListener(type: string, handler: Function) {
        listeners[type] = handler;
      }
      scan() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("NDEFReader", MockNDEFReader);

    const promise = readCard(new AbortController().signal);

    // Simulate reading event
    listeners["reading"]?.({
      serialNumber: "AA:BB:CC:DD:EE:FF",
      message: {
        records: [{ recordType: "unknown", data: new DataView(buf) }],
      },
    });

    const result = await promise;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.serialNumber).toBe("AA:BB:CC:DD:EE:FF");
      expect(result.raw.length).toBe(WIRE_SIZE);
    }
  });

  it("resolves ok=false when reading event fires with no valid data", async () => {
    const listeners: Record<string, Function> = {};
    class MockNDEFReader {
      addEventListener(type: string, handler: Function) {
        listeners[type] = handler;
      }
      scan() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("NDEFReader", MockNDEFReader);

    const promise = readCard(new AbortController().signal);

    listeners["reading"]?.({
      serialNumber: "AA:BB",
      message: { records: [] }, // no data → extractCardBytes returns null
    });

    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/valid/i);
  });

  it("resolves ok=false when readingerror fires", async () => {
    const listeners: Record<string, Function> = {};
    class MockNDEFReader {
      addEventListener(type: string, handler: Function) {
        listeners[type] = handler;
      }
      scan() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("NDEFReader", MockNDEFReader);

    const promise = readCard(new AbortController().signal);

    listeners["readingerror"]?.({
      error: new DOMException("Tag not found", "NotFoundError"),
    });

    const result = await promise;
    expect(result.ok).toBe(false);
  });

  it("resolves ok=false when scan() rejects", async () => {
    class MockNDEFReader {
      addEventListener(_type: string, _handler: Function) {
        // No-op mock - tests that don't need reading events use this
      }
      scan() {
        return Promise.reject(new Error("Permission denied"));
      }
    }
    vi.stubGlobal("NDEFReader", MockNDEFReader);

    const result = await readCard(new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Permission denied");
  });
});

// ---------------------------------------------------------------------------
// writeCard
// ---------------------------------------------------------------------------

describe("writeCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok=false when NFC is not supported", async () => {
    const result = await writeCard(new Uint8Array(WIRE_SIZE), new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not supported/i);
  });

  it("returns ok=false for wrong byte length", async () => {
    vi.stubGlobal("NDEFReader", class {});
    const result = await writeCard(new Uint8Array(100), new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/expected/i);
  });

  it("returns ok=true when write succeeds with WIRE_SIZE bytes", async () => {
    class MockNDEFReader {
      write() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("NDEFReader", MockNDEFReader);

    const result = await writeCard(new Uint8Array(WIRE_SIZE), new AbortController().signal);
    expect(result.ok).toBe(true);
  });

  it("returns ok=true when write succeeds with CARD_SIZE bytes", async () => {
    class MockNDEFReader {
      write() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("NDEFReader", MockNDEFReader);

    const result = await writeCard(new Uint8Array(CARD_SIZE), new AbortController().signal);
    expect(result.ok).toBe(true);
  });

  it("returns ok=false with friendly error when write throws DOMException", async () => {
    class MockNDEFReader {
      write() {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
    }
    vi.stubGlobal("NDEFReader", MockNDEFReader);

    const result = await writeCard(new Uint8Array(WIRE_SIZE), new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("dibatalkan");
  });
});

// ---------------------------------------------------------------------------
// enforceBlockOnCheckin / enforceBlockOnCheckout
// ---------------------------------------------------------------------------

describe("enforceBlockOnCheckin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns allowed=true when card is not blocked", async () => {
    const { checkBlocked } = await import("../../validation/blockEnforcer");

    // @ts-expect-error expected for test purposes
    vi.mocked(checkBlocked).mockResolvedValue({ blocked: false, errorCode: "ACTIVE" });

    const result = await enforceBlockOnCheckin("tenant-1", "card-1", makePayload(), {
      cardRepo: mockCardRepo,
    });
    expect(result.allowed).toBe(true);
  });

  it("returns allowed=false with error when card is blocked", async () => {
    const { checkBlocked } = await import("../../validation/blockEnforcer");
    vi.mocked(checkBlocked).mockResolvedValue({
      blocked: true,
      message: "Kartu diblokir karena tamper",
      // @ts-expect-error expected for test purposes
      errorCode: "BLOCKED_TAMPER",
    });

    const result = await enforceBlockOnCheckin("tenant-1", "card-1", makePayload(1), {
      cardRepo: mockCardRepo,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error).toBe("Kartu diblokir karena tamper");
      expect(result.errorCode).toBe("BLOCKED_TAMPER");
    }
  });

  it("uses default error message when blocked but no message provided", async () => {
    const { checkBlocked } = await import("../../validation/blockEnforcer");
    // @ts-expect-error expected for test purposes
    vi.mocked(checkBlocked).mockResolvedValue({ blocked: true, errorCode: "BLOCKED_ADMIN" });

    const result = await enforceBlockOnCheckin("tenant-1", "card-1", makePayload(4), {
      cardRepo: mockCardRepo,
    });
    if (!result.allowed) {
      expect(result.error).toBe("Akses Ditolak: Kartu Diblokir");
    }
  });
});

describe("enforceBlockOnCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns allowed=true when card is not blocked", async () => {
    const { checkBlocked } = await import("../../validation/blockEnforcer");
    // @ts-expect-error expected for test purposes
    vi.mocked(checkBlocked).mockResolvedValue({ blocked: false, errorCode: "ACTIVE" });

    const result = await enforceBlockOnCheckout("tenant-1", "card-1", makePayload(), {
      cardRepo: mockCardRepo,
    });
    expect(result.allowed).toBe(true);
  });

  it("returns allowed=false when card is blocked", async () => {
    const { checkBlocked } = await import("../../validation/blockEnforcer");
    vi.mocked(checkBlocked).mockResolvedValue({
      blocked: true,
      message: "Kartu diblokir",
      // @ts-expect-error expected for test purposes
      errorCode: "BLOCKED_FRAUD",
    });

    const result = await enforceBlockOnCheckout("tenant-1", "card-1", makePayload(2), {
      cardRepo: mockCardRepo,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.errorCode).toBe("BLOCKED_FRAUD");
  });
});

describe("enforceBlockSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns allowed=true when card is not blocked", async () => {
    const { checkBlockedSync } = await import("../../validation/blockEnforcer");
    // @ts-expect-error expected for test purposes
    vi.mocked(checkBlockedSync).mockReturnValue({ blocked: false, errorCode: "ACTIVE" });

    const result = enforceBlockSync(makePayload());
    expect(result.allowed).toBe(true);
  });

  it("returns allowed=false when card is blocked", async () => {
    const { checkBlockedSync } = await import("../../validation/blockEnforcer");
    vi.mocked(checkBlockedSync).mockReturnValue({
      blocked: true,
      message: "Kartu expired",
      // @ts-expect-error expected for test purposes
      errorCode: "BLOCKED_EXPIRED",
    });

    const result = enforceBlockSync(makePayload(3));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error).toBe("Kartu expired");
      expect(result.errorCode).toBe("BLOCKED_EXPIRED");
    }
  });

  it("uses default error message when blocked but no message provided", async () => {
    const { checkBlockedSync } = await import("../../validation/blockEnforcer");
    // @ts-expect-error expected for test purposes
    vi.mocked(checkBlockedSync).mockReturnValue({ blocked: true, errorCode: "BLOCKED_ADMIN" });

    const result = enforceBlockSync(makePayload(4));
    if (!result.allowed) {
      expect(result.error).toBe("Akses Ditolak: Kartu Diblokir");
    }
  });
});
