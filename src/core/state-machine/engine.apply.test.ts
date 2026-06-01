/**
 * Additional coverage for engine.ts:
 * applyCheckin, applyCheckout, applyTopup, applyResetState, validateTopup,
 * and additional VALID_TRANSITIONS paths.
 */
import { describe, it, expect } from "vitest";
import {
  CARD_SCHEMA_VERSION,
  CardState,
  CardStatus,
  MAGIC,
  TxType,
  type CardPayload,
} from "../payload/types";
import {
  applyCheckin,
  applyCheckout,
  applyTopup,
  applyResetState,
  validateTopup,
  validateTransition,
  MAX_BALANCE,
  MAX_TOPUP_AMOUNT,
  PARKING_RATE_PER_HOUR,
} from "./engine";

function makePayload(
  state: CardState = CardState.IDLE,
  balance = 100_000,
  startTime = 1700000000,
): CardPayload {
  return {
    header: {
      magic: MAGIC,
      version: CARD_SCHEMA_VERSION,
      type: 0,
      cardId: new Uint8Array(6),
      tenantBind: 0,
    },
    identity: {
      name: "Test",
      userId: "abc12345",
      gender: 0,
      status: CardStatus.ACTIVE,
      createdAt: 1700000000,
    },
    wallet: {
      balance,
      lastBalance: balance,
      counter: 3n,
      lastTimestamp: startTime,
      state,
      flags: 0,
    },
    session: { startTime, endTime: 0, terminalId: 0 },
    logEntries: [],
    trailer: {
      expiresAt: 2000000000,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 3,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  };
}

const NOW = 1700010000;

// ── applyCheckin ──────────────────────────────────────────────────────────────

describe("applyCheckin", () => {
  it("sets state to CHECKED_IN", () => {
    const updated = applyCheckin(makePayload(CardState.IDLE), 5, NOW);
    expect(updated.wallet.state).toBe(CardState.CHECKED_IN);
  });

  it("increments counter by 1", () => {
    const updated = applyCheckin(makePayload(CardState.IDLE), 5, NOW);
    expect(updated.wallet.counter).toBe(4n);
  });

  it("sets session.startTime to nowSeconds", () => {
    const updated = applyCheckin(makePayload(CardState.IDLE), 5, NOW);
    expect(updated.session.startTime).toBe(NOW);
  });

  it("sets session.terminalId", () => {
    const updated = applyCheckin(makePayload(CardState.IDLE), 42, NOW);
    expect(updated.session.terminalId).toBe(42);
  });

  it("sets lastTimestamp to nowSeconds", () => {
    const updated = applyCheckin(makePayload(CardState.IDLE), 5, NOW);
    expect(updated.wallet.lastTimestamp).toBe(NOW);
  });

  it("does not change balance", () => {
    const updated = applyCheckin(makePayload(CardState.IDLE, 75_000), 5, NOW);
    expect(updated.wallet.balance).toBe(75_000);
  });

  it("adds a CHECKIN log entry with amount=0", () => {
    const updated = applyCheckin(makePayload(CardState.IDLE), 5, NOW);
    expect(updated.logEntries).toHaveLength(1);
    expect(updated.logEntries[0].amount).toBe(0);
    expect(updated.logEntries[0].flags).toBe(TxType.CHECKIN);
    expect(updated.logEntries[0].timestamp).toBe(NOW);
  });
});

// ── applyCheckout ─────────────────────────────────────────────────────────────

describe("applyCheckout", () => {
  it("sets state to CHECKED_OUT", () => {
    const p = makePayload(CardState.CHECKED_IN, 100_000, NOW - 3600);
    p.session.startTime = NOW - 3600;
    expect(applyCheckout(p, NOW).wallet.state).toBe(CardState.CHECKED_OUT);
  });

  it("deducts fee from balance (1 hour)", () => {
    const p = makePayload(CardState.CHECKED_IN, 100_000, NOW - 3600);
    p.session.startTime = NOW - 3600;
    const updated = applyCheckout(p, NOW);
    expect(updated.wallet.balance).toBe(100_000 - PARKING_RATE_PER_HOUR);
  });

  it("sets lastBalance to previous balance", () => {
    const p = makePayload(CardState.CHECKED_IN, 100_000, NOW - 3600);
    p.session.startTime = NOW - 3600;
    expect(applyCheckout(p, NOW).wallet.lastBalance).toBe(100_000);
  });

  it("increments counter", () => {
    const p = makePayload(CardState.CHECKED_IN, 100_000, NOW - 3600);
    p.session.startTime = NOW - 3600;
    expect(applyCheckout(p, NOW).wallet.counter).toBe(4n);
  });

  it("sets session.endTime to nowSeconds", () => {
    const p = makePayload(CardState.CHECKED_IN, 100_000, NOW - 3600);
    p.session.startTime = NOW - 3600;
    expect(applyCheckout(p, NOW).session.endTime).toBe(NOW);
  });

  it("adds a CHECKOUT log entry with correct fee amount", () => {
    const p = makePayload(CardState.CHECKED_IN, 100_000, NOW - 7200);
    p.session.startTime = NOW - 7200; // 2 hours
    const updated = applyCheckout(p, NOW);
    expect(updated.logEntries).toHaveLength(1);
    expect(updated.logEntries[0].flags).toBe(TxType.CHECKOUT);
    expect(updated.logEntries[0].amount).toBe(2 * PARKING_RATE_PER_HOUR);
    expect(updated.logEntries[0].timestamp).toBe(NOW);
  });
});

// ── applyTopup ────────────────────────────────────────────────────────────────

describe("applyTopup", () => {
  it("increases balance by amount", () => {
    expect(applyTopup(makePayload(CardState.IDLE, 50_000), 25_000, NOW).wallet.balance).toBe(
      75_000,
    );
  });

  it("sets lastBalance to previous balance", () => {
    expect(applyTopup(makePayload(CardState.IDLE, 50_000), 25_000, NOW).wallet.lastBalance).toBe(
      50_000,
    );
  });

  it("increments counter", () => {
    expect(applyTopup(makePayload(CardState.IDLE, 50_000), 25_000, NOW).wallet.counter).toBe(4n);
  });

  it("sets lastTimestamp to nowSeconds", () => {
    expect(applyTopup(makePayload(CardState.IDLE, 50_000), 25_000, NOW).wallet.lastTimestamp).toBe(
      NOW,
    );
  });

  it("adds a CREDIT log entry", () => {
    const updated = applyTopup(makePayload(CardState.IDLE, 50_000), 25_000, NOW);
    expect(updated.logEntries).toHaveLength(1);
    expect(updated.logEntries[0].flags).toBe(TxType.CREDIT);
    expect(updated.logEntries[0].amount).toBe(25_000);
    expect(updated.logEntries[0].balanceAfter).toBe(75_000);
    expect(updated.logEntries[0].timestamp).toBe(NOW);
  });
});

// ── applyResetState ───────────────────────────────────────────────────────────

describe("applyResetState", () => {
  it("sets state to IDLE", () => {
    expect(applyResetState(makePayload(CardState.CHECKED_OUT), NOW).wallet.state).toBe(
      CardState.IDLE,
    );
  });

  it("sets identity.status to ACTIVE", () => {
    const p = makePayload(CardState.CHECKED_OUT);
    p.identity.status = CardStatus.BLOCKED_ADMIN;
    expect(applyResetState(p, NOW).identity.status).toBe(CardStatus.ACTIVE);
  });

  it("clears session fields to 0", () => {
    const p = makePayload(CardState.CHECKED_OUT);
    p.session.startTime = 1700000000;
    p.session.endTime = 1700003600;
    p.session.terminalId = 7;
    const updated = applyResetState(p, NOW);
    expect(updated.session.startTime).toBe(0);
    expect(updated.session.endTime).toBe(0);
    expect(updated.session.terminalId).toBe(0);
  });

  it("sets flags to 0", () => {
    const p = makePayload(CardState.CHECKED_OUT);
    p.wallet.flags = 0xff;
    expect(applyResetState(p, NOW).wallet.flags).toBe(0);
  });

  it("increments counter", () => {
    expect(applyResetState(makePayload(CardState.CHECKED_OUT), NOW).wallet.counter).toBe(4n);
  });

  it("adds an ADMIN log entry with amount=0", () => {
    const updated = applyResetState(makePayload(CardState.CHECKED_OUT), NOW);
    expect(updated.logEntries).toHaveLength(1);
    expect(updated.logEntries[0].flags).toBe(TxType.ADMIN);
    expect(updated.logEntries[0].amount).toBe(0);
    expect(updated.logEntries[0].timestamp).toBe(NOW);
  });

  it("preserves balance", () => {
    expect(applyResetState(makePayload(CardState.CHECKED_OUT, 42_000), NOW).wallet.balance).toBe(
      42_000,
    );
  });
});

// ── validateTopup ─────────────────────────────────────────────────────────────

describe("validateTopup", () => {
  it("rejects amount of 0", () => {
    const r = validateTopup(makePayload(), 0);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("lebih dari 0");
  });

  it("rejects negative amount", () => {
    expect(validateTopup(makePayload(), -1).valid).toBe(false);
  });

  it("rejects amount > MAX_TOPUP_AMOUNT", () => {
    const r = validateTopup(makePayload(CardState.IDLE, 0), MAX_TOPUP_AMOUNT + 1);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("maksimal");
  });

  it("allows amount exactly equal to MAX_TOPUP_AMOUNT", () => {
    expect(validateTopup(makePayload(CardState.IDLE, 0), MAX_TOPUP_AMOUNT).valid).toBe(true);
  });

  it("rejects when balance + amount > MAX_BALANCE", () => {
    const r = validateTopup(makePayload(CardState.IDLE, MAX_BALANCE - 1000), 2000);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("melebihi batas");
  });

  it("allows when balance + amount === MAX_BALANCE", () => {
    expect(validateTopup(makePayload(CardState.IDLE, MAX_BALANCE - 50_000), 50_000).valid).toBe(
      true,
    );
  });

  it("returns valid for a normal topup", () => {
    const r = validateTopup(makePayload(CardState.IDLE, 50_000), 100_000);
    expect(r.valid).toBe(true);
    expect(r.reason).toBeUndefined();
  });
});

// ── VALID_TRANSITIONS additional paths ───────────────────────────────────────

describe("validateTransition - additional VALID_TRANSITIONS paths", () => {
  it("CHECKED_OUT → admin_reset → IDLE", () => {
    const r = validateTransition(makePayload(CardState.CHECKED_OUT, 50_000), "admin_reset", NOW);
    expect(r.valid).toBe(true);
    expect(r.nextState).toBe(CardState.IDLE);
  });

  it("CHECKED_OUT → gate_checkin → IDLE (when balance sufficient)", () => {
    const r = validateTransition(makePayload(CardState.CHECKED_OUT, 50_000), "gate_checkin", NOW);
    expect(r.valid).toBe(true);
    expect(r.nextState).toBe(CardState.IDLE);
  });

  it("STATION_OPERATION → force_checkout → CHECKED_OUT", () => {
    const r = validateTransition(makePayload(CardState.STATION_OPERATION), "force_checkout", NOW);
    expect(r.valid).toBe(true);
    expect(r.nextState).toBe(CardState.CHECKED_OUT);
  });

  it("IDLE → force_checkout → CHECKED_OUT", () => {
    const r = validateTransition(makePayload(CardState.IDLE), "force_checkout", NOW);
    expect(r.valid).toBe(true);
    expect(r.nextState).toBe(CardState.CHECKED_OUT);
  });
});
