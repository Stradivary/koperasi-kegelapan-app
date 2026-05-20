/**
 * CardResetHandler — Handles card reset with penalty deduction for overtime sessions.
 *
 * Checks card eligibility for reset, deducts penalty from balance if sufficient,
 * transitions state to IDLE, and clears session. Rejects if card is blocked or
 * already idle.
 *
 * Pure functions — no side effects, no mutations to input payload.
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { CardState, CardStatus, type CardPayload } from "../payload/types";

/** Result of a card reset operation */
export interface CardResetResult {
  success: boolean;
  action: "PENALTY_DEDUCTED" | "TOPUP_REQUIRED" | "RESET_CLEAN" | "BLOCKED" | "INVALID_STATE";
  penaltyAmount?: number;
  remainingBalance?: number;
  shortfall?: number;
  status?: CardStatus;
}

/** All blocked status values */
const BLOCKED_STATUSES: ReadonlySet<number> = new Set([
  CardStatus.BLOCKED_TAMPER,
  CardStatus.BLOCKED_FRAUD,
  CardStatus.BLOCKED_EXPIRED,
  CardStatus.BLOCKED_ADMIN,
]);

/**
 * Checks if a card status value represents a blocked state.
 */
function isBlockedStatus(status: number): boolean {
  return BLOCKED_STATUSES.has(status);
}

/**
 * Resets a card with penalty deduction for overtime sessions.
 *
 * Preconditions:
 * - `payload` is a valid decrypted CardPayload
 * - `penaltyAmount` >= 0
 * - `currentTime` > payload.session.startTime
 *
 * Postconditions:
 * - If card status is BLOCKED_*: Returns `{ success: false, action: "BLOCKED", status }`
 * - If card state is IDLE: Returns `{ success: false, action: "INVALID_STATE" }`
 * - If `penaltyAmount === 0`: Returns `{ success: true, action: "RESET_CLEAN" }`
 * - If `balance >= penaltyAmount`: Returns `{ success: true, action: "PENALTY_DEDUCTED", penaltyAmount, remainingBalance }`
 * - If `balance < penaltyAmount`: Returns `{ success: false, action: "TOPUP_REQUIRED", penaltyAmount, shortfall }`
 *
 * @param payload - Decrypted card payload
 * @param penaltyAmount - Penalty to deduct (>= 0)
 * @param currentTime - Current epoch time in seconds
 * @returns CardResetResult
 *
 * @see Requirement 4.1 - Deduct penalty and reset when balance sufficient
 * @see Requirement 4.2 - Reject with TOPUP_REQUIRED when balance insufficient
 * @see Requirement 4.3 - Reset clean when penalty is zero
 * @see Requirement 4.4 - Reject if card is blocked
 * @see Requirement 4.5 - Preserve balance invariant
 * @see Requirement 4.6 - Reject if card state is IDLE
 */
export function resetWithPenalty(
  payload: CardPayload,
  penaltyAmount: number,
  _currentTime: number,
): CardResetResult {
  // Check 1: Reject if card status is blocked (Requirement 4.4)
  if (isBlockedStatus(payload.identity.status)) {
    return {
      success: false,
      action: "BLOCKED",
      status: payload.identity.status as CardStatus,
    };
  }

  // Check 2: Reject if card state is already IDLE (Requirement 4.6)
  if (payload.wallet.state === CardState.IDLE) {
    return {
      success: false,
      action: "INVALID_STATE",
    };
  }

  // Check 3: Clean reset when penalty is zero (Requirement 4.3)
  if (penaltyAmount === 0) {
    return {
      success: true,
      action: "RESET_CLEAN",
    };
  }

  const balance = payload.wallet.balance;

  // Check 4: Insufficient balance (Requirement 4.2)
  if (balance < penaltyAmount) {
    return {
      success: false,
      action: "TOPUP_REQUIRED",
      penaltyAmount,
      shortfall: penaltyAmount - balance,
    };
  }

  // Check 5: Sufficient balance — deduct penalty (Requirement 4.1, 4.5)
  const remainingBalance = balance - penaltyAmount;

  return {
    success: true,
    action: "PENALTY_DEDUCTED",
    penaltyAmount,
    remainingBalance,
  };
}

/**
 * Applies a reset to a card payload: deducts penalty, sets state to IDLE, clears session.
 *
 * Creates a new CardPayload (deep clone) — does NOT mutate the input payload.
 *
 * Postconditions:
 * - `result.wallet.balance === payload.wallet.balance - deduction`
 * - `result.wallet.state === CardState.IDLE`
 * - `result.session.startTime === 0`
 * - `result.session.endTime === now`
 * - Input payload is not mutated
 *
 * @param payload - Original card payload (not mutated)
 * @param deduction - Amount to deduct from balance
 * @param now - Current epoch time in seconds (set as session.endTime)
 * @returns New CardPayload with reset applied
 */
export function applyReset(payload: CardPayload, deduction: number, now: number): CardPayload {
  return {
    header: { ...payload.header },
    identity: { ...payload.identity },
    wallet: {
      ...payload.wallet,
      balance: payload.wallet.balance - deduction,
      lastBalance: payload.wallet.balance,
      state: CardState.IDLE,
    },
    session: {
      ...payload.session,
      startTime: 0,
      endTime: now,
    },
    logEntries: payload.logEntries.map((entry) => ({ ...entry })),
    trailer: { ...payload.trailer },
  };
}
