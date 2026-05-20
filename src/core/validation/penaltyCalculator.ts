/**
 * PenaltyCalculator — Pure function for computing overtime penalties.
 *
 * Calculates penalty based on duration exceeding 24 hours (86400 seconds)
 * and a configurable tariff rate per hour, with optional maximum cap.
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

/** Result of a penalty calculation */
export interface PenaltyCalculation {
  /** Total penalty amount in IDR */
  amount: number;
  /** Overtime duration in hours (rounded up) */
  overtimeHours: number;
  /** Rate applied per hour */
  ratePerHour: number;
  /** Whether a cap was applied */
  capped: boolean;
}

/** Threshold in seconds for overtime detection (24 hours) */
const OVERTIME_THRESHOLD_SECONDS = 86400;

/** Seconds per hour */
const SECONDS_PER_HOUR = 3600;

/**
 * Calculates the penalty for overtime duration.
 *
 * Formula:
 * - overtimeHours = Math.ceil((durationSeconds - 86400) / 3600)
 * - amount = min(overtimeHours × tariffRatePerHour, maxPenalty ?? Infinity)
 *
 * Returns zero penalty when durationSeconds <= 86400 or tariffRatePerHour <= 0.
 *
 * @param durationSeconds - Total session duration in seconds
 * @param tariffRatePerHour - Penalty rate per overtime hour (IDR)
 * @param maxPenalty - Optional maximum penalty cap
 * @returns PenaltyCalculation with amount, overtimeHours, ratePerHour, and capped flag
 */
export function calculatePenalty(
  durationSeconds: number,
  tariffRatePerHour: number,
  maxPenalty?: number,
): PenaltyCalculation {
  // Return zero penalty for non-overtime or invalid rate
  if (durationSeconds <= OVERTIME_THRESHOLD_SECONDS || tariffRatePerHour <= 0) {
    return {
      amount: 0,
      overtimeHours: 0,
      ratePerHour: tariffRatePerHour,
      capped: false,
    };
  }

  const overtimeHours = Math.ceil(
    (durationSeconds - OVERTIME_THRESHOLD_SECONDS) / SECONDS_PER_HOUR,
  );

  const rawAmount = overtimeHours * tariffRatePerHour;

  const cappedAmount = maxPenalty !== undefined ? Math.min(rawAmount, maxPenalty) : rawAmount;

  const capped = maxPenalty !== undefined && rawAmount > maxPenalty;

  return {
    amount: cappedAmount,
    overtimeHours,
    ratePerHour: tariffRatePerHour,
    capped,
  };
}
