/**
 * OvertimeValidator — Pure functions for detecting overtime check-in sessions
 * and determining penalty actions.
 *
 * Detects when a check-in session exceeds 24 hours (86400 seconds) and
 * integrates with PenaltyCalculator to compute penalty amounts. Determines
 * whether the penalty can be deducted from balance or requires a top-up.
 *
 * @see Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import { CardState, type CardPayload } from "../payload/types";
import { calculatePenalty } from "./penaltyCalculator";

/** Threshold in seconds for overtime detection (24 hours) */
const OVERTIME_THRESHOLD_SECONDS = 86400;

/** Result of an overtime check */
export interface OvertimeCheckResult {
  overtime: boolean;
  durationSeconds: number;
  penalty?: {
    amount: number;
    action: "DEDUCTED" | "TOPUP_REQUIRED";
    shortfall?: number;
  };
}

/**
 * Checks whether a card session has exceeded the 24-hour overtime threshold
 * and computes the penalty if applicable.
 *
 * Edge cases handled:
 * - session.startTime === 0 → returns { overtime: false, durationSeconds: 0 }
 * - wallet.state !== CHECKED_IN → returns { overtime: false, durationSeconds: 0 }
 *
 * @param payload - The card payload (not mutated)
 * @param currentTime - Current UTC epoch seconds
 * @param tariffRate - Penalty rate per overtime hour (IDR)
 * @returns OvertimeCheckResult with overtime status, duration, and optional penalty
 */
export function checkOvertime(
  payload: CardPayload,
  currentTime: number,
  tariffRate: number,
): OvertimeCheckResult {
  // Edge case: session not started or card not checked in
  if (payload.session.startTime === 0 || payload.wallet.state !== CardState.CHECKED_IN) {
    return { overtime: false, durationSeconds: 0 };
  }

  const durationSeconds = currentTime - payload.session.startTime;

  // No overtime — within 24-hour threshold
  if (durationSeconds <= OVERTIME_THRESHOLD_SECONDS) {
    return { overtime: false, durationSeconds };
  }

  // Overtime detected — calculate penalty
  const penaltyResult = calculatePenalty(durationSeconds, tariffRate);
  const penaltyAmount = penaltyResult.amount;

  if (payload.wallet.balance >= penaltyAmount) {
    return {
      overtime: true,
      durationSeconds,
      penalty: {
        amount: penaltyAmount,
        action: "DEDUCTED",
      },
    };
  }

  // Insufficient balance — top-up required
  const shortfall = penaltyAmount - payload.wallet.balance;
  return {
    overtime: true,
    durationSeconds,
    penalty: {
      amount: penaltyAmount,
      action: "TOPUP_REQUIRED",
      shortfall,
    },
  };
}

/**
 * Checks if a session has expired (exceeded 24 hours) without triggering
 * penalty calculation.
 *
 * @param sessionStartTime - Session start time in UTC epoch seconds
 * @param currentTime - Current UTC epoch seconds
 * @returns true if the session duration exceeds 86400 seconds
 */
export function isSessionExpired(sessionStartTime: number, currentTime: number): boolean {
  if (sessionStartTime === 0) return false;
  return currentTime - sessionStartTime > OVERTIME_THRESHOLD_SECONDS;
}
