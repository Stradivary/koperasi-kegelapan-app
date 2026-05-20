/**
 * Unit tests for OvertimeValidator
 *
 * Tests checkOvertime and isSessionExpired functions for:
 * - Edge cases: startTime === 0, state not CHECKED_IN
 * - No overtime when within 24-hour threshold
 * - Overtime detection when exceeding threshold
 * - Penalty action "DEDUCTED" when balance sufficient
 * - Penalty action "TOPUP_REQUIRED" when balance insufficient
 * - Shortfall calculation
 * - Pure function behavior (no mutations to input)
 *
 * @see Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import { describe, it, expect } from "vitest";
import { checkOvertime, isSessionExpired } from "../overtimeValidator";
import { CardState, CardStatus, type CardPayload } from "../../payload/types";

/** Helper to create a valid CardPayload for testing */
function createPayload(overrides: {
  balance?: number;
  state?: number;
  startTime?: number;
  counter?: bigint;
}): CardPayload {
  return {
    header: {
      magic: 0x4b4f5057,
      version: 2,
      type: 0,
      cardId: new Uint8Array(6),
      tenantBind: 0,
    },
    identity: {
      name: "Test User",
      userId: "abc12345",
      gender: 0,
      status: CardStatus.ACTIVE,
      createdAt: 1700000000,
    },
    wallet: {
      balance: overrides.balance ?? 50000,
      lastBalance: 50000,
      counter: overrides.counter ?? 10n,
      lastTimestamp: 1700000000,
      state: overrides.state ?? CardState.CHECKED_IN,
      flags: 0,
    },
    session: {
      startTime: overrides.startTime ?? 1700000000,
      endTime: 0,
      terminalId: 1,
    },
    logEntries: [],
    trailer: {
      expiresAt: 1800000000,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 10,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  };
}

describe("checkOvertime", () => {
  describe("edge cases (Requirements 2.5, 2.6)", () => {
    it("should return overtime: false with durationSeconds: 0 when session.startTime === 0", () => {
      const payload = createPayload({ startTime: 0 });
      const result = checkOvertime(payload, 1700090000, 5000);

      expect(result.overtime).toBe(false);
      expect(result.durationSeconds).toBe(0);
      expect(result.penalty).toBeUndefined();
    });

    it("should return overtime: false with durationSeconds: 0 when state is IDLE", () => {
      const payload = createPayload({ state: CardState.IDLE });
      const result = checkOvertime(payload, 1700090000, 5000);

      expect(result.overtime).toBe(false);
      expect(result.durationSeconds).toBe(0);
      expect(result.penalty).toBeUndefined();
    });

    it("should return overtime: false with durationSeconds: 0 when state is CHECKED_OUT", () => {
      const payload = createPayload({ state: CardState.CHECKED_OUT });
      const result = checkOvertime(payload, 1700090000, 5000);

      expect(result.overtime).toBe(false);
      expect(result.durationSeconds).toBe(0);
      expect(result.penalty).toBeUndefined();
    });

    it("should return overtime: false with durationSeconds: 0 when state is STATION_OPERATION", () => {
      const payload = createPayload({ state: CardState.STATION_OPERATION });
      const result = checkOvertime(payload, 1700090000, 5000);

      expect(result.overtime).toBe(false);
      expect(result.durationSeconds).toBe(0);
      expect(result.penalty).toBeUndefined();
    });
  });

  describe("no overtime - within threshold (Requirement 2.1)", () => {
    it("should return overtime: false when duration is exactly 86400 seconds", () => {
      const startTime = 1700000000;
      const currentTime = startTime + 86400;
      const payload = createPayload({ startTime });

      const result = checkOvertime(payload, currentTime, 5000);

      expect(result.overtime).toBe(false);
      expect(result.durationSeconds).toBe(86400);
      expect(result.penalty).toBeUndefined();
    });

    it("should return overtime: false when duration is less than 86400 seconds", () => {
      const startTime = 1700000000;
      const currentTime = startTime + 3600; // 1 hour
      const payload = createPayload({ startTime });

      const result = checkOvertime(payload, currentTime, 5000);

      expect(result.overtime).toBe(false);
      expect(result.durationSeconds).toBe(3600);
      expect(result.penalty).toBeUndefined();
    });
  });

  describe("overtime detected - DEDUCTED action (Requirements 2.2, 2.3)", () => {
    it("should return overtime: true with DEDUCTED when balance >= penalty", () => {
      const startTime = 1700000000;
      const currentTime = startTime + 90000; // 25 hours → 1 overtime hour
      const payload = createPayload({ startTime, balance: 50000 });

      const result = checkOvertime(payload, currentTime, 5000);

      expect(result.overtime).toBe(true);
      expect(result.durationSeconds).toBe(90000);
      expect(result.penalty).toBeDefined();
      expect(result.penalty!.amount).toBe(5000); // 1 hour × 5000
      expect(result.penalty!.action).toBe("DEDUCTED");
      expect(result.penalty!.shortfall).toBeUndefined();
    });

    it("should return DEDUCTED when balance exactly equals penalty", () => {
      const startTime = 1700000000;
      const currentTime = startTime + 90000; // 1 overtime hour
      const payload = createPayload({ startTime, balance: 5000 });

      const result = checkOvertime(payload, currentTime, 5000);

      expect(result.penalty!.action).toBe("DEDUCTED");
      expect(result.penalty!.shortfall).toBeUndefined();
    });
  });

  describe("overtime detected - TOPUP_REQUIRED action (Requirements 2.4, 2.5)", () => {
    it("should return TOPUP_REQUIRED when balance < penalty", () => {
      const startTime = 1700000000;
      const currentTime = startTime + 90000; // 1 overtime hour → penalty 5000
      const payload = createPayload({ startTime, balance: 3000 });

      const result = checkOvertime(payload, currentTime, 5000);

      expect(result.overtime).toBe(true);
      expect(result.penalty!.action).toBe("TOPUP_REQUIRED");
      expect(result.penalty!.shortfall).toBe(2000); // 5000 - 3000
    });

    it("should return correct shortfall when balance is 0", () => {
      const startTime = 1700000000;
      const currentTime = startTime + 97200; // 3 overtime hours → penalty 15000
      const payload = createPayload({ startTime, balance: 0 });

      const result = checkOvertime(payload, currentTime, 5000);

      expect(result.penalty!.action).toBe("TOPUP_REQUIRED");
      expect(result.penalty!.amount).toBe(15000);
      expect(result.penalty!.shortfall).toBe(15000);
    });
  });

  describe("pure function - no mutations (Requirement 2.6)", () => {
    it("should not mutate the input payload", () => {
      const startTime = 1700000000;
      const currentTime = startTime + 90000;
      const payload = createPayload({ startTime, balance: 50000 });

      // Deep copy for comparison
      const originalBalance = payload.wallet.balance;
      const originalState = payload.wallet.state;
      const originalStartTime = payload.session.startTime;

      checkOvertime(payload, currentTime, 5000);

      expect(payload.wallet.balance).toBe(originalBalance);
      expect(payload.wallet.state).toBe(originalState);
      expect(payload.session.startTime).toBe(originalStartTime);
    });
  });
});

describe("isSessionExpired", () => {
  it("should return false when sessionStartTime is 0", () => {
    expect(isSessionExpired(0, 1700090000)).toBe(false);
  });

  it("should return false when duration is exactly 86400 seconds", () => {
    const startTime = 1700000000;
    expect(isSessionExpired(startTime, startTime + 86400)).toBe(false);
  });

  it("should return false when duration is less than 86400 seconds", () => {
    const startTime = 1700000000;
    expect(isSessionExpired(startTime, startTime + 3600)).toBe(false);
  });

  it("should return true when duration exceeds 86400 seconds", () => {
    const startTime = 1700000000;
    expect(isSessionExpired(startTime, startTime + 86401)).toBe(true);
  });

  it("should return true for large overtime durations", () => {
    const startTime = 1700000000;
    expect(isSessionExpired(startTime, startTime + 172800)).toBe(true); // 48 hours
  });
});
