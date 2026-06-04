// @vitest-environment jsdom
/**
 * Tests for CardSection.utils.tsx
 *
 * Covers:
 * - generateCardId: random bytes generation
 * - parseHexBytes: hex string parsing and error handling
 * - toPayloadCardId: conversion with padding/truncation
 * - toPayloadStatus: status mapping
 * - buildRecoveryPayload: payload construction
 * - CardAlreadyRegisteredError / CardNotBlankError
 * - validateCardForRecovery: pre-recovery validation
 * - handleForceOverwrite: NFC overwrite flow
 * - validateUIDForIssuance: UID validation with conflict detection
 * - checkLocalCardConflict: local DB conflict checking
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDecodePayload = vi.fn();
const mockEncodeTenantBind = vi.fn();
const mockExtractCardBytes = vi.fn();
const mockPrepareWrite = vi.fn();
const mockValidateUID = vi.fn();
vi.mock("#/presentation/hooks/domain", () => ({
  decodePayload: (...args: unknown[]) => mockDecodePayload(...args),
  encodeTenantBind: (...args: unknown[]) => mockEncodeTenantBind(...args),
  extractCardBytes: (...args: unknown[]) => mockExtractCardBytes(...args),
  prepareWrite: (...args: unknown[]) => mockPrepareWrite(...args),
  validateUID: (...args: unknown[]) => mockValidateUID(...args),
}));

vi.mock("#/presentation/hooks/types", () => ({
  CARD_SCHEMA_VERSION: 4,
  CardState: { IDLE: 0, CHECKED_IN: 1 },
  CardStatus: {
    ACTIVE: 0,
    BLOCKED_TAMPER: 1,
    BLOCKED_FRAUD: 2,
    BLOCKED_EXPIRED: 3,
    BLOCKED_ADMIN: 4,
  },
  MAGIC: 0x4b4f5057,
}));

vi.mock("#/presentation/hooks/useErrorTracker", () => ({
  trackError: vi.fn(),
}));

const mockCardsGet = vi.fn();
const mockCardsPut = vi.fn();
const mockUsersGet = vi.fn();
vi.mock("#/presentation/hooks/useLocalDb", () => ({
  localDb: {
    cards: {
      get: (...args: unknown[]) => mockCardsGet(...args),
      put: (...args: unknown[]) => mockCardsPut(...args),
    },
    users: {
      get: (...args: unknown[]) => mockUsersGet(...args),
    },
  },
}));

vi.mock("#/presentation/hooks/useRepositories", () => ({
  cardRepo: {},
  onlineStatus: {},
  uidRemoteValidator: {},
}));

vi.mock("#/presentation/hooks/useSyncPull", () => ({
  syncPull: vi.fn().mockResolvedValue(undefined),
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockEncodeTenantBind.mockReturnValue(0x12345678);
  mockCardsGet.mockResolvedValue(undefined);
  mockCardsPut.mockResolvedValue(undefined);
  mockUsersGet.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateCardId", () => {
  it("returns a Uint8Array of 6 bytes", async () => {
    const { generateCardId } = await import("../CardSection.utils");
    const id = generateCardId();
    expect(id).toBeInstanceOf(Uint8Array);
    expect(id.length).toBe(6);
  });

  it("returns random bytes (two calls differ)", async () => {
    const { generateCardId } = await import("../CardSection.utils");
    const id1 = generateCardId();
    const id2 = generateCardId();
    // Extremely unlikely to be equal with 48 bits of randomness
    const hex1 = Array.from(id1)
      .map((b) => b.toString(16))
      .join("");
    const hex2 = Array.from(id2)
      .map((b) => b.toString(16))
      .join("");
    expect(hex1).not.toBe(hex2);
  });
});

describe("parseHexBytes", () => {
  it("parses clean hex string", async () => {
    const { parseHexBytes } = await import("../CardSection.utils");
    const result = parseHexBytes("aabbcc");
    expect(result).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc]));
  });

  it("handles colon-separated hex (NFC serial format)", async () => {
    const { parseHexBytes } = await import("../CardSection.utils");
    const result = parseHexBytes("AA:BB:CC:DD");
    expect(result).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]));
  });

  it("handles uppercase hex", async () => {
    const { parseHexBytes } = await import("../CardSection.utils");
    const result = parseHexBytes("DEADBEEF");
    expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it("throws on empty string", async () => {
    const { parseHexBytes } = await import("../CardSection.utils");
    expect(() => parseHexBytes("")).toThrow("ID kartu tidak valid");
  });

  it("throws on odd-length hex after normalization", async () => {
    const { parseHexBytes } = await import("../CardSection.utils");
    expect(() => parseHexBytes("abc")).toThrow("ID kartu tidak valid");
  });

  it("throws on non-hex characters only", async () => {
    const { parseHexBytes } = await import("../CardSection.utils");
    expect(() => parseHexBytes("xyz")).toThrow("ID kartu tidak valid");
  });
});

describe("toPayloadCardId", () => {
  it("returns 6-byte array as-is", async () => {
    const { toPayloadCardId } = await import("../CardSection.utils");
    const result = toPayloadCardId("aabbccddeeff");
    expect(result).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]));
  });

  it("truncates longer arrays to last 6 bytes", async () => {
    const { toPayloadCardId } = await import("../CardSection.utils");
    const result = toPayloadCardId("0011aabbccddeeff");
    expect(result).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]));
  });

  it("pads shorter arrays with leading zeros", async () => {
    const { toPayloadCardId } = await import("../CardSection.utils");
    const result = toPayloadCardId("aabb");
    expect(result).toEqual(new Uint8Array([0x00, 0x00, 0x00, 0x00, 0xaa, 0xbb]));
  });

  it("handles colon-separated serial numbers", async () => {
    const { toPayloadCardId } = await import("../CardSection.utils");
    const result = toPayloadCardId("AA:BB:CC:DD:EE:FF");
    expect(result).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]));
  });
});

describe("toPayloadStatus", () => {
  it("maps active to CardStatus.ACTIVE (0)", async () => {
    const { toPayloadStatus } = await import("../CardSection.utils");
    expect(toPayloadStatus("active")).toBe(0);
  });

  it("maps blocked_tamper to CardStatus.BLOCKED_TAMPER (1)", async () => {
    const { toPayloadStatus } = await import("../CardSection.utils");
    expect(toPayloadStatus("blocked_tamper")).toBe(1);
  });

  it("maps blocked_fraud to CardStatus.BLOCKED_FRAUD (2)", async () => {
    const { toPayloadStatus } = await import("../CardSection.utils");
    expect(toPayloadStatus("blocked_fraud")).toBe(2);
  });

  it("maps blocked_expired to CardStatus.BLOCKED_EXPIRED (3)", async () => {
    const { toPayloadStatus } = await import("../CardSection.utils");
    expect(toPayloadStatus("blocked_expired")).toBe(3);
  });

  it("maps blocked_admin to CardStatus.BLOCKED_ADMIN (4)", async () => {
    const { toPayloadStatus } = await import("../CardSection.utils");
    expect(toPayloadStatus("blocked_admin")).toBe(4);
  });

  it("throws for deleted status", async () => {
    const { toPayloadStatus } = await import("../CardSection.utils");
    expect(() => toPayloadStatus("deleted")).toThrow("Kartu yang dihapus tidak bisa dipulihkan");
  });
});

describe("buildRecoveryPayload", () => {
  it("builds a valid CardPayload from card data", async () => {
    const { buildRecoveryPayload } = await import("../CardSection.utils");
    const card = {
      tenantId: "t-1",
      cardId: "aabbccddeeff",
      userId: "user-1",
      status: "active" as const,
      balance: 50000,
      counter: 5,
      keyVersion: 2,
      createdAt: 1700000000,
      lastActivityAt: 1700001000,
      expiresAt: 1800000000,
      notes: null,
      syncStatus: "synced" as const,
    };

    const payload = buildRecoveryPayload({
      tenantId: "t-1",
      card,
      ownerName: "Budi",
      keyVersion: 2,
    });

    expect(payload.header.magic).toBe(0x4b4f5057);
    expect(payload.header.version).toBe(4);
    expect(payload.identity.name).toBe("Budi");
    expect(payload.identity.userId).toBe("user-1");
    expect(payload.identity.status).toBe(0); // ACTIVE
    expect(payload.wallet.balance).toBe(50000);
    expect(payload.wallet.counter).toBe(5n);
    expect(payload.wallet.state).toBe(0); // IDLE
    expect(payload.trailer.expiresAt).toBe(1800000000);
    expect(payload.trailer.keyVersion).toBe(2);
    expect(payload.trailer.counterBind).toBe(5);
  });

  it("uses 9_999_999_999 when expiresAt is null", async () => {
    const { buildRecoveryPayload } = await import("../CardSection.utils");
    const card = {
      tenantId: "t-1",
      cardId: "aabbccddeeff",
      userId: null,
      status: "active" as const,
      balance: 0,
      counter: 1,
      keyVersion: 1,
      createdAt: 1700000000,
      lastActivityAt: 1700000000,
      expiresAt: null,
      notes: null,
      syncStatus: "synced" as const,
    };

    const payload = buildRecoveryPayload({
      tenantId: "t-1",
      card,
      ownerName: "Anggota",
      keyVersion: 1,
    });

    expect(payload.trailer.expiresAt).toBe(9_999_999_999);
  });

  it("uses counter=1 minimum when card counter is 0", async () => {
    const { buildRecoveryPayload } = await import("../CardSection.utils");
    const card = {
      tenantId: "t-1",
      cardId: "112233445566",
      userId: null,
      status: "active" as const,
      balance: 0,
      counter: 0,
      keyVersion: 1,
      createdAt: 1700000000,
      lastActivityAt: 1700000000,
      expiresAt: null,
      notes: null,
      syncStatus: "synced" as const,
    };

    const payload = buildRecoveryPayload({
      tenantId: "t-1",
      card,
      ownerName: "Test",
      keyVersion: 1,
    });

    expect(payload.wallet.counter).toBe(1n);
    expect(payload.trailer.counterBind).toBe(1);
  });

  it("uses empty string when userId is null", async () => {
    const { buildRecoveryPayload } = await import("../CardSection.utils");
    const card = {
      tenantId: "t-1",
      cardId: "aabbccddeeff",
      userId: null,
      status: "active" as const,
      balance: 100,
      counter: 1,
      keyVersion: 1,
      createdAt: 1700000000,
      lastActivityAt: 1700000000,
      expiresAt: null,
      notes: null,
      syncStatus: "synced" as const,
    };

    const payload = buildRecoveryPayload({
      tenantId: "t-1",
      card,
      ownerName: "Test",
      keyVersion: 1,
    });

    expect(payload.identity.userId).toBe("");
  });
});

describe("CardAlreadyRegisteredError", () => {
  it("has correct name and message", async () => {
    const { CardAlreadyRegisteredError } = await import("../CardSection.utils");
    const err = new CardAlreadyRegisteredError({
      cardId: "c-1",
      ownerName: "Owner",
      userId: "u-1",
      balance: 5000,
      status: "active",
    });

    expect(err.name).toBe("CardAlreadyRegisteredError");
    expect(err.message).toBe("Kartu sudah terdaftar");
    expect(err.existingCard).toEqual({
      cardId: "c-1",
      ownerName: "Owner",
      userId: "u-1",
      balance: 5000,
      status: "active",
    });
    expect(err).toBeInstanceOf(Error);
  });
});

describe("CardNotBlankError", () => {
  it("has correct name, message, and serial", async () => {
    const { CardNotBlankError } = await import("../CardSection.utils");
    const err = new CardNotBlankError("serial-123");

    expect(err.name).toBe("CardNotBlankError");
    expect(err.message).toBe("Kartu sudah berisi data");
    expect(err.cardSerial).toBe("serial-123");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("validateCardForRecovery", () => {
  it("allows recovery when cardBytes is null (blank card)", async () => {
    const { validateCardForRecovery } = await import("../CardSection.utils");
    await expect(validateCardForRecovery(null, 5, 1000)).resolves.toBeUndefined();
  });

  it("allows recovery when decode fails (corrupted card)", async () => {
    const { validateCardForRecovery } = await import("../CardSection.utils");
    mockDecodePayload.mockImplementation(() => {
      throw new Error("Invalid magic");
    });

    await expect(validateCardForRecovery(new Uint8Array(128), 5, 1000)).resolves.toBeUndefined();
  });

  it("throws when card is still valid (counter >= server and balance <= server)", async () => {
    const { validateCardForRecovery } = await import("../CardSection.utils");
    mockDecodePayload.mockReturnValue({
      wallet: { counter: 10n, balance: 500 },
    });

    await expect(validateCardForRecovery(new Uint8Array(128), 10, 500)).rejects.toThrow(
      "Kartu masih valid",
    );
  });

  it("throws when card has unsynced transactions (counter > server)", async () => {
    const { validateCardForRecovery } = await import("../CardSection.utils");
    mockDecodePayload.mockReturnValue({
      wallet: { counter: 15n, balance: 2000 },
    });

    await expect(validateCardForRecovery(new Uint8Array(128), 10, 500)).rejects.toThrow(
      "transaksi yang belum tersinkron",
    );
  });

  it("allows recovery when card counter < server counter", async () => {
    const { validateCardForRecovery } = await import("../CardSection.utils");
    mockDecodePayload.mockReturnValue({
      wallet: { counter: 3n, balance: 2000 },
    });

    await expect(validateCardForRecovery(new Uint8Array(128), 10, 1000)).resolves.toBeUndefined();
  });

  it("allows recovery when balance > server balance (card counter < server)", async () => {
    const { validateCardForRecovery } = await import("../CardSection.utils");
    mockDecodePayload.mockReturnValue({
      wallet: { counter: 5n, balance: 9999 },
    });

    await expect(validateCardForRecovery(new Uint8Array(128), 10, 1000)).resolves.toBeUndefined();
  });
});

describe("checkLocalCardConflict", () => {
  it("does nothing when no existing card found", async () => {
    mockCardsGet.mockResolvedValue(undefined);
    const { checkLocalCardConflict } = await import("../CardSection.utils");

    await expect(checkLocalCardConflict("serial-1", "t-1")).resolves.toBeUndefined();
  });

  it("throws CardAlreadyRegisteredError when card exists", async () => {
    mockCardsGet.mockResolvedValue({
      cardId: "serial-1",
      notes: "Existing Owner",
      userId: "u-1",
      balance: 3000,
      status: "active",
    });
    const { checkLocalCardConflict, CardAlreadyRegisteredError } =
      await import("../CardSection.utils");

    await expect(checkLocalCardConflict("serial-1", "t-1")).rejects.toThrow(
      CardAlreadyRegisteredError,
    );
  });

  it("includes owner name from notes", async () => {
    mockCardsGet.mockResolvedValue({
      cardId: "serial-1",
      notes: "Budi",
      userId: null,
      balance: 1000,
      status: "active",
    });
    const { checkLocalCardConflict, CardAlreadyRegisteredError } =
      await import("../CardSection.utils");

    try {
      await checkLocalCardConflict("serial-1", "t-1");
    } catch (e) {
      expect(e).toBeInstanceOf(CardAlreadyRegisteredError);
      expect((e as InstanceType<typeof CardAlreadyRegisteredError>).existingCard.ownerName).toBe(
        "Budi",
      );
    }
  });

  it("looks up user name when notes is empty and userId exists", async () => {
    mockCardsGet.mockResolvedValue({
      cardId: "serial-1",
      notes: null,
      userId: "u-1",
      balance: 500,
      status: "active",
    });
    mockUsersGet.mockResolvedValue({ name: "Siti" });
    const { checkLocalCardConflict, CardAlreadyRegisteredError } =
      await import("../CardSection.utils");

    try {
      await checkLocalCardConflict("serial-1", "t-1");
    } catch (e) {
      expect(e).toBeInstanceOf(CardAlreadyRegisteredError);
      expect((e as InstanceType<typeof CardAlreadyRegisteredError>).existingCard.ownerName).toBe(
        "Siti",
      );
    }
  });
});

describe("validateUIDForIssuance", () => {
  it("passes when UID is valid", async () => {
    mockValidateUID.mockResolvedValue({ valid: true });
    const { validateUIDForIssuance } = await import("../CardSection.utils");

    const abort = new AbortController();
    const ref = { current: null };

    await expect(
      validateUIDForIssuance("serial-1", "t-1", false, abort, ref),
    ).resolves.toBeUndefined();
  });

  it("throws CardAlreadyRegisteredError when UID is registered in same tenant", async () => {
    mockValidateUID.mockResolvedValue({ valid: false, reason: "UID_ALREADY_REGISTERED" });
    mockCardsGet.mockResolvedValue({
      cardId: "serial-1",
      notes: "Existing",
      userId: "u-1",
      balance: 100,
      status: "active",
    });
    const { validateUIDForIssuance, CardAlreadyRegisteredError } =
      await import("../CardSection.utils");

    const abort = new AbortController();
    const ref = { current: null };

    await expect(validateUIDForIssuance("serial-1", "t-1", false, abort, ref)).rejects.toThrow(
      CardAlreadyRegisteredError,
    );
  });

  it("throws CardAlreadyRegisteredError when UID is registered in other tenant", async () => {
    mockValidateUID.mockResolvedValue({
      valid: false,
      reason: "UID_REGISTERED_OTHER_TENANT",
      existingTenantId: "t-other",
    });
    const { validateUIDForIssuance, CardAlreadyRegisteredError } =
      await import("../CardSection.utils");

    const abort = new AbortController();
    const ref = { current: null };

    await expect(validateUIDForIssuance("serial-1", "t-1", false, abort, ref)).rejects.toThrow(
      CardAlreadyRegisteredError,
    );
  });

  it("allows overwrite when forceOverwrite is true and UID is registered same tenant", async () => {
    mockValidateUID.mockResolvedValue({ valid: false, reason: "UID_ALREADY_REGISTERED" });
    const { validateUIDForIssuance } = await import("../CardSection.utils");

    const abort = new AbortController();
    const ref = { current: null };

    await expect(
      validateUIDForIssuance("serial-1", "t-1", true, abort, ref),
    ).resolves.toBeUndefined();
  });

  it("allows overwrite when forceOverwrite is true and UID is registered other tenant", async () => {
    mockValidateUID.mockResolvedValue({
      valid: false,
      reason: "UID_REGISTERED_OTHER_TENANT",
      existingTenantId: "t-other",
    });
    const { validateUIDForIssuance } = await import("../CardSection.utils");

    const abort = new AbortController();
    const ref = { current: null };

    await expect(
      validateUIDForIssuance("serial-1", "t-1", true, abort, ref),
    ).resolves.toBeUndefined();
  });

  it("throws generic error for NETWORK_ERROR reason", async () => {
    mockValidateUID.mockResolvedValue({ valid: false, reason: "NETWORK_ERROR" });
    const { validateUIDForIssuance } = await import("../CardSection.utils");

    const abort = new AbortController();
    const ref = { current: null };

    await expect(validateUIDForIssuance("serial-1", "t-1", false, abort, ref)).rejects.toThrow(
      "Gagal memvalidasi UID: kesalahan jaringan",
    );
  });

  it("throws generic error for INVALID_UID_FORMAT reason", async () => {
    mockValidateUID.mockResolvedValue({ valid: false, reason: "INVALID_UID_FORMAT" });
    const { validateUIDForIssuance } = await import("../CardSection.utils");

    const abort = new AbortController();
    const ref = { current: null };

    await expect(validateUIDForIssuance("serial-1", "t-1", false, abort, ref)).rejects.toThrow(
      "Format UID tidak valid",
    );
  });

  it("aborts controller and clears ref on non-registered errors", async () => {
    mockValidateUID.mockResolvedValue({ valid: false, reason: "NETWORK_ERROR" });
    const { validateUIDForIssuance } = await import("../CardSection.utils");

    const abort = new AbortController();
    const ref = { current: { bytes: new Uint8Array(0), serial: "s", payload: {}, issueData: {} } };

    try {
      await validateUIDForIssuance("serial-1", "t-1", false, abort, ref as any);
    } catch {
      // expected
    }

    expect(abort.signal.aborted).toBe(true);
    expect(ref.current).toBeNull();
  });
});

describe("handleForceOverwrite", () => {
  it("returns false when reader is null (session expired)", async () => {
    const { handleForceOverwrite } = await import("../CardSection.utils");

    const result = await handleForceOverwrite({
      bytes: new Uint8Array(128),
      issuancePreparedRef: {
        current: {
          bytes: new Uint8Array(0),
          serial: "abc",
          payload: {} as any,
          issueData: {} as any,
        },
      },
      issuanceReaderRef: { current: null },
      issuanceAbortRef: { current: null },
      setIssuancePhase: vi.fn(),
      tenantId: "t-1",
      userId: "u-1",
      balance: 100,
      expiresAt: null,
      name: "Test",
      grant: { keyVersion: 1 } as any,
      qc: { invalidateQueries: vi.fn().mockResolvedValue(undefined) } as any,
    });

    expect(result).toBe(false);
  });

  it("returns false when abort signal is already aborted", async () => {
    const { handleForceOverwrite } = await import("../CardSection.utils");
    const abort = new AbortController();
    abort.abort();

    const result = await handleForceOverwrite({
      bytes: new Uint8Array(128),
      issuancePreparedRef: {
        current: {
          bytes: new Uint8Array(0),
          serial: "abc",
          payload: {} as any,
          issueData: {} as any,
        },
      },
      issuanceReaderRef: { current: {} as any },
      issuanceAbortRef: { current: abort },
      setIssuancePhase: vi.fn(),
      tenantId: "t-1",
      userId: null,
      balance: 0,
      expiresAt: null,
      name: "Test",
      grant: { keyVersion: 1 } as any,
      qc: { invalidateQueries: vi.fn().mockResolvedValue(undefined) } as any,
    });

    expect(result).toBe(false);
  });

  it("returns true and persists card on successful write", async () => {
    const { handleForceOverwrite } = await import("../CardSection.utils");
    const abort = new AbortController();
    const mockWriter = { write: vi.fn().mockResolvedValue(undefined) };
    const setIssuancePhase = vi.fn();
    const mockQc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    const preparedRef = {
      current: {
        bytes: new Uint8Array(0),
        serial: "abc123",
        payload: { trailer: { keyVersion: 2 } } as any,
        issueData: { name: "Test", userId: "u-1", balance: 500, expiresAt: null },
      },
    };

    const result = await handleForceOverwrite({
      bytes: new Uint8Array(128),
      issuancePreparedRef: preparedRef,
      issuanceReaderRef: { current: mockWriter as any },
      issuanceAbortRef: { current: abort },
      setIssuancePhase,
      tenantId: "t-1",
      userId: "u-1",
      balance: 500,
      expiresAt: null,
      name: "Test",
      grant: { keyVersion: 2 } as any,
      qc: mockQc as any,
    });

    expect(result).toBe(true);
    expect(setIssuancePhase).toHaveBeenCalledWith("writing");
    expect(setIssuancePhase).toHaveBeenCalledWith("done");
    expect(mockWriter.write).toHaveBeenCalled();
    expect(mockCardsPut).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-1",
        cardId: "abc123",
        userId: "u-1",
        balance: 500,
        status: "active",
        syncStatus: "pending",
      }),
    );
  });

  it("returns false when write throws (card removed)", async () => {
    const { handleForceOverwrite } = await import("../CardSection.utils");
    const abort = new AbortController();
    const mockWriter = { write: vi.fn().mockRejectedValue(new Error("NFC disconnected")) };
    const setIssuancePhase = vi.fn();

    const result = await handleForceOverwrite({
      bytes: new Uint8Array(128),
      issuancePreparedRef: {
        current: {
          bytes: new Uint8Array(0),
          serial: "abc",
          payload: {} as any,
          issueData: {} as any,
        },
      },
      issuanceReaderRef: { current: mockWriter as any },
      issuanceAbortRef: { current: abort },
      setIssuancePhase,
      tenantId: "t-1",
      userId: null,
      balance: 0,
      expiresAt: null,
      name: "Test",
      grant: { keyVersion: 1 } as any,
      qc: { invalidateQueries: vi.fn().mockResolvedValue(undefined) } as any,
    });

    expect(result).toBe(false);
    expect(setIssuancePhase).toHaveBeenCalledWith("writing");
  });
});
