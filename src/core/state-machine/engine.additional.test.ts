/**
 * Additional tests for state-machine engine to cover remaining uncovered lines:
 * - Line 62: gate_checkin with insufficient balance
 * - Line 66: invalid transition (nextState === undefined)
 * - Lines 137-144: calculateCheckoutFee and validateCheckoutBalance
 * - Lines 296-298: applyBlockStatus
 */

import { describe, expect, it } from "vitest";
import {
  CARD_SCHEMA_VERSION,
  CardState,
  CardStatus,
  MAGIC,
  type CardPayload,
} from "../payload/types";
import {
  validateTransition,
  calculateCheckoutFee,
  validateCheckoutBalance,
  applyBlockStatus,
  MIN_BALANCE_BEFORE_CHECKIN,
  PARKING_RATE_PER_HOUR,
  MIN_BALANCE_AFTER_CHECKOUT,
} from "./engine";

function makePayload(
  state: CardState,
  status: CardStatus = CardStatus.ACTIVE,
  balance = 500000,
  lastTimestamp = 1700000000,
): CardPayload {
  return {
    header: {
      magic: MAGIC,
      version: CARD_SCHEMA_VERSION,
      type: 0,
      cardId: new Uint8Array(6),
      tenantBind: 0,
    },
    identity: { name: "Test", userId: "abc12345", gender: 0, status, createdAt: 1700000000 },
    wallet: { balance, lastBalance: balance, counter: 5n, lastTimestamp, state, flags: 0 },
    session: { startTime: lastTimestamp - 3600, endTime: 0, terminalId: 42 },
    logEntries: [],
    trailer: {
      expiresAt: 2000000000,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 5,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  };
}

const NOW = 1700010000;

describe("validateTransition - additional coverage", () => {
  it("rejects gate_checkin when balance is below minimum", () => {
    // Balance below MIN_BALANCE_BEFORE_CHECKIN (10,000)
    const payload = makePayload(CardState.IDLE, CardStatus.ACTIVE, 5000);
    const r = validateTransition(payload, "gate_checkin", NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("Insufficient balance");
    expect(r.reason).toContain(String(MIN_BALANCE_BEFORE_CHECKIN));
  });

  it("rejects gate_checkin when balance is exactly 0", () => {
    const payload = makePayload(CardState.IDLE, CardStatus.ACTIVE, 0);
    const r = validateTransition(payload, "gate_checkin", NOW);
    expect(r.valid).toBe(false);
  });

  it("allows gate_checkin when balance equals minimum exactly", () => {
    const payload = makePayload(CardState.IDLE, CardStatus.ACTIVE, MIN_BALANCE_BEFORE_CHECKIN);
    const r = validateTransition(payload, "gate_checkin", NOW);
    expect(r.valid).toBe(true);
  });

  it("rejects invalid transition (nextState undefined) - CHECKED_OUT via terminal_start", () => {
    const r = validateTransition(makePayload(CardState.CHECKED_OUT), "terminal_start", NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("Invalid transition");
  });

  it("rejects invalid transition - IDLE via gate_checkout", () => {
    const r = validateTransition(makePayload(CardState.IDLE), "gate_checkout", NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("Invalid transition");
  });

  it("rejects expired session for non-checkout trigger", () => {
    const staleTime = NOW - 30 * 60 * 60; // 30 hours ago
    const r = validateTransition(
      makePayload(CardState.CHECKED_IN, CardStatus.ACTIVE, 500000, staleTime),
      "terminal_start",
      NOW,
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("Session expired");
  });

  it("allows gate_checkout on expired session (force checkout path)", () => {
    const staleTime = NOW - 30 * 60 * 60;
    const r = validateTransition(
      makePayload(CardState.CHECKED_IN, CardStatus.ACTIVE, 500000, staleTime),
      "gate_checkout",
      NOW,
    );
    expect(r.valid).toBe(true);
    expect(r.nextState).toBe(CardState.CHECKED_OUT);
  });

  it("allows admin_reset even on expired session", () => {
    const staleTime = NOW - 30 * 60 * 60;
    const r = validateTransition(
      makePayload(CardState.CHECKED_OUT, CardStatus.ACTIVE, 500000, staleTime),
      "admin_reset",
      NOW,
    );
    expect(r.valid).toBe(true);
  });
});

describe("calculateCheckoutFee", () => {
  it("calculates fee for 1 hour session", () => {
    const payload = makePayload(CardState.CHECKED_IN);
    // session.startTime = lastTimestamp - 3600 = 1700000000 - 3600 = 1699996400
    // NOW = 1700010000, duration = 1700010000 - 1699996400 = 13600s = 3.78h → ceil = 4h
    const fee = calculateCheckoutFee(payload, NOW);
    expect(fee).toBe(4 * PARKING_RATE_PER_HOUR);
  });

  it("calculates fee for exactly 1 hour", () => {
    const startTime = NOW - 3600;
    const payload = makePayload(CardState.CHECKED_IN);
    payload.session.startTime = startTime;
    const fee = calculateCheckoutFee(payload, NOW);
    expect(fee).toBe(1 * PARKING_RATE_PER_HOUR);
  });

  it("rounds up partial hours", () => {
    const startTime = NOW - 3601; // 1 second over 1 hour
    const payload = makePayload(CardState.CHECKED_IN);
    payload.session.startTime = startTime;
    const fee = calculateCheckoutFee(payload, NOW);
    expect(fee).toBe(2 * PARKING_RATE_PER_HOUR);
  });

  it("calculates fee for 0 duration (same second)", () => {
    const payload = makePayload(CardState.CHECKED_IN);
    payload.session.startTime = NOW;
    const fee = calculateCheckoutFee(payload, NOW);
    expect(fee).toBe(0); // 0 seconds → 0 hours → 0 fee
  });
});

describe("validateCheckoutBalance", () => {
  it("returns sufficient=true when balance covers fee", () => {
    const payload = makePayload(CardState.CHECKED_IN, CardStatus.ACTIVE, 500000);
    payload.session.startTime = NOW - 3600; // 1 hour
    const result = validateCheckoutBalance(payload, NOW);
    expect(result.sufficient).toBe(true);
    expect(result.fee).toBe(PARKING_RATE_PER_HOUR);
    expect(result.deficit).toBe(0);
  });

  it("returns sufficient=false when balance is less than fee", () => {
    const payload = makePayload(CardState.CHECKED_IN, CardStatus.ACTIVE, 1000);
    payload.session.startTime = NOW - 3600 * 10; // 10 hours
    const result = validateCheckoutBalance(payload, NOW);
    expect(result.sufficient).toBe(false);
    expect(result.fee).toBe(10 * PARKING_RATE_PER_HOUR);
    expect(result.deficit).toBeGreaterThan(0);
  });

  it("calculates correct deficit", () => {
    const fee = 5 * PARKING_RATE_PER_HOUR; // 10,000
    const balance = 5000; // less than fee
    const payload = makePayload(CardState.CHECKED_IN, CardStatus.ACTIVE, balance);
    payload.session.startTime = NOW - 3600 * 5; // 5 hours
    const result = validateCheckoutBalance(payload, NOW);
    expect(result.sufficient).toBe(false);
    // deficit = MIN_BALANCE_AFTER_CHECKOUT - (balance - fee) = 0 - (5000 - 10000) = 5000
    expect(result.deficit).toBe(MIN_BALANCE_AFTER_CHECKOUT - (balance - fee));
  });

  it("returns sufficient=true when balance exactly covers fee", () => {
    const fee = PARKING_RATE_PER_HOUR; // 1 hour
    const payload = makePayload(CardState.CHECKED_IN, CardStatus.ACTIVE, fee);
    payload.session.startTime = NOW - 3600;
    const result = validateCheckoutBalance(payload, NOW);
    expect(result.sufficient).toBe(true);
    expect(result.deficit).toBe(0);
  });
});

describe("applyBlockStatus", () => {
  it("sets the blocked status on the card identity", () => {
    const payload = makePayload(CardState.IDLE, CardStatus.ACTIVE);
    const updated = applyBlockStatus(payload, CardStatus.BLOCKED_TAMPER, NOW);
    expect(updated.identity.status).toBe(CardStatus.BLOCKED_TAMPER);
  });

  it("increments the counter", () => {
    const payload = makePayload(CardState.IDLE);
    const updated = applyBlockStatus(payload, CardStatus.BLOCKED_FRAUD, NOW);
    expect(updated.wallet.counter).toBe(payload.wallet.counter + 1n);
  });

  it("updates lastTimestamp", () => {
    const payload = makePayload(CardState.IDLE);
    const updated = applyBlockStatus(payload, CardStatus.BLOCKED_ADMIN, NOW);
    expect(updated.wallet.lastTimestamp).toBe(NOW);
  });

  it("adds an ADMIN log entry", () => {
    const payload = makePayload(CardState.IDLE);
    const updated = applyBlockStatus(payload, CardStatus.BLOCKED_EXPIRED, NOW);
    expect(updated.logEntries).toHaveLength(1);
    expect(updated.logEntries[0].amount).toBe(0);
  });

  it("preserves wallet state (does not change state)", () => {
    const payload = makePayload(CardState.CHECKED_IN);
    const updated = applyBlockStatus(payload, CardStatus.BLOCKED_TAMPER, NOW);
    expect(updated.wallet.state).toBe(CardState.CHECKED_IN);
  });

  it("preserves balance", () => {
    const payload = makePayload(CardState.IDLE, CardStatus.ACTIVE, 75000);
    const updated = applyBlockStatus(payload, CardStatus.BLOCKED_ADMIN, NOW);
    expect(updated.wallet.balance).toBe(75000);
  });
});
