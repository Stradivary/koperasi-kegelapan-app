import { vi, describe, it, expect, beforeEach } from "vitest";
import { nfcSlot } from "../../test/nfc-slot";
import { readAndValidateCard, prepareWrite, commitWrite } from "./pipelineEngine";
import {
  applyCheckin,
  applyCheckout,
  applyDebit,
  PARKING_RATE_PER_HOUR,
} from "../state-machine/engine";
import { validateTransition } from "../state-machine/engine";
import { CardState, CardStatus, TxType, MAGIC, CARD_SCHEMA_VERSION } from "../payload/types";
import type { CardPayload, SessionGrant } from "../payload/types";

// ─── Mock NFC engine ─────────────────────────────────────────────────────────

vi.mock("./engine", async () => {
  const { nfcSlot } = await import("../../test/nfc-slot");
  return {
    readCard: async (_signal: AbortSignal) => {
      const card = nfcSlot.peek();
      if (!card) return { ok: false, error: "No card in slot" };
      return { ok: true, raw: card, serialNumber: nfcSlot.getSerial() };
    },
    writeCard: async (raw: Uint8Array, _signal: AbortSignal) => {
      nfcSlot.commit(raw);
      return { ok: true };
    },
    isNfcSupported: () => true,
    checkNfcAvailability: async () => "available",
  };
});

// ─── Test helpers ─────────────────────────────────────────────────────────────

const CARD_ID = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
const SESSION_KEY = new Uint8Array(32).fill(0x42);

function makeGrant(overrides: Partial<SessionGrant> = {}): SessionGrant {
  return {
    keyVersion: 1,
    sessionKey: SESSION_KEY,
    expiresAt: 9_999_999_999,
    allowedOps: ["read", "debit", "checkin", "checkout", "admin_reset"],
    signature: new Uint8Array(64),
    tenantId: "test-tenant",
    accountId: "test-account",
    deviceId: "test-device",
    ...overrides,
  };
}

