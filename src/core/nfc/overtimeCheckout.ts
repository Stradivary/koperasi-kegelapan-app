/**
 * Overtime-aware checkout handler.
 *
 * Integrates OvertimeValidator and CardResetHandler into the checkout flow.
 * Detects overtime sessions (>24h), applies penalty deductions when balance
 * is sufficient, and blocks checkout when top-up is required.
 *
 * @see Requirements 2.1, 2.3, 2.4, 4.1, 4.2
 */

import type { CardPayload } from "../payload/types";
import { checkOvertime } from "../validation/overtimeValidator";
import { resetWithPenalty, applyReset } from "../validation/cardResetHandler";
import { applyCheckout } from "../state-machine/engine";
import { localDb, type TransactionLog } from "../../db/local-db";

/** Default overtime tariff rate: 5000 IDR per hour */
export const DEFAULT_OVERTIME_TARIFF_RATE = 5_000;

/** Result of an overtime-aware checkout operation */
export interface OvertimeCheckoutResult {
  success: boolean;
  /** The updated payload to write to the NFC card */
  updatedPayload?: CardPayload;
  /** Operation type for reconciliation outbox */
  operationType: string;
  /** Whether overtime was detected */
  overtime: boolean;
  /** Penalty amount deducted (if any) */
  penaltyAmount?: number;
  /** Duration of the session in seconds */
  durationSeconds?: number;
  /** Parking fee charged (normal checkout) */
  fee?: number;
  /** Error message when checkout is blocked */
  error?: string;
  /** Action taken: normal checkout, penalty deducted, or top-up required */
  action: "NORMAL_CHECKOUT" | "PENALTY_DEDUCTED" | "TOPUP_REQUIRED";
  /** Shortfall amount when top-up is required */
  shortfall?: number;
}

/**
 * Performs an overtime-aware checkout.
 *
 * Flow:
 * 1. Calls `checkOvertime()` to detect if session exceeds 24 hours
 * 2. If no overtime: performs normal checkout via `applyCheckout()`
 * 3. If overtime with sufficient balance:
 *    - Calls `resetWithPenalty()` to verify deduction is possible
 *    - Calls `applyReset()` to produce updated payload with penalty deducted
 *    - Logs penalty transaction to IndexedDB transactionLog
 * 4. If overtime with insufficient balance: returns error requiring top-up
 *
 * @param payload - Current card payload (not mutated)
 * @param nowSeconds - Current epoch time in seconds
 * @param tenantId - Tenant identifier for transaction logging
 * @param deviceId - Device identifier for transaction logging
 * @param tariffRate - Overtime penalty rate per hour (defaults to 5000 IDR)
 * @returns OvertimeCheckoutResult
 */
export async function performOvertimeCheckout(
  payload: CardPayload,
  nowSeconds: number,
  tenantId: string,
  deviceId: string | null,
  tariffRate: number = DEFAULT_OVERTIME_TARIFF_RATE,
): Promise<OvertimeCheckoutResult> {
  // Step 1: Check for overtime
  const overtimeResult = checkOvertime(payload, nowSeconds, tariffRate);

  // Step 2: No overtime — perform normal checkout
  if (!overtimeResult.overtime) {
    const updatedPayload = applyCheckout(payload, nowSeconds);
    const durationSeconds = nowSeconds - payload.session.startTime;
    const fee = payload.wallet.balance - updatedPayload.wallet.balance;

    return {
      success: true,
      updatedPayload,
      operationType: "checkout",
      overtime: false,
      durationSeconds,
      fee,
      action: "NORMAL_CHECKOUT",
    };
  }

  // Step 3: Overtime detected — check penalty action
  const penalty = overtimeResult.penalty!;

  if (penalty.action === "TOPUP_REQUIRED") {
    // Insufficient balance — block checkout
    return {
      success: false,
      operationType: "checkout",
      overtime: true,
      penaltyAmount: penalty.amount,
      durationSeconds: overtimeResult.durationSeconds,
      action: "TOPUP_REQUIRED",
      shortfall: penalty.shortfall,
      error: `Saldo tidak cukup untuk denda overtime. Silakan top-up minimal Rp ${(penalty.shortfall ?? 0).toLocaleString("id-ID")}`,
    };
  }

  // Step 4: Sufficient balance — deduct penalty and reset
  const resetResult = resetWithPenalty(payload, penalty.amount, nowSeconds);

  if (!resetResult.success) {
    // Unexpected failure (blocked card, invalid state, etc.)
    return {
      success: false,
      operationType: "checkout",
      overtime: true,
      penaltyAmount: penalty.amount,
      durationSeconds: overtimeResult.durationSeconds,
      action: "TOPUP_REQUIRED",
      shortfall: resetResult.shortfall,
      error:
        resetResult.action === "BLOCKED"
          ? "Kartu diblokir. Hubungi admin."
          : "Reset gagal. Hubungi admin.",
    };
  }

  // Apply the reset to get the updated payload
  const updatedPayload = applyReset(payload, penalty.amount, nowSeconds);

  // Step 5: Log penalty transaction to IndexedDB
  await logPenaltyTransaction(
    tenantId,
    payload,
    updatedPayload,
    penalty.amount,
    overtimeResult.durationSeconds,
    nowSeconds,
    deviceId,
  );

  return {
    success: true,
    updatedPayload,
    operationType: "checkout",
    overtime: true,
    penaltyAmount: penalty.amount,
    durationSeconds: overtimeResult.durationSeconds,
    action: "PENALTY_DEDUCTED",
  };
}

/**
 * Logs a penalty transaction to the IndexedDB transactionLog table.
 *
 * @param tenantId - Tenant identifier
 * @param originalPayload - Original card payload before penalty
 * @param updatedPayload - Updated card payload after penalty
 * @param penaltyAmount - Amount deducted as penalty
 * @param durationSeconds - Total session duration in seconds
 * @param timestamp - Transaction timestamp (epoch seconds)
 * @param deviceId - Device identifier
 */
async function logPenaltyTransaction(
  tenantId: string,
  originalPayload: CardPayload,
  updatedPayload: CardPayload,
  penaltyAmount: number,
  _durationSeconds: number,
  timestamp: number,
  deviceId: string | null,
): Promise<void> {
  const cardIdHex = Array.from(originalPayload.header.cardId)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const entry: TransactionLog = {
    tenantId,
    cardId: cardIdHex,
    userId: originalPayload.identity.userId || null,
    counter: Number(updatedPayload.wallet.counter),
    type: "checkout",
    amount: penaltyAmount,
    balanceAfter: updatedPayload.wallet.balance,
    timestamp,
    hash: Array.from(updatedPayload.logEntries.at(-1)?.hash ?? new Uint8Array(6))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
    terminalId: null,
    deviceId,
    syncStatus: "pending",
    syncedAt: null,
    createdAt: Date.now(),
  };

  try {
    await localDb.transactionLog.add(entry);
  } catch {
    // Log failure is non-critical — transaction will be captured by reconciliation outbox
    // eslint-disable-next-line no-console
    console.warn("[overtimeCheckout] Failed to log penalty transaction to IndexedDB");
  }
}
