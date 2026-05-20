/**
 * Preservation Property-Based Tests — Non-Overtime Checkout Behavior Unchanged
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * Property 2: Preservation - For all inputs where session duration ≤ 86400 seconds,
 * the checkout flow produces the correct standard parking fee via `applyCheckout`.
 *
 * These tests MUST PASS on UNFIXED code to confirm the baseline behavior we want
 * to preserve after the fix is applied.
 *
 * Observation-first methodology:
 * - `applyCheckout(payload, nowSeconds)` for 12-hour session produces correct fee ceil(12) * PARKING_RATE_PER_HOUR capped at balance
 * - `applyCheckout(payload, nowSeconds)` for 1-hour session produces correct fee
 * - Blocked cards are rejected via `validateTransition` (status not active)
 * - Invalid state transitions produce rejection via `validateTransition`
 * - Cards in IDLE/CHECKED_OUT state cannot transition via gate_checkout
 *
 * @module core/nfc/__tests__/overtimePreservation.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  applyCheckout,
  validateTransition,
  PARKING_RATE_PER_HOUR,
} from "../../state-machine/engine";
import {
  CardState,
  CardStatus,
  MAGIC,
  CARD_SCHEMA_VERSION,
  TxType,
  type CardPayload,
} from "../../payload/types";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Creates a valid CardPayload in CHECKED_IN state with a session that started
 * `durationSeconds` ago relative to `nowSeconds`.
 */
function makeCheckedInPayload(
  balance: number,
  durationSeconds: number,
  nowSeconds: number,
): CardPayload {
  const startTime = nowSeconds - durationSeconds;
  return {
    header: {
      magic: MAGIC,
      version: CARD_SCHEMA_VERSION,
      type: 0,
      cardId: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]),
      tenantBind: 0,
    },
    identity: {
      name: "Test Member",
      userId: "test1234",
      gender: 0,
      status: CardStatus.ACTIVE,
      createdAt: 1700000000,
    },
    wallet: {
      balance,
      lastBalance: balance,
      counter: 10n,
      lastTimestamp: startTime,
      state: CardState.CHECKED_IN,
      flags: 0,
    },
    session: {
      startTime,
      endTime: 0,
      terminalId: 1,
    },
    logEntries: [],
    trailer: {
      expiresAt: 2000000000,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 10,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  };
}

/**
 * Creates a CardPayload with a specific state (for testing invalid transitions).
 */
function makePayloadWithState(
  state: CardState,
  status: CardStatus = CardStatus.ACTIVE,
): CardPayload {
  return {
    header: {
      magic: MAGIC,
      version: CARD_SCHEMA_VERSION,
      type: 0,
      cardId: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]),
      tenantBind: 0,
    },
    identity: {
      name: "Test Member",
      userId: "test1234",
      gender: 0,
      status,
      createdAt: 1700000000,
    },
    wallet: {
      balance: 100000,
      lastBalance: 100000,
      counter: 10n,
      lastTimestamp: 1700000000,
      state,
      flags: 0,
    },
    session: {
      startTime: 1700000000 - 3600,
      endTime: 0,
      terminalId: 1,
    },
    logEntries: [],
    trailer: {
      expiresAt: 2000000000,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 10,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  };
}

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/** Generates duration in seconds: 1 second to 86400 seconds (≤ 24 hours) */
const arbNonOvertimeDuration = fc.integer({ min: 1, max: 86400 });

/** Generates balance: 0 to 1,000,000 IDR */
const arbBalance = fc.integer({ min: 0, max: 1_000_000 });

/** Generates nowSeconds: reasonable epoch time */
const arbNowSeconds = fc.integer({ min: 1700100000, max: 1800000000 });

/** Generates a blocked card status */
const arbBlockedStatus = fc.constantFrom(
  CardStatus.BLOCKED_TAMPER,
  CardStatus.BLOCKED_FRAUD,
  CardStatus.BLOCKED_EXPIRED,
  CardStatus.BLOCKED_ADMIN,
);

// ============================================================================
// Property 2: Preservation — Standard Checkout Fee Calculation
// ============================================================================

