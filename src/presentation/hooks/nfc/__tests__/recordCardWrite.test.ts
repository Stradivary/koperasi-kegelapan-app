/**
 * Tests for src/hooks/nfc/recordCardWrite.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockOutboxAdd = vi.fn();
const mockRecordTransaction = vi.fn();
const mockUpdateLocalCardRecord = vi.fn();
const mockUpdateLocalUserFromCard = vi.fn();

vi.mock("#/infrastructure/persistence/dexie/indexeddb", () => ({
  reconciliationOutbox: {
    add: (...args: unknown[]) => mockOutboxAdd(...args),
  },
  makeIdempotencyKey: (tenantId: string, cardIdHex: string, counter: number) =>
    `${tenantId}:${cardIdHex}:${counter}`,
}));

vi.mock("#/infrastructure/persistence/dexie/transactionLogService", () => ({
  recordTransaction: (...args: unknown[]) => mockRecordTransaction(...args),
}));

vi.mock("../updateLocalCardRecord", () => ({
  updateLocalCardRecord: (...args: unknown[]) => mockUpdateLocalCardRecord(...args),
  updateLocalUserFromCard: (...args: unknown[]) => mockUpdateLocalUserFromCard(...args),
}));

import { recordCardWrite } from "../recordCardWrite";
import type { CardPayload } from "#/core/payload/types";

function makePayload(
  overrides: Partial<{
    balance: number;
    counter: bigint;
    lastTimestamp: number;
    userId: string;
    name: string;
    cardId: Uint8Array;
    logEntries: { hash: Uint8Array }[];
  }> = {},
): CardPayload {
  return {
    header: {
      magic: 0xdeadbeef,
      version: 1,
      type: 0,
      cardId: overrides.cardId ?? new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]),
      tenantBind: new Uint8Array(4),
    },
    identity: {
      name: overrides.name ?? "Test User",
      userId: overrides.userId ?? "user-1",
      gender: 0,
      status: 1,
      createdAt: 1000,
    },
    wallet: {
      balance: overrides.balance ?? 50000,
      lastBalance: 60000,
      counter: overrides.counter ?? 5n,
      lastTimestamp: overrides.lastTimestamp ?? 1700000000,
      state: 0,
      flags: 0,
    },
    session: { startTime: 0, endTime: 0, terminalId: 0 },
    logEntries: overrides.logEntries ?? [{ hash: new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]) }],
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

describe("recordCardWrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOutboxAdd.mockResolvedValue(undefined);
    mockRecordTransaction.mockResolvedValue(undefined);
    mockUpdateLocalCardRecord.mockResolvedValue(undefined);
    mockUpdateLocalUserFromCard.mockResolvedValue(undefined);
  });

  it("adds entry to reconciliation outbox", async () => {
    const current = makePayload({ balance: 60000 });
    const updated = makePayload({ balance: 50000 });

    await recordCardWrite({
      tenantId: "t-1",
      terminalId: 1,
      operationType: "debit",
      currentPayload: current,
      updatedPayload: updated,
      cardName: "Test User",
    });

    expect(mockOutboxAdd).toHaveBeenCalledOnce();
    const call = mockOutboxAdd.mock.calls[0][0];
    expect(call.tenantId).toBe("t-1");
    expect(call.terminalId).toBe(1);
    expect(call.type).toBe("debit");
    expect(call.amount).toBe(10000); // 60000 - 50000
    expect(call.balanceAfter).toBe(50000);
  });

  it("records transaction in transaction log", async () => {
    const current = makePayload({ balance: 60000 });
    const updated = makePayload({ balance: 50000 });

    await recordCardWrite({
      tenantId: "t-1",
      terminalId: 1,
      operationType: "checkout",
      currentPayload: current,
      updatedPayload: updated,
      cardName: "Test User",
    });

    expect(mockRecordTransaction).toHaveBeenCalledOnce();
    const call = mockRecordTransaction.mock.calls[0][0];
    expect(call.type).toBe("checkout");
    expect(call.amount).toBe(10000);
  });

  it("updates local card and user records", async () => {
    const current = makePayload({ balance: 60000 });
    const updated = makePayload({ balance: 50000 });

    await recordCardWrite({
      tenantId: "t-1",
      terminalId: 1,
      operationType: "debit",
      currentPayload: current,
      updatedPayload: updated,
      cardName: null,
    });

    expect(mockUpdateLocalCardRecord).toHaveBeenCalledWith("t-1", updated);
    expect(mockUpdateLocalUserFromCard).toHaveBeenCalledWith("t-1", updated);
  });

  it("uses current time as timestamp when lastTimestamp is 0", async () => {
    const before = Date.now();
    const current = makePayload({ balance: 60000, lastTimestamp: 0 });
    const updated = makePayload({ balance: 50000, lastTimestamp: 0 });

    await recordCardWrite({
      tenantId: "t-1",
      terminalId: 1,
      operationType: "debit",
      currentPayload: current,
      updatedPayload: updated,
      cardName: null,
    });

    const call = mockOutboxAdd.mock.calls[0][0];
    const after = Date.now();
    expect(call.timestamp).toBeGreaterThanOrEqual(Math.floor(before / 1000));
    expect(call.timestamp).toBeLessThanOrEqual(Math.floor(after / 1000) + 1);
  });

  it("swallows transaction log errors (non-fatal)", async () => {
    mockRecordTransaction.mockRejectedValue(new Error("DB error"));
    const current = makePayload({ balance: 60000 });
    const updated = makePayload({ balance: 50000 });

    // Should not throw
    await expect(
      recordCardWrite({
        tenantId: "t-1",
        terminalId: 1,
        operationType: "debit",
        currentPayload: current,
        updatedPayload: updated,
        cardName: null,
      }),
    ).resolves.toBeUndefined();
  });

  it("uses empty userId when payload userId is empty string", async () => {
    const current = makePayload({ balance: 60000, userId: "" });
    const updated = makePayload({ balance: 50000, userId: "" });

    await recordCardWrite({
      tenantId: "t-1",
      terminalId: 1,
      operationType: "debit",
      currentPayload: current,
      updatedPayload: updated,
      cardName: null,
    });

    const call = mockRecordTransaction.mock.calls[0][0];
    expect(call.userId).toBeNull();
  });

  it("computes cardIdHex from payload header cardId bytes", async () => {
    const cardId = new Uint8Array([0xab, 0xcd, 0xef, 0x01, 0x23, 0x45]);
    const current = makePayload({ balance: 60000, cardId });
    const updated = makePayload({ balance: 50000, cardId });

    await recordCardWrite({
      tenantId: "t-1",
      terminalId: 1,
      operationType: "debit",
      currentPayload: current,
      updatedPayload: updated,
      cardName: null,
    });

    const call = mockOutboxAdd.mock.calls[0][0];
    expect(call.cardId).toBe("abcdef012345");
  });

  it("uses empty hash when logEntries is empty", async () => {
    const current = makePayload({ balance: 60000, logEntries: [] });
    const updated = makePayload({ balance: 50000, logEntries: [] });

    await recordCardWrite({
      tenantId: "t-1",
      terminalId: 1,
      operationType: "debit",
      currentPayload: current,
      updatedPayload: updated,
      cardName: null,
    });

    const call = mockOutboxAdd.mock.calls[0][0];
    expect(call.hash).toBe("00000000"); // empty Uint8Array(4) → "00000000"
  });
});
