/**
 * Bug Condition Exploration Test — Overtime Sessions Use Normal Checkout
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 *
 * This test validates that the overtime penalty code path has been removed.
 * After the fix, all checkouts — regardless of session duration — use the
 * standard `applyCheckout` flow with standard parking fee calculation.
 *
 * The test encodes the EXPECTED (correct) behavior:
 * - All checkouts should use `applyCheckout` with standard parking fee
 * - Fee = min(ceil(durationSeconds / 3600) * PARKING_RATE_PER_HOUR, balance)
 * - Result state should be CHECKED_OUT
 * - No penalty calculation should occur
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { applyCheckout, PARKING_RATE_PER_HOUR } from "../../state-machine/engine";
import {
  CardState,
  CardStatus,
  MAGIC,
  CARD_SCHEMA_VERSION,
  type CardPayload,
} from "../../payload/types";

/**
 * Creates a valid CardPayload in CHECKED_IN state with a session that started
 * `durationSeconds` ago relative to `nowSeconds`.
 */
function makeOvertimePayload(
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

describe("Bug Condition Exploration: Overtime Sessions Use Normal Checkout via applyCheckout", () => {
  /**
   * Property 1: Bug Condition — For sessions > 86400s, `applyCheckout` produces
   * standard parking fee (CHECKED_OUT state, fee = ceil(hours) * PARKING_RATE_PER_HOUR capped at balance).
   *
   * After the fix, all checkouts use `applyCheckout` directly — no overtime penalty routing exists.
   */
  it("Property 1: sessions > 24h should produce standard parking fee via applyCheckout (not penalty)", () => {
    fc.assert(
      fc.property(
        // Generate duration > 86400 seconds (24h+1s to 72h)
        fc.integer({ min: 86401, max: 259200 }),
        // Generate balance sufficient to cover any fee (10k to 1M IDR)
        fc.integer({ min: 10000, max: 1000000 }),
        // Generate nowSeconds (reasonable epoch time)
        fc.integer({ min: 1700100000, max: 1800000000 }),
        (durationSeconds, balance, nowSeconds) => {
          const payload = makeOvertimePayload(balance, durationSeconds, nowSeconds);

          // Apply standard checkout (this is now the ONLY checkout path)
          const result = applyCheckout(payload, nowSeconds);

          const expectedFee = Math.min(
            Math.ceil(durationSeconds / 3600) * PARKING_RATE_PER_HOUR,
            balance,
          );

          // Assert: state should be CHECKED_OUT
          expect(result.wallet.state).toBe(CardState.CHECKED_OUT);

          // Assert: balance should reflect standard parking fee (not penalty)
          expect(result.wallet.balance).toBe(balance - expectedFee);

          // Assert: session endTime should be set to nowSeconds
          expect(result.session.endTime).toBe(nowSeconds);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Concrete case: 25-hour session (90000s)
   * Expected: normal checkout with ceil(90000/3600) * 2000 = 25 * 2000 = 50000 fee
   */
  it("concrete case: 25-hour session should charge standard fee", () => {
    const nowSeconds = 1700100000;
    const durationSeconds = 90000; // 25 hours
    const balance = 100000;
    const payload = makeOvertimePayload(balance, durationSeconds, nowSeconds);

    const result = applyCheckout(payload, nowSeconds);

    // Expected: standard parking fee
    const expectedFee = Math.min(Math.ceil(90000 / 3600) * PARKING_RATE_PER_HOUR, balance);
    // 25 hours * 2000 = 50000

    expect(result.wallet.state).toBe(CardState.CHECKED_OUT);
    expect(result.wallet.balance).toBe(balance - expectedFee);
    expect(result.session.endTime).toBe(nowSeconds);
  });

  /**
   * Concrete case: 48-hour session (172800s) with low balance
   * Expected: normal checkout with fee capped at balance (proceeds regardless)
   */
  it("concrete case: 48-hour session with low balance should proceed (fee capped at balance)", () => {
    const nowSeconds = 1700200000;
    const durationSeconds = 172800; // 48 hours
    const balance = 10000; // Low balance
    const payload = makeOvertimePayload(balance, durationSeconds, nowSeconds);

    const result = applyCheckout(payload, nowSeconds);

    // Expected: checkout succeeds with fee capped at balance
    const expectedFee = Math.min(Math.ceil(172800 / 3600) * PARKING_RATE_PER_HOUR, balance);
    // min(48 * 2000, 10000) = min(96000, 10000) = 10000

    expect(result.wallet.state).toBe(CardState.CHECKED_OUT);
    expect(result.wallet.balance).toBe(balance - expectedFee);
    expect(result.session.endTime).toBe(nowSeconds);
  });

  /**
   * Concrete case: just-over-24h session (86401s)
   * Expected: normal checkout with ceil(86401/3600) * 2000 = 25 * 2000 = 50000 fee
   */
  it("concrete case: 86401s session (just over 24h) should use standard fee", () => {
    const nowSeconds = 1700100000;
    const durationSeconds = 86401; // Just over 24 hours
    const balance = 200000;
    const payload = makeOvertimePayload(balance, durationSeconds, nowSeconds);

    const result = applyCheckout(payload, nowSeconds);

    // Expected: standard parking fee
    const expectedFee = Math.min(Math.ceil(86401 / 3600) * PARKING_RATE_PER_HOUR, balance);
    // ceil(86401/3600) = ceil(24.0003) = 25, fee = 25 * 2000 = 50000

    expect(result.wallet.state).toBe(CardState.CHECKED_OUT);
    expect(result.wallet.balance).toBe(balance - expectedFee);
    expect(result.session.endTime).toBe(nowSeconds);
  });
});
