/**
 * Tests for src/hooks/nfc/writeJournal.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockJournalGet = vi.fn();
const mockJournalPut = vi.fn();
const mockJournalDelete = vi.fn();

vi.mock("#/lib/indexeddb", () => ({
  writeJournalStore: {
    get: (...args: unknown[]) => mockJournalGet(...args),
    put: (...args: unknown[]) => mockJournalPut(...args),
    delete: (...args: unknown[]) => mockJournalDelete(...args),
  },
}));

import {
  saveWriteJournal,
  clearWriteJournal,
  getPendingJournal,
  markJournalRecovering,
  markJournalPending,
  getCardIdHex,
  MAX_JOURNAL_RECOVERY_ATTEMPTS,
} from "../writeJournal";
import type { CardPayload } from "#/core/payload/types";

function makePayload(name = "Test"): CardPayload {
  return {
    header: {
      magic: 0,
      version: 1,
      type: 0,
      cardId: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]),
      tenantBind: new Uint8Array(4),
    },
    identity: { name, userId: "u-1", gender: 0, status: 1, createdAt: 1000 },
    wallet: {
      balance: 50000,
      lastBalance: 50000,
      counter: 5n,
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

function makeJournalEntry(
  overrides: Partial<{
    createdAt: number;
    attempts: number;
    status: "pending" | "recovering";
    expectedPayload: string;
    previousPayload: string;
    updatedPayload: string;
  }> = {},
) {
  const payload = makePayload();
  const serialized = JSON.stringify(payload, (_k, v) => {
    if (v instanceof Uint8Array)
      return {
        __type: "Uint8Array",
        hex: Array.from(v)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      };
    if (typeof v === "bigint") return { __type: "bigint", value: v.toString() };
    return v;
  });
  return {
    tenantId: "t-1",
    cardIdHex: "010203040506",
    serialNumber: "01:02:03:04:05:06",
    rawBytes: new Uint8Array([0xde, 0xad]),
    expectedPayload: overrides.expectedPayload ?? serialized,
    previousPayload: overrides.previousPayload ?? serialized,
    updatedPayload: overrides.updatedPayload ?? serialized,
    operationType: "debit",
    terminalId: 1,
    createdAt: overrides.createdAt ?? Date.now(),
    attempts: overrides.attempts ?? 0,
    status: overrides.status ?? "pending",
  };
}

describe("getCardIdHex", () => {
  it("converts cardId bytes to hex string", () => {
    const payload = makePayload();
    expect(getCardIdHex(payload)).toBe("010203040506");
  });
});

describe("saveWriteJournal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJournalPut.mockResolvedValue(undefined);
  });

  it("persists a journal entry", async () => {
    const payload = makePayload();
    await saveWriteJournal({
      tenantId: "t-1",
      cardIdHex: "010203040506",
      serialNumber: "01:02:03:04:05:06",
      rawBytes: new Uint8Array([0xde, 0xad]),
      expectedPayload: payload,
      previousPayload: payload,
      updatedPayload: payload,
      operationType: "debit",
      terminalId: 1,
    });

    expect(mockJournalPut).toHaveBeenCalledOnce();
    const entry = mockJournalPut.mock.calls[0][0];
    expect(entry.tenantId).toBe("t-1");
    expect(entry.cardIdHex).toBe("010203040506");
    expect(entry.status).toBe("pending");
    expect(entry.attempts).toBe(0);
  });

  it("swallows errors silently (non-fatal)", async () => {
    mockJournalPut.mockRejectedValue(new Error("IndexedDB error"));
    const payload = makePayload();

    await expect(
      saveWriteJournal({
        tenantId: "t-1",
        cardIdHex: "010203040506",
        serialNumber: null,
        rawBytes: new Uint8Array(),
        expectedPayload: payload,
        previousPayload: payload,
        updatedPayload: payload,
        operationType: "debit",
        terminalId: 1,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("clearWriteJournal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJournalDelete.mockResolvedValue(undefined);
  });

  it("deletes the journal entry", async () => {
    await clearWriteJournal("t-1", "010203040506");
    expect(mockJournalDelete).toHaveBeenCalledWith("t-1", "010203040506");
  });

  it("swallows errors silently (non-fatal)", async () => {
    mockJournalDelete.mockRejectedValue(new Error("DB error"));
    await expect(clearWriteJournal("t-1", "010203040506")).resolves.toBeUndefined();
  });
});

describe("getPendingJournal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJournalDelete.mockResolvedValue(undefined);
  });

  it("returns null when no entry exists", async () => {
    mockJournalGet.mockResolvedValue(undefined);
    const result = await getPendingJournal("t-1", "010203040506");
    expect(result).toBeNull();
  });

  it("returns null when IndexedDB throws", async () => {
    mockJournalGet.mockRejectedValue(new Error("DB unavailable"));
    const result = await getPendingJournal("t-1", "010203040506");
    expect(result).toBeNull();
  });

  it("returns null and clears expired entries", async () => {
    const expiredEntry = makeJournalEntry({
      createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    });
    mockJournalGet.mockResolvedValue(expiredEntry);

    const result = await getPendingJournal("t-1", "010203040506");
    expect(result).toBeNull();
    expect(mockJournalDelete).toHaveBeenCalledWith("t-1", "010203040506");
  });

  it("returns null when max attempts exceeded", async () => {
    const entry = makeJournalEntry({ attempts: MAX_JOURNAL_RECOVERY_ATTEMPTS });
    mockJournalGet.mockResolvedValue(entry);

    const result = await getPendingJournal("t-1", "010203040506");
    expect(result).toBeNull();
  });

  it("returns deserialized journal entry for valid pending entry", async () => {
    const entry = makeJournalEntry({ attempts: 0 });
    mockJournalGet.mockResolvedValue(entry);

    const result = await getPendingJournal("t-1", "010203040506");
    expect(result).not.toBeNull();
    expect(result!.entry).toBe(entry);
    expect(result!.rawBytes).toBeInstanceOf(Uint8Array);
    expect(result!.expectedPayload).toBeDefined();
    expect(result!.previousPayload).toBeDefined();
    expect(result!.updatedPayload).toBeDefined();
  });

  it("returns null and clears corrupted journal entries", async () => {
    const entry = makeJournalEntry({
      expectedPayload: "not-valid-json{{{",
    });
    mockJournalGet.mockResolvedValue(entry);

    const result = await getPendingJournal("t-1", "010203040506");
    expect(result).toBeNull();
    expect(mockJournalDelete).toHaveBeenCalledWith("t-1", "010203040506");
  });
});

describe("markJournalRecovering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJournalPut.mockResolvedValue(undefined);
  });

  it("increments attempts and sets status to recovering", async () => {
    const entry = makeJournalEntry({ attempts: 1, status: "pending" });
    mockJournalGet.mockResolvedValue(entry);

    await markJournalRecovering("t-1", "010203040506");

    expect(mockJournalPut).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 2, status: "recovering" }),
    );
  });

  it("does nothing when entry not found", async () => {
    mockJournalGet.mockResolvedValue(undefined);
    await markJournalRecovering("t-1", "010203040506");
    expect(mockJournalPut).not.toHaveBeenCalled();
  });

  it("swallows errors silently", async () => {
    mockJournalGet.mockRejectedValue(new Error("DB error"));
    await expect(markJournalRecovering("t-1", "010203040506")).resolves.toBeUndefined();
  });
});

describe("markJournalPending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJournalPut.mockResolvedValue(undefined);
  });

  it("sets status back to pending", async () => {
    const entry = makeJournalEntry({ status: "recovering" });
    mockJournalGet.mockResolvedValue(entry);

    await markJournalPending("t-1", "010203040506");

    expect(mockJournalPut).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
  });

  it("does nothing when entry not found", async () => {
    mockJournalGet.mockResolvedValue(undefined);
    await markJournalPending("t-1", "010203040506");
    expect(mockJournalPut).not.toHaveBeenCalled();
  });

  it("swallows errors silently", async () => {
    mockJournalGet.mockRejectedValue(new Error("DB error"));
    await expect(markJournalPending("t-1", "010203040506")).resolves.toBeUndefined();
  });
});
