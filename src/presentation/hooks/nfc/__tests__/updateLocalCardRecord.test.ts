/**
 * Tests for src/hooks/nfc/updateLocalCardRecord.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCardsGet = vi.fn();
const mockCardsUpdate = vi.fn();
const mockCardsPut = vi.fn();
const mockUsersGet = vi.fn();
const mockUsersUpdate = vi.fn();

vi.mock("#/infrastructure/persistence/dexie/localDb", () => ({
  localDb: {
    cards: {
      get: (...args: unknown[]) => mockCardsGet(...args),
      update: (...args: unknown[]) => mockCardsUpdate(...args),
      put: (...args: unknown[]) => mockCardsPut(...args),
    },
    users: {
      get: (...args: unknown[]) => mockUsersGet(...args),
      update: (...args: unknown[]) => mockUsersUpdate(...args),
    },
  },
}));

import { updateLocalCardRecord, updateLocalUserFromCard } from "../updateLocalCardRecord";
import type { CardPayload } from "#/core/payload/types";
import { CardStatus } from "#/core/payload/types";

function makePayload(
  overrides: {
    status?: number;
    balance?: number;
    counter?: bigint;
    userId?: string;
    name?: string;
    cardId?: Uint8Array;
    createdAt?: number;
  } = {},
): CardPayload {
  return {
    header: {
      magic: 0,
      version: 1,
      type: 0,
      cardId: overrides.cardId ?? new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]),
      tenantBind: new Uint8Array(4),
    },
    identity: {
      name: overrides.name ?? "Test User",
      userId: overrides.userId ?? "user-1",
      gender: 0,
      status: overrides.status ?? CardStatus.ACTIVE,
      createdAt: overrides.createdAt ?? 1000,
    },
    wallet: {
      balance: overrides.balance ?? 50000,
      lastBalance: 50000,
      counter: overrides.counter ?? 5n,
      lastTimestamp: 1700000000,
      state: 0,
      flags: 0,
    },
    session: { startTime: 0, endTime: 0, terminalId: 0 },
    logEntries: [],
    trailer: {
      expiresAt: 9999999999,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 5,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  } as unknown as CardPayload;
}

describe("updateLocalCardRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCardsGet.mockResolvedValue(undefined);
    mockCardsUpdate.mockResolvedValue(undefined);
    mockCardsPut.mockResolvedValue(undefined);
  });

  it("updates existing card record", async () => {
    const existing = { cardId: "010203040506", balance: 60000, counter: 4 };
    mockCardsGet.mockResolvedValue(existing);

    const payload = makePayload({ balance: 50000, counter: 5n });
    await updateLocalCardRecord("t-1", payload);

    expect(mockCardsUpdate).toHaveBeenCalledWith(
      ["t-1", "010203040506"],
      expect.objectContaining({
        balance: 50000,
        counter: 5,
        status: "active",
      }),
    );
    expect(mockCardsPut).not.toHaveBeenCalled();
  });

  it("inserts new card record when not found", async () => {
    mockCardsGet.mockResolvedValue(undefined);

    const payload = makePayload({ balance: 50000, counter: 1n });
    await updateLocalCardRecord("t-1", payload);

    expect(mockCardsPut).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-1",
        cardId: "010203040506",
        balance: 50000,
        counter: 1,
        status: "active",
        syncStatus: "pending",
      }),
    );
    expect(mockCardsUpdate).not.toHaveBeenCalled();
  });

  it("maps BLOCKED_TAMPER status correctly", async () => {
    mockCardsGet.mockResolvedValue({ cardId: "010203040506" });
    const payload = makePayload({ status: CardStatus.BLOCKED_TAMPER });
    await updateLocalCardRecord("t-1", payload);

    expect(mockCardsUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "blocked_tamper" }),
    );
  });

  it("maps BLOCKED_FRAUD status correctly", async () => {
    mockCardsGet.mockResolvedValue({ cardId: "010203040506" });
    const payload = makePayload({ status: CardStatus.BLOCKED_FRAUD });
    await updateLocalCardRecord("t-1", payload);

    expect(mockCardsUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "blocked_fraud" }),
    );
  });

  it("maps BLOCKED_EXPIRED status correctly", async () => {
    mockCardsGet.mockResolvedValue({ cardId: "010203040506" });
    const payload = makePayload({ status: CardStatus.BLOCKED_EXPIRED });
    await updateLocalCardRecord("t-1", payload);

    expect(mockCardsUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "blocked_expired" }),
    );
  });

  it("maps BLOCKED_ADMIN status correctly", async () => {
    mockCardsGet.mockResolvedValue({ cardId: "010203040506" });
    const payload = makePayload({ status: CardStatus.BLOCKED_ADMIN });
    await updateLocalCardRecord("t-1", payload);

    expect(mockCardsUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "blocked_admin" }),
    );
  });

  it("swallows errors silently (non-fatal)", async () => {
    mockCardsGet.mockRejectedValue(new Error("IndexedDB error"));

    const payload = makePayload();
    await expect(updateLocalCardRecord("t-1", payload)).resolves.toBeUndefined();
  });

  it("includes userId in update when present", async () => {
    mockCardsGet.mockResolvedValue({ cardId: "010203040506" });
    const payload = makePayload({ userId: "user-abc" });
    await updateLocalCardRecord("t-1", payload);

    expect(mockCardsUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "user-abc" }),
    );
  });
});

describe("updateLocalUserFromCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersGet.mockResolvedValue(undefined);
    mockUsersUpdate.mockResolvedValue(undefined);
  });

  it("does nothing when userId is empty", async () => {
    const payload = makePayload({ userId: "" });
    await updateLocalUserFromCard("t-1", payload);

    expect(mockUsersGet).not.toHaveBeenCalled();
    expect(mockUsersUpdate).not.toHaveBeenCalled();
  });

  it("does nothing when user not found in local DB", async () => {
    mockUsersGet.mockResolvedValue(undefined);
    const payload = makePayload({ userId: "user-1" });
    await updateLocalUserFromCard("t-1", payload);

    expect(mockUsersUpdate).not.toHaveBeenCalled();
  });

  it("updates user name when it differs from local DB", async () => {
    mockUsersGet.mockResolvedValue({ userId: "user-1", name: "Old Name", updatedAt: 1000 });
    const payload = makePayload({ userId: "user-1", name: "New Name" });
    await updateLocalUserFromCard("t-1", payload);

    expect(mockUsersUpdate).toHaveBeenCalledWith(
      ["t-1", "user-1"],
      expect.objectContaining({ name: "New Name" }),
    );
  });

  it("does not update name when it matches local DB", async () => {
    mockUsersGet.mockResolvedValue({ userId: "user-1", name: "Same Name", updatedAt: 1000 });
    const payload = makePayload({ userId: "user-1", name: "Same Name" });
    await updateLocalUserFromCard("t-1", payload);

    expect(mockUsersUpdate).toHaveBeenCalledWith(
      ["t-1", "user-1"],
      expect.not.objectContaining({ name: expect.anything() }),
    );
  });

  it("swallows errors silently (non-fatal)", async () => {
    mockUsersGet.mockRejectedValue(new Error("DB error"));
    const payload = makePayload({ userId: "user-1" });
    await expect(updateLocalUserFromCard("t-1", payload)).resolves.toBeUndefined();
  });
});