/** Issue a fresh card into the slot. Returns the initial payload. */
async function issueCard(opts: {
  balance: number;
  name?: string;
  userId?: string;
}): Promise<CardPayload> {
  const now = Math.floor(Date.now() / 1000);
  const grant = makeGrant();
  const payload: CardPayload = {
    header: {
      magic: MAGIC,
      version: CARD_SCHEMA_VERSION,
      type: 0,
      cardId: new Uint8Array(CARD_ID),
      tenantBind: 0,
    },
    identity: {
      name: opts.name ?? "Budi Santoso",
      userId: opts.userId ?? "GJWt7u3g",
      gender: 0,
      status: CardStatus.ACTIVE,
      createdAt: now,
    },
    wallet: {
      balance: opts.balance,
      lastBalance: 0,
      counter: 1n,
      lastTimestamp: now,
      state: CardState.IDLE,
      flags: 0,
    },
    session: { startTime: 0, endTime: 0, terminalId: 0 },
    logEntries: [],
    trailer: {
      expiresAt: 9_999_999_999,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 1,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  };
  const { bytes } = await prepareWrite(payload, payload, grant);
  nfcSlot.insert(bytes);
  return payload;
}

/** Issue a legacy v1 (plaintext) card, mimicking the dev issuance tool. */
async function issueLegacyCard(balance: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const grant = makeGrant();
  const payload: CardPayload = {
    header: { magic: MAGIC, version: 1, type: 0, cardId: new Uint8Array(CARD_ID), tenantBind: 0 },
    identity: {
      name: "Legacy User",
      userId: "Lgy20001",
      gender: 0,
      status: CardStatus.ACTIVE,
      createdAt: now,
    },
    wallet: {
      balance,
      lastBalance: 0,
      counter: 1n,
      lastTimestamp: now,
      state: CardState.IDLE,
      flags: 0,
    },
    session: { startTime: 0, endTime: 0, terminalId: 0 },
    logEntries: [],
    trailer: {
      expiresAt: 9_999_999_999,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 1,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  };
  const { bytes } = await prepareWrite(payload, payload, grant);
  nfcSlot.insert(bytes);
}

async function tapRead(grant = makeGrant()): Promise<CardPayload> {
  const signal = new AbortController().signal;
  const result = await readAndValidateCard(signal, grant);
  if (!result.ok) throw new Error(`tapRead failed: ${result.error}`);
  return result.payload;
}

async function tapWrite(
  current: CardPayload,
  updated: CardPayload,
  grant = makeGrant(),
): Promise<CardPayload> {
  const signal = new AbortController().signal;
  const { bytes, payload } = await prepareWrite(current, updated, grant);
  const writeResult = await commitWrite(bytes, payload, signal);
  if (!writeResult.ok) throw new Error(`tapWrite failed: ${writeResult.error}`);
  return writeResult.payload;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("NFC Slot simulator", () => {
  beforeEach(() => nfcSlot.eject());

  it("insert then peek returns a copy of inserted bytes", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    nfcSlot.insert(bytes);
    const peeked = nfcSlot.peek();
    expect(peeked).toEqual(bytes);
    expect(peeked).not.toBe(bytes); // copy, not same reference
  });

  it("commit updates the slot bytes", () => {
    nfcSlot.insert(new Uint8Array([1, 2, 3]));
    nfcSlot.commit(new Uint8Array([9, 8, 7]));
    expect(nfcSlot.peek()).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("eject clears the slot", () => {
    nfcSlot.insert(new Uint8Array([1]));
    nfcSlot.eject();
    expect(nfcSlot.peek()).toBeNull();
  });

  it("readCard returns error when slot is empty", async () => {
    const signal = new AbortController().signal;
    const result = await readAndValidateCard(signal, makeGrant());
    expect(result.ok).toBe(false);
  });
});

describe("Gate — check-in", () => {
  const TERMINAL_ID = 42;
  const NOW = 1_700_000_000;

  beforeEach(() => nfcSlot.eject());

  it("transitions IDLE → CHECKED_IN and stores startTime", async () => {
    await issueCard({ balance: 50_000 });
    const card = await tapRead();
    expect(card.wallet.state).toBe(CardState.IDLE);

    const checkedIn = applyCheckin(card, TERMINAL_ID, NOW);
    const result = await tapWrite(card, checkedIn);
    expect(result.wallet.state).toBe(CardState.CHECKED_IN);
    expect(result.session.startTime).toBe(NOW);
    expect(result.session.terminalId).toBe(TERMINAL_ID);
  });

  it("increments counter on check-in", async () => {
    await issueCard({ balance: 50_000 });
    const card = await tapRead();
    const checkedIn = applyCheckin(card, TERMINAL_ID, NOW);
    const result = await tapWrite(card, checkedIn);
    expect(result.wallet.counter).toBe(card.wallet.counter + 1n);
  });

  it("adds a CHECKIN log entry with amount 0", async () => {
    await issueCard({ balance: 50_000 });
    const card = await tapRead();
    const checkedIn = applyCheckin(card, TERMINAL_ID, NOW);
    const result = await tapWrite(card, checkedIn);
    expect(result.logEntries).toHaveLength(1);
    expect(result.logEntries[0].amount).toBe(0);
    expect(result.logEntries[0].flags).toBe(TxType.CHECKIN);
    expect(result.logEntries[0].balanceAfter).toBe(50_000);
  });

  it("can re-read card after check-in with correct state", async () => {
    await issueCard({ balance: 50_000 });
    const card = await tapRead();
    const checkedIn = applyCheckin(card, TERMINAL_ID, NOW);
    await tapWrite(card, checkedIn);

    const rereads = await tapRead();
    expect(rereads.wallet.state).toBe(CardState.CHECKED_IN);
  });
});

describe("Gate — Sequential Loop (no double tap)", () => {
  const TERMINAL_ID = 1;
  const NOW = 1_700_000_000;

  beforeEach(() => nfcSlot.eject());

  it("rejects double tap-in", async () => {
    await issueCard({ balance: 50_000 });
    const card = await tapRead();
    const checkedIn = applyCheckin(card, TERMINAL_ID, NOW);
    await tapWrite(card, checkedIn);

    const card2 = await tapRead();
    const result = validateTransition(card2, "gate_checkin", NOW + 1);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/CHECKED_IN/);
  });

  it("rejects double tap-out", async () => {
    await issueCard({ balance: 50_000 });
    const card0 = await tapRead();
    const checkedIn = applyCheckin(card0, TERMINAL_ID, NOW);
    await tapWrite(card0, checkedIn);

    const card1 = await tapRead();
    const checkedOut = applyCheckout(card1, NOW + 3600);
    await tapWrite(card1, checkedOut);

    const card2 = await tapRead();
    const result = validateTransition(card2, "gate_checkout", NOW + 3601);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/CHECKED_OUT/);
  });

  it("force_checkout works from IDLE", async () => {
    await issueCard({ balance: 50_000 });
    const card = await tapRead();
    expect(card.wallet.state).toBe(CardState.IDLE);
    const result = validateTransition(card, "force_checkout", NOW);
    expect(result.valid).toBe(true);
    expect(result.nextState).toBe(CardState.CHECKED_OUT);
  });
});

describe("Terminal — debit", () => {
  const TERMINAL_ID = 1;
  const NOW = 1_700_000_000;

  beforeEach(() => nfcSlot.eject());

  async function checkinCard(balance: number) {
    await issueCard({ balance });
    const card0 = await tapRead();
    const checkedIn = applyCheckin(card0, TERMINAL_ID, NOW);
    return tapWrite(card0, checkedIn);
  }

  it("debit reduces balance and increments counter", async () => {
    const card = await checkinCard(50_000);
    const debited = applyDebit(card, 15_000, NOW + 100);
    const result = await tapWrite(card, debited);
    expect(result.wallet.balance).toBe(35_000);
    expect(result.wallet.counter).toBe(card.wallet.counter + 1n);
  });

  it("debit adds a DEBIT log entry", async () => {
    const card = await checkinCard(50_000);
    const debited = applyDebit(card, 15_000, NOW + 100);
    const result = await tapWrite(card, debited);
    const lastEntry = result.logEntries[result.logEntries.length - 1];
    expect(lastEntry.amount).toBe(15_000);
    expect(lastEntry.balanceAfter).toBe(35_000);
    expect(lastEntry.flags).toBe(TxType.DEBIT);
  });

  it("rejects debit when card is IDLE (isWriteEligible / validateTransition)", async () => {
    await issueCard({ balance: 50_000 });
    const card = await tapRead();
    expect(card.wallet.state).toBe(CardState.IDLE);
    // terminal_start requires CHECKED_IN
    const result = validateTransition(card, "terminal_start", NOW);
    expect(result.valid).toBe(false);
  });
});

describe("Parking fee — checkout", () => {
  const TERMINAL_ID = 1;
  const T0 = 1_700_000_000;

  beforeEach(() => nfcSlot.eject());

  async function checkinAt(t: number, balance: number): Promise<CardPayload> {
    await issueCard({ balance });
    const card0 = await tapRead();
    const checkedIn = applyCheckin(card0, TERMINAL_ID, t);
    return tapWrite(card0, checkedIn);
  }

  it("exactly 1 hour → Rp 2,000 fee", async () => {
    const checkedIn = await checkinAt(T0, 50_000);
    const checkedOut = applyCheckout(checkedIn, T0 + 3_600);
    const result = await tapWrite(checkedIn, checkedOut);
    expect(result.wallet.balance).toBe(50_000 - PARKING_RATE_PER_HOUR);
  });

  it("1h 5m 1s → 2 hours ceiling → Rp 4,000 fee", async () => {
    const checkedIn = await checkinAt(T0, 50_000);
    const checkedOut = applyCheckout(checkedIn, T0 + 3_600 + 5 * 60 + 1);
    const result = await tapWrite(checkedIn, checkedOut);
    expect(result.wallet.balance).toBe(50_000 - 2 * PARKING_RATE_PER_HOUR);
  });

  it("fee larger than balance → balance floors at 0", async () => {
    const checkedIn = await checkinAt(T0, 1_000); // only Rp 1,000 — less than 1-hour fee
    const checkedOut = applyCheckout(checkedIn, T0 + 3_600);
    const result = await tapWrite(checkedIn, checkedOut);
    expect(result.wallet.balance).toBe(0);
  });

  it("checkout sets state CHECKED_OUT and adds CHECKOUT log entry", async () => {
    const checkedIn = await checkinAt(T0, 50_000);
    const checkedOut = applyCheckout(checkedIn, T0 + 3_600);
    const result = await tapWrite(checkedIn, checkedOut);
    expect(result.wallet.state).toBe(CardState.CHECKED_OUT);
    const last = result.logEntries[result.logEntries.length - 1];
    expect(last.flags).toBe(TxType.CHECKOUT);
    expect(last.amount).toBe(PARKING_RATE_PER_HOUR);
  });

  it("simulation mode: checkin 2h ago → Rp 4,000 fee", async () => {
    const pastTime = T0 - 2 * 3_600; // 2 hours ago
    const checkedIn = await checkinAt(pastTime, 50_000);
    // checkout happens "now" (T0)
    const checkedOut = applyCheckout(checkedIn, T0);
    const result = await tapWrite(checkedIn, checkedOut);
    expect(result.wallet.balance).toBe(50_000 - 2 * PARKING_RATE_PER_HOUR);
  });
});

describe("Transaction log — ring buffer", () => {
  const TERMINAL_ID = 1;
  const NOW = 1_700_000_000;

  beforeEach(() => nfcSlot.eject());

  it("5 operations fill log to capacity", async () => {
    await issueCard({ balance: 100_000 });
    let card = await tapRead();
    card = await tapWrite(card, applyCheckin(card, TERMINAL_ID, NOW));
    for (let i = 0; i < 3; i++) {
      card = await tapRead();
      card = await tapWrite(card, applyDebit(card, 1_000, NOW + i + 1));
    }
    card = await tapRead();
    card = await tapWrite(card, applyCheckout(card, NOW + 3_600));

    const final = await tapRead();
    expect(final.logEntries).toHaveLength(5); // CHECKIN + 3×DEBIT + CHECKOUT = 5, fills exactly
  });

  it("6th entry evicts the oldest (ring buffer)", async () => {
    await issueCard({ balance: 200_000 });
    let card = await tapRead();
    // 1 checkin + 5 debits = 6 ops → ring buffer evicts checkin
    card = await tapWrite(card, applyCheckin(card, TERMINAL_ID, NOW));
    for (let i = 0; i < 5; i++) {
      card = await tapRead();
      card = await tapWrite(card, applyDebit(card, 1_000, NOW + i + 1));
    }

    const final = await tapRead();
    expect(final.logEntries).toHaveLength(5);
    // oldest (CHECKIN with amount=0) was evicted; all remaining should be debits
    expect(final.logEntries.every((e) => e.flags === TxType.DEBIT)).toBe(true);
  });
});

describe("Silent Shield — AES-256-GCM encryption", () => {
  beforeEach(() => nfcSlot.eject());

  it("slot bytes at 16..183 are not the plaintext name after write", async () => {
    const name = "Budi Santoso";
    await issueCard({ balance: 50_000, name });

    const bytes = nfcSlot.peek()!;
    const nameUtf8 = new TextEncoder().encode(name);

    // The name occupies identity.name at buffer offset IDENTITY_OFFSET (16), 32 bytes.
    // If encrypted, those bytes won't start with the UTF-8 name.
    const regionAtNameOffset = bytes.slice(16, 16 + nameUtf8.length);
    let matches = true;
    for (let i = 0; i < nameUtf8.length; i++) {
      if (regionAtNameOffset[i] !== nameUtf8[i]) {
        matches = false;
        break;
      }
    }
    expect(matches).toBe(false); // ciphertext ≠ plaintext name
  });

  it("encrypted card round-trips: write → re-read → correct payload", async () => {
    await issueCard({ balance: 75_000, name: "Siti Rahayu" });
    const card = await tapRead();
    expect(card.identity.name).toBe("Siti Rahayu");
    expect(card.wallet.balance).toBe(75_000);
    expect(card.wallet.state).toBe(CardState.IDLE);
  });

  it("legacy v1 card reads correctly without decryption", async () => {
    await issueLegacyCard(30_000);
    const card = await tapRead();
    expect(card.identity.name).toBe("Legacy User");
    expect(card.wallet.balance).toBe(30_000);
    expect(card.wallet.state).toBe(CardState.IDLE);
  });

  it("legacy v1 card can be checked in (HMAC covers plaintext correctly)", async () => {
    await issueLegacyCard(30_000);
    const card = await tapRead();
    const checkedIn = applyCheckin(card, 1, 1_700_000_000);
    const result = await tapWrite(card, checkedIn);
    expect(result.wallet.state).toBe(CardState.CHECKED_IN);
    expect(result.identity.name).toBe("Legacy User");
  });
});

describe("Scout flow — read-only", () => {
  beforeEach(() => nfcSlot.eject());

  it("tapRead returns correct balance without modifying the slot", async () => {
    await issueCard({ balance: 88_000 });
    const before = nfcSlot.peek()!;

    const card = await tapRead();
    expect(card.wallet.balance).toBe(88_000);

    const after = nfcSlot.peek()!;
    expect(after).toEqual(before); // slot unchanged — no write
  });
});

describe("Full parking session", () => {
  const TERMINAL_ID = 5;
  const T0 = 1_700_000_000;

  beforeEach(() => nfcSlot.eject());

  it("issue → checkin → 2 debits → checkout → correct final balance and state", async () => {
    const INITIAL = 50_000;
    await issueCard({ balance: INITIAL });

    // Check-in
    let card = await tapRead();
    card = await tapWrite(card, applyCheckin(card, TERMINAL_ID, T0));

    // Two debits at the terminal
    card = await tapRead();
    card = await tapWrite(card, applyDebit(card, 10_000, T0 + 600));

    card = await tapRead();
    card = await tapWrite(card, applyDebit(card, 5_000, T0 + 1_200));

    // Check-out after 1h 1m 40s → 2 hours ceiling → Rp 4,000 fee
    card = await tapRead();
    card = await tapWrite(card, applyCheckout(card, T0 + 3_700));

    // Final state
    const final = await tapRead();
    const expectedBalance = INITIAL - 10_000 - 5_000 - 2 * PARKING_RATE_PER_HOUR;
    expect(final.wallet.balance).toBe(expectedBalance); // 50000 - 10000 - 5000 - 4000 = 31000
    expect(final.wallet.state).toBe(CardState.CHECKED_OUT);
    expect(final.session.endTime).toBe(T0 + 3_700);

    // Log: CHECKIN + DEBIT + DEBIT + CHECKOUT = 4 entries
    expect(final.logEntries).toHaveLength(4);
    expect(final.logEntries[0].flags).toBe(TxType.CHECKIN);
    expect(final.logEntries[1].flags).toBe(TxType.DEBIT);
    expect(final.logEntries[2].flags).toBe(TxType.DEBIT);
    expect(final.logEntries[3].flags).toBe(TxType.CHECKOUT);
  });
});