describe("Preservation Property 2: Non-Overtime Checkout Behavior Unchanged", () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * For all inputs where durationSeconds ≤ 86400, `applyCheckout` produces:
   * - result.wallet.balance == payload.wallet.balance - min(ceil(durationSeconds/3600) * PARKING_RATE_PER_HOUR, payload.wallet.balance)
   * - result.wallet.state == CHECKED_OUT
   * - result.session.endTime == nowSeconds
   */
  it("Property 2.1: applyCheckout produces correct fee for sessions ≤ 24 hours", () => {
    fc.assert(
      fc.property(
        arbNonOvertimeDuration,
        arbBalance,
        arbNowSeconds,
        (durationSeconds, balance, nowSeconds) => {
          const payload = makeCheckedInPayload(balance, durationSeconds, nowSeconds);

          const result = applyCheckout(payload, nowSeconds);

          // Expected fee calculation
          const hours = Math.ceil(durationSeconds / 3600);
          const expectedFee = Math.min(hours * PARKING_RATE_PER_HOUR, balance);
          const expectedBalance = balance - expectedFee;

          // Assert: balance reflects standard parking fee capped at balance
          expect(result.wallet.balance).toBe(expectedBalance);

          // Assert: state is CHECKED_OUT
          expect(result.wallet.state).toBe(CardState.CHECKED_OUT);

          // Assert: session endTime is set to nowSeconds
          expect(result.session.endTime).toBe(nowSeconds);

          // Assert: lastBalance preserves original balance
          expect(result.wallet.lastBalance).toBe(balance);

          // Assert: counter incremented
          expect(result.wallet.counter).toBe(11n);

          // Assert: log entry records the checkout with correct fee
          const lastLog = result.logEntries[result.logEntries.length - 1];
          expect(lastLog.flags).toBe(TxType.CHECKOUT);
          expect(lastLog.amount).toBe(expectedFee);
          expect(lastLog.balanceAfter).toBe(expectedBalance);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.1**
   *
   * Concrete observation: 12-hour session produces correct fee.
   * ceil(12) * 2000 = 24000 IDR (capped at balance if balance < 24000)
   */
  it("Observation: 12-hour session produces correct fee ceil(12) * PARKING_RATE_PER_HOUR", () => {
    const nowSeconds = 1700100000;
    const durationSeconds = 12 * 3600; // 12 hours exactly
    const balance = 100000;
    const payload = makeCheckedInPayload(balance, durationSeconds, nowSeconds);

    const result = applyCheckout(payload, nowSeconds);

    const expectedFee = Math.ceil(12) * PARKING_RATE_PER_HOUR; // 12 * 2000 = 24000
    expect(result.wallet.balance).toBe(balance - expectedFee);
    expect(result.wallet.state).toBe(CardState.CHECKED_OUT);
    expect(result.session.endTime).toBe(nowSeconds);
  });

  /**
   * **Validates: Requirements 3.1**
   *
   * Concrete observation: 1-hour session produces correct fee.
   * ceil(1) * 2000 = 2000 IDR
   */
  it("Observation: 1-hour session produces correct fee", () => {
    const nowSeconds = 1700100000;
    const durationSeconds = 3600; // 1 hour exactly
    const balance = 50000;
    const payload = makeCheckedInPayload(balance, durationSeconds, nowSeconds);

    const result = applyCheckout(payload, nowSeconds);

    const expectedFee = Math.ceil(1) * PARKING_RATE_PER_HOUR; // 1 * 2000 = 2000
    expect(result.wallet.balance).toBe(balance - expectedFee);
    expect(result.wallet.state).toBe(CardState.CHECKED_OUT);
    expect(result.session.endTime).toBe(nowSeconds);
  });

  /**
   * **Validates: Requirements 3.1**
   *
   * When balance is less than the calculated fee, fee is capped at balance
   * (balance goes to 0, not negative).
   */
  it("Property 2.2: fee is capped at balance when balance < calculated fee", () => {
    fc.assert(
      fc.property(arbNonOvertimeDuration, arbNowSeconds, (durationSeconds, nowSeconds) => {
        // Use a balance that is less than the fee
        const hours = Math.ceil(durationSeconds / 3600);
        const fullFee = hours * PARKING_RATE_PER_HOUR;
        // Generate a balance that is less than the full fee (but > 0)
        const balance = Math.max(1, Math.floor(fullFee / 2));

        if (balance >= fullFee) return; // skip if balance covers full fee

        const payload = makeCheckedInPayload(balance, durationSeconds, nowSeconds);
        const result = applyCheckout(payload, nowSeconds);

        // Fee should be capped at balance
        const expectedFee = balance;
        expect(result.wallet.balance).toBe(0);
        expect(result.wallet.state).toBe(CardState.CHECKED_OUT);

        // Log entry should reflect capped fee
        const lastLog = result.logEntries[result.logEntries.length - 1];
        expect(lastLog.amount).toBe(expectedFee);
        expect(lastLog.balanceAfter).toBe(0);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 3.6**
   *
   * Invalid state transitions: cards in IDLE state cannot checkout via gate_checkout.
   * validateTransition rejects with reason containing "Invalid transition".
   */
  it("Property 2.3: IDLE cards cannot checkout — validateTransition rejects", () => {
    fc.assert(
      fc.property(arbNowSeconds, (nowSeconds) => {
        const payload = makePayloadWithState(CardState.IDLE);

        const result = validateTransition(payload, "gate_checkout", nowSeconds);

        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
        expect(result.reason).toContain("Invalid transition");
      }),
      { numRuns: 30 },
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * Cards in CHECKED_OUT state cannot checkout again via gate_checkout.
   * validateTransition rejects with reason containing "Invalid transition".
   */
  it("Property 2.4: CHECKED_OUT cards cannot checkout again — validateTransition rejects", () => {
    fc.assert(
      fc.property(arbNowSeconds, (nowSeconds) => {
        const payload = makePayloadWithState(CardState.CHECKED_OUT);

        const result = validateTransition(payload, "gate_checkout", nowSeconds);

        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
        expect(result.reason).toContain("Invalid transition");
      }),
      { numRuns: 30 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * Blocked cards are rejected by validateTransition regardless of trigger.
   * The reason contains "not active".
   */
  it("Property 2.5: blocked cards are rejected by validateTransition", () => {
    fc.assert(
      fc.property(
        arbBlockedStatus,
        fc.constantFrom(
          "gate_checkin" as const,
          "gate_checkout" as const,
          "terminal_start" as const,
          "terminal_end" as const,
          "force_checkout" as const,
        ),
        arbNowSeconds,
        (blockedStatus, trigger, nowSeconds) => {
          const payload = makePayloadWithState(CardState.CHECKED_IN, blockedStatus);

          const result = validateTransition(payload, trigger, nowSeconds);

          expect(result.valid).toBe(false);
          expect(result.reason).toContain("not active");
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 3.4**
   *
   * For valid CHECKED_IN cards, validateTransition allows gate_checkout
   * and the resulting state is CHECKED_OUT.
   */
  it("Property 2.6: valid CHECKED_IN cards can checkout via gate_checkout", () => {
    fc.assert(
      fc.property(
        arbNonOvertimeDuration,
        arbBalance,
        arbNowSeconds,
        (durationSeconds, balance, nowSeconds) => {
          const payload = makeCheckedInPayload(balance, durationSeconds, nowSeconds);

          const result = validateTransition(payload, "gate_checkout", nowSeconds);

          expect(result.valid).toBe(true);
          expect(result.nextState).toBe(CardState.CHECKED_OUT);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.4**
   *
   * The fee label for standard checkout is "Biaya" with the standard parking fee.
   * This is verified by checking the fee amount matches the formula:
   * fee = min(ceil(durationSeconds/3600) * PARKING_RATE_PER_HOUR, balance)
   */
  it("Property 2.7: standard parking fee formula is consistent across all non-overtime durations", () => {
    fc.assert(
      fc.property(
        arbNonOvertimeDuration,
        arbBalance.filter((b) => b > 0), // non-zero balance
        arbNowSeconds,
        (durationSeconds, balance, nowSeconds) => {
          const payload = makeCheckedInPayload(balance, durationSeconds, nowSeconds);
          const result = applyCheckout(payload, nowSeconds);

          // The fee is always: min(ceil(duration/3600) * rate, balance)
          const hours = Math.ceil(durationSeconds / 3600);
          const calculatedFee = hours * PARKING_RATE_PER_HOUR;
          const actualFee = Math.min(calculatedFee, balance);

          // Balance deducted matches the fee
          expect(payload.wallet.balance - result.wallet.balance).toBe(actualFee);

          // Fee is always positive for non-zero duration and non-zero balance
          expect(actualFee).toBeGreaterThan(0);

          // Fee never exceeds balance (no negative balance)
          expect(result.wallet.balance).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
