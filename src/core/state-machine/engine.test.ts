import { describe, it, expect } from "vitest";
import { validateTransition, isWriteEligible, isSessionExpired, applyDebit } from "./engine";
import { CardState, CardStatus, type CardPayload, type SessionGrant } from "../payload/types";
import { MAGIC, CARD_SCHEMA_VERSION } from "../payload/types";

function makePayload(
  state: CardState,
  status: CardStatus = CardStatus.ACTIVE,
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
    identity: { name: "Test", userId: 1, gender: 0, status, createdAt: 1700000000 },
    wallet: { balance: 500000, lastBalance: 500000, counter: 5n, lastTimestamp, state, flags: 0 },
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

function makeGrant(expiresAt = 2000000000): SessionGrant {
  return {
    keyVersion: 1,
    sessionKey: new Uint8Array(32),
    expiresAt,
    allowedOps: ["read", "debit", "checkin", "checkout"],
    signature: new Uint8Array(64),
    tenantId: "t1",
    accountId: "a1",
    deviceId: "d1",
  };
}

const NOW = 1700010000;

describe("validateTransition", () => {
  it("IDLE -> CHECKED_IN via gate_checkin", () => {
    const r = validateTransition(makePayload(CardState.IDLE), "gate_checkin", NOW);
    expect(r.valid).toBe(true);
    expect(r.nextState).toBe(CardState.CHECKED_IN);
  });

  it("CHECKED_IN -> TERMINAL_OPERATION via terminal_start", () => {
    const r = validateTransition(makePayload(CardState.CHECKED_IN), "terminal_start", NOW);
    expect(r.valid).toBe(true);
    expect(r.nextState).toBe(CardState.STATION_OPERATION);
  });

  it("TERMINAL_OPERATION -> CHECKED_IN via terminal_end", () => {
    const r = validateTransition(makePayload(CardState.STATION_OPERATION), "terminal_end", NOW);
    expect(r.valid).toBe(true);
    expect(r.nextState).toBe(CardState.CHECKED_IN);
  });

  it("CHECKED_IN -> CHECKED_OUT via gate_checkout", () => {
    const r = validateTransition(makePayload(CardState.CHECKED_IN), "gate_checkout", NOW);
    expect(r.valid).toBe(true);
    expect(r.nextState).toBe(CardState.CHECKED_OUT);
  });

  it("rejects invalid transition IDLE -> terminal_start", () => {
    const r = validateTransition(makePayload(CardState.IDLE), "terminal_start", NOW);
    expect(r.valid).toBe(false);
  });

  it("rejects write on blocked card", () => {
    const r = validateTransition(
      makePayload(CardState.IDLE, CardStatus.BLOCKED_TAMPER),
      "gate_checkin",
      NOW,
    );
    expect(r.valid).toBe(false);
  });

  it("allows force_checkout on expired session", () => {
    const staleTime = NOW - 30 * 60 * 60;
    const r = validateTransition(
      makePayload(CardState.CHECKED_IN, CardStatus.ACTIVE, staleTime),
      "force_checkout",
      NOW,
    );
    expect(r.valid).toBe(true);
    expect(r.nextState).toBe(CardState.CHECKED_OUT);
  });
});

describe("isWriteEligible", () => {
  it("grants eligibility with valid grant and active card", () => {
    const r = isWriteEligible(makePayload(CardState.CHECKED_IN), makeGrant(), "debit", NOW);
    expect(r.eligible).toBe(true);
  });

  it("rejects expired grant", () => {
    const r = isWriteEligible(
      makePayload(CardState.CHECKED_IN),
      makeGrant(NOW - 100),
      "debit",
      NOW,
    );
    expect(r.eligible).toBe(false);
  });

  it("rejects operation not in grant", () => {
    const grant = { ...makeGrant(), allowedOps: ["read"] };
    const r = isWriteEligible(makePayload(CardState.CHECKED_IN), grant, "debit", NOW);
    expect(r.eligible).toBe(false);
  });

  it("rejects blocked card", () => {
    const r = isWriteEligible(
      makePayload(CardState.CHECKED_IN, CardStatus.BLOCKED_FRAUD),
      makeGrant(),
      "debit",
      NOW,
    );
    expect(r.eligible).toBe(false);
  });
});

describe("isSessionExpired", () => {
  it("not expired within 24h + 1h drift", () => {
    expect(
      isSessionExpired(makePayload(CardState.CHECKED_IN, CardStatus.ACTIVE, NOW - 20 * 3600), NOW),
    ).toBe(false);
  });

  it("expired after 25h", () => {
    expect(
      isSessionExpired(makePayload(CardState.CHECKED_IN, CardStatus.ACTIVE, NOW - 26 * 3600), NOW),
    ).toBe(true);
  });

  it("IDLE is never expired", () => {
    expect(isSessionExpired(makePayload(CardState.IDLE, CardStatus.ACTIVE, 0), NOW)).toBe(false);
  });
});

describe("applyDebit", () => {
  it("reduces balance", () => {
    const payload = makePayload(CardState.STATION_OPERATION);
    const updated = applyDebit(payload, 15000, NOW);
    expect(updated.wallet.balance).toBe(500000 - 15000);
    expect(updated.wallet.lastBalance).toBe(500000);
  });

  it("increments counter", () => {
    const payload = makePayload(CardState.STATION_OPERATION);
    const updated = applyDebit(payload, 15000, NOW);
    expect(updated.wallet.counter).toBe(6n);
  });

  it("adds log entry", () => {
    const payload = makePayload(CardState.STATION_OPERATION);
    const updated = applyDebit(payload, 15000, NOW);
    expect(updated.logEntries).toHaveLength(1);
    expect(updated.logEntries[0].amount).toBe(15000);
    expect(updated.logEntries[0].balanceAfter).toBe(485000);
  });

  it("rings buffer at 5 entries", () => {
    let payload = makePayload(CardState.STATION_OPERATION);
    for (let i = 0; i < 6; i++) {
      payload = applyDebit(payload, 1000, NOW + i);
    }
    expect(payload.logEntries).toHaveLength(5);
  });
});
