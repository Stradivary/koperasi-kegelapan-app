/**
 * NFC Card Operations — Core Business Logic
 *
 * Implements check-in, check-out, top-up, card initialization, and
 * manual status reset. All functions operate on the decrypted CardPayload
 * and return a CardOperationResult.
 *
 * Requirements: 3.1, 4.1-4.4, 5.1-5.4, 6.1-6.2
 */

import type {
  CardPayload,
  CardOperationResult,
  TenantCardConfig,
} from './types.ts'
import { CURRENT_SCHEMA_VERSION } from './types.ts'
import { appendLog } from './log-buffer.ts'
import { calculateTariff } from './tariff.ts'

// ─── Check-In (Requirements 4.1, 4.2, 4.3, 4.4) ────────────────────────────

/**
 * Process a check-in operation on a card.
 *
 * Validates:
 * - Card status is 0 (Idle) — rejects double tap-in
 * - Balance >= minBalanceForEntry
 * - Card tid matches terminal tenant
 *
 * On success: sets status=1, lastIn=now, appends CHECKIN log.
 *
 * @param payload - Current card payload (decrypted)
 * @param config - Tenant configuration
 * @param now - Current Unix timestamp in seconds (injectable for testing)
 * @returns CardOperationResult with updated payload or error
 */
export function processCheckIn(
  payload: CardPayload,
  config: TenantCardConfig,
  now: number = Math.floor(Date.now() / 1000),
): CardOperationResult {
  // Requirement 4.4: Tenant mismatch
  if (payload.tid !== config.tid) {
    return {
      success: false,
      error: 'This card belongs to a different cooperative.',
      code: 'TENANT_MISMATCH',
    }
  }

  // Requirement 4.2: Double tap-in prevention
  if (payload.status === 1) {
    const lastInDate = new Date(payload.lastIn * 1000).toISOString()
    return {
      success: false,
      error: `Card already checked in at ${lastInDate}.`,
      code: 'ALREADY_CHECKED_IN',
    }
  }

  // Requirement 4.3: Minimum balance check
  if (payload.bal < config.minBalanceForEntry) {
    return {
      success: false,
      error: `Balance too low for entry. Current: Rp ${payload.bal}, Minimum required: Rp ${config.minBalanceForEntry}.`,
      code: 'INSUFFICIENT_BALANCE_ENTRY',
    }
  }

  // Success: update payload
  const updatedPayload: CardPayload = {
    ...payload,
    status: 1,
    lastIn: now,
    logs: appendLog(payload.logs, {
      t: now,
      a: 'CHECKIN',
      v: 0,
    }),
  }

  return {
    success: true,
    payload: updatedPayload,
    transaction: {
      type: 'CHECKIN',
      amount: 0,
      balanceBefore: payload.bal,
      balanceAfter: payload.bal,
      occurredAt: now,
    },
  }
}

// ─── Check-Out (Requirements 5.1, 5.2, 5.3, 5.4) ───────────────────────────

/**
 * Process a check-out operation on a card.
 *
 * Validates:
 * - Card status is 1 (Checked-In) — rejects double tap-out
 * - Calculated tariff does not exceed balance
 *
 * On success: deducts tariff, sets status=0, appends EXIT log.
 *
 * @param payload - Current card payload (decrypted)
 * @param config - Tenant configuration
 * @param now - Current Unix timestamp in seconds (injectable for testing)
 * @returns CardOperationResult with updated payload or error
 */
export function processCheckOut(
  payload: CardPayload,
  config: TenantCardConfig,
  now: number = Math.floor(Date.now() / 1000),
): CardOperationResult {
  // Requirement 5.2: Double tap-out prevention
  if (payload.status === 0) {
    return {
      success: false,
      error: 'Card is not checked in.',
      code: 'NOT_CHECKED_IN',
    }
  }

  // Requirement 5.4: Calculate tariff
  const tariff = calculateTariff(
    payload.lastIn,
    now,
    config.tariffRatePerHour,
  )

  // Requirement 5.3: Insufficient balance
  if (payload.bal < tariff) {
    return {
      success: false,
      error: `Insufficient balance. Required: Rp ${tariff}, Available: Rp ${payload.bal}.`,
      code: 'INSUFFICIENT_BALANCE_EXIT',
    }
  }

  const durationSeconds = now - payload.lastIn
  const durationHours = Math.ceil(durationSeconds / 3600)
  const newBalance = payload.bal - tariff

  const updatedPayload: CardPayload = {
    ...payload,
    bal: newBalance,
    status: 0,
    logs: appendLog(payload.logs, {
      t: now,
      a: 'EXIT',
      v: -tariff,
    }),
  }

  return {
    success: true,
    payload: updatedPayload,
    transaction: {
      type: 'EXIT',
      amount: -tariff,
      balanceBefore: payload.bal,
      balanceAfter: newBalance,
      occurredAt: now,
      entryTime: payload.lastIn,
      exitTime: now,
      durationHours,
    },
  }
}

// ─── Top-Up (Requirements 6.1, 6.2) ─────────────────────────────────────────

/**
 * Process a top-up operation on a card.
 *
 * Validates:
 * - New balance would not exceed maxBalance
 *
 * On success: adds amount to balance, appends TOPUP log.
 *
 * @param payload - Current card payload (decrypted)
 * @param amount - Top-up amount in Rupiah (must be positive)
 * @param config - Tenant configuration
 * @param source - Top-up source (cash, bank_transfer, e_wallet, other)
 * @param now - Current Unix timestamp in seconds (injectable for testing)
 * @returns CardOperationResult with updated payload or error
 */
export function processTopUp(
  payload: CardPayload,
  amount: number,
  config: TenantCardConfig,
  source: string = 'cash',
  now: number = Math.floor(Date.now() / 1000),
): CardOperationResult {
  if (amount <= 0) {
    return {
      success: false,
      error: 'Top-up amount must be positive.',
      code: 'INVALID_AMOUNT',
    }
  }

  const newBalance = payload.bal + amount

  // Requirement 6.2: Balance overflow prevention
  if (newBalance > config.maxBalance) {
    return {
      success: false,
      error: `Top-up would exceed maximum balance. Current: Rp ${payload.bal}, Max: Rp ${config.maxBalance}.`,
      code: 'BALANCE_OVERFLOW',
    }
  }

  const updatedPayload: CardPayload = {
    ...payload,
    bal: newBalance,
    logs: appendLog(payload.logs, {
      t: now,
      a: 'TOPUP',
      v: amount,
    }),
  }

  return {
    success: true,
    payload: updatedPayload,
    transaction: {
      type: 'TOPUP',
      amount,
      balanceBefore: payload.bal,
      balanceAfter: newBalance,
      occurredAt: now,
      topUpSource: source,
    },
  }
}

// ─── Card Initialization (Requirement 3.1) ──────────────────────────────────

/**
 * Create an initial card payload for a newly issued card.
 *
 * @param memberId - Member ID (e.g., "MBC-8829")
 * @param tenantId - Tenant ID (e.g., "KOP-001")
 * @returns Fresh CardPayload with zero balance and idle status
 */
export function initializeCard(
  memberId: string,
  tenantId: string,
): CardPayload {
  return {
    v: CURRENT_SCHEMA_VERSION,
    tid: tenantId,
    id: memberId,
    bal: 0,
    status: 0,
    lastIn: 0,
    logs: [],
  }
}

// ─── Card Status Reset (Requirement 3.1) ────────────────────────────────────

/**
 * Reset a card's status to Idle. Used by authorized operators at The Station
 * to fix stuck cards (e.g., member forgot to tap out).
 *
 * @param payload - Current card payload
 * @returns Updated CardPayload with status=0 and lastIn=0
 */
export function resetCardStatus(payload: CardPayload): CardPayload {
  return {
    ...payload,
    status: 0,
    lastIn: 0,
  }
}
