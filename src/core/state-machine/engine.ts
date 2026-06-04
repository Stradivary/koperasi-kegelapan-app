import {
  CardState,
  CardStatus,
  TxType,
  LOG_ENTRY_COUNT,
  LOG_HASH_SIZE,
  type CardPayload,
  type LogEntry,
  type SessionGrant,
} from "../payload/types";

export type TransitionTrigger =
  | "gate_checkin"
  | "terminal_start"
  | "terminal_end"
  | "gate_checkout"
  | "force_checkout"
  | "admin_reset";

interface TransitionResult {
  valid: boolean;
  reason?: string;
  nextState?: CardState;
}

const VALID_TRANSITIONS: Record<CardState, Partial<Record<TransitionTrigger, CardState>>> = {
  [CardState.IDLE]: {
    gate_checkin: CardState.CHECKED_IN,
    force_checkout: CardState.CHECKED_OUT,
  },
  [CardState.CHECKED_IN]: {
    terminal_start: CardState.STATION_OPERATION,
    gate_checkout: CardState.CHECKED_OUT,
    force_checkout: CardState.CHECKED_OUT,
  },
  [CardState.STATION_OPERATION]: {
    terminal_end: CardState.CHECKED_IN,
    force_checkout: CardState.CHECKED_OUT,
  },
  [CardState.CHECKED_OUT]: {
    admin_reset: CardState.IDLE,
    gate_checkin: CardState.IDLE,
  },
};

export function validateTransition(
  payload: CardPayload,
  trigger: TransitionTrigger,
  nowSeconds: number,
): TransitionResult {
  const { state, flags: _flags } = payload.wallet;
  const { status } = payload.identity;

  if (status !== CardStatus.ACTIVE) {
    return { valid: false, reason: `Card is not active: status=${status}` };
  }

  if (trigger !== "admin_reset" && isSessionExpired(payload, nowSeconds)) {
    if (trigger === "gate_checkout" || trigger === "force_checkout") {
      return { valid: true, nextState: CardState.CHECKED_OUT };
    }
    return { valid: false, reason: "Session expired" };
  }

  if (trigger === "gate_checkin" && payload.wallet.balance < MIN_BALANCE_BEFORE_CHECKIN) {
    return {
      valid: false,
      reason: `Insufficient balance for check-in: ${payload.wallet.balance} < ${MIN_BALANCE_BEFORE_CHECKIN}`,
    };
  }

  const cardState = state as CardState;
  const nextState = VALID_TRANSITIONS[cardState]?.[trigger];
  if (nextState === undefined) {
    return {
      valid: false,
      reason: `Invalid transition from ${CardState[state]} via ${trigger}`,
    };
  }

  return { valid: true, nextState };
}

export function isSessionExpired(payload: CardPayload, nowSeconds: number): boolean {
  const { state, lastTimestamp } = payload.wallet;
  if (state === CardState.IDLE || state === CardState.CHECKED_OUT) return false;

  const SESSION_TIMEOUT_SECONDS = 24 * 60 * 60;
  const CLOCK_DRIFT_TOLERANCE = 60 * 60;
  return nowSeconds > lastTimestamp + SESSION_TIMEOUT_SECONDS + CLOCK_DRIFT_TOLERANCE;
}

export function isWriteEligible(
  payload: CardPayload,
  grant: SessionGrant,
  requiredOp: string,
  nowSeconds: number,
): { eligible: boolean; reason?: string } {
  const { status } = payload.identity;
  if (status !== CardStatus.ACTIVE) {
    return { eligible: false, reason: `Card blocked: status=${status}` };
  }

  if (nowSeconds >= grant.expiresAt) {
    return { eligible: false, reason: "Session grant expired" };
  }

  if (!grant.allowedOps.includes(requiredOp)) {
    return { eligible: false, reason: `Operation '${requiredOp}' not in grant` };
  }

  return { eligible: true };
}

export const PARKING_RATE_PER_HOUR = 2_000;
export const MIN_BALANCE_AFTER_CHECKOUT = 0;
export const MIN_BALANCE_BEFORE_CHECKIN = 10_000;
/**
 * Maximum single transaction amount — constrained by uint24 log entry field (max 16,777,215).
 * We use 16,000,000 as a round business limit within the 24-bit hardware cap.
 */
export const MAX_TRANSACTION_AMOUNT = 16_000_000;
/**
 * Maximum card balance — must not exceed MAX_TRANSACTION_AMOUNT so that a full-balance
 * debit can still be recorded in the 24-bit log amount field.
 */
export const MAX_BALANCE = MAX_TRANSACTION_AMOUNT;
export const MAX_TOPUP_AMOUNT = 2_000_000;
export const MIN_TOPUP_AMOUNT = 2_000;
export const MIN_ISSUANCE_BALANCE = 2_000;

/**
 * Calculate the checkout fee for a given payload and timestamp.
 * Fee is hours (rounded up) × rate, but never exceeds the card balance.
 */
export function calculateCheckoutFee(payload: CardPayload, nowSeconds: number): number {
  const durationSeconds = nowSeconds - payload.session.startTime;
  const hours = Math.ceil(durationSeconds / 3600);
  return hours * PARKING_RATE_PER_HOUR;
}

/**
 * Validates whether the card has sufficient balance to checkout.
 * After checkout, balance must remain >= MIN_BALANCE_AFTER_CHECKOUT (10,000).
 * Returns the deficit (top-up needed) if insufficient, or 0 if OK.
 */
export function validateCheckoutBalance(
  payload: CardPayload,
  nowSeconds: number,
): { sufficient: boolean; fee: number; deficit: number } {
  const fee = calculateCheckoutFee(payload, nowSeconds);
  const balanceAfter = payload.wallet.balance - fee;
  if (balanceAfter < MIN_BALANCE_AFTER_CHECKOUT) {
    // deficit = how much they need to top up so that balance - fee >= MIN_BALANCE_AFTER_CHECKOUT
    const deficit = MIN_BALANCE_AFTER_CHECKOUT - balanceAfter;
    return { sufficient: false, fee, deficit };
  }
  return { sufficient: true, fee, deficit: 0 };
}

export function applyCheckin(
  payload: CardPayload,
  terminalId: number,
  nowSeconds: number,
): CardPayload {
  const effectiveTimestamp = resolveTimestamp(nowSeconds);
  const newCounter = payload.wallet.counter + 1n;
  return {
    ...payload,
    wallet: {
      ...payload.wallet,
      state: CardState.CHECKED_IN,
      counter: newCounter,
      lastTimestamp: effectiveTimestamp,
    },
    session: {
      startTime: effectiveTimestamp,
      endTime: 0,
      terminalId,
    },
    logEntries: buildLogEntry(payload.logEntries, {
      timestamp: effectiveTimestamp,
      amount: 0,
      balanceAfter: payload.wallet.balance,
      flags: TxType.CHECKIN,
      hash: new Uint8Array(LOG_HASH_SIZE),
    }),
  };
}

export function applyCheckout(payload: CardPayload, nowSeconds: number): CardPayload {
  const effectiveTimestamp = resolveTimestamp(nowSeconds);
  const fee = calculateCheckoutFee(payload, effectiveTimestamp);
  const newBalance = payload.wallet.balance - fee;
  const newCounter = payload.wallet.counter + 1n;
  return {
    ...payload,
    wallet: {
      ...payload.wallet,
      state: CardState.CHECKED_OUT,
      lastBalance: payload.wallet.balance,
      balance: newBalance,
      counter: newCounter,
      lastTimestamp: effectiveTimestamp,
    },
    session: {
      ...payload.session,
      endTime: effectiveTimestamp,
    },
    logEntries: buildLogEntry(payload.logEntries, {
      timestamp: effectiveTimestamp,
      amount: fee,
      balanceAfter: newBalance,
      flags: TxType.CHECKOUT,
      hash: new Uint8Array(LOG_HASH_SIZE),
    }),
  };
}

export function applyDebit(payload: CardPayload, amount: number, nowSeconds: number): CardPayload {
  const effectiveTimestamp = resolveTimestamp(nowSeconds);
  const newBalance = payload.wallet.balance - amount;
  return {
    ...payload,
    wallet: {
      ...payload.wallet,
      lastBalance: payload.wallet.balance,
      balance: newBalance,
      counter: payload.wallet.counter + 1n,
      lastTimestamp: effectiveTimestamp,
    },
    logEntries: buildLogEntry(payload.logEntries, {
      timestamp: effectiveTimestamp,
      amount,
      balanceAfter: newBalance,
      flags: TxType.DEBIT,
      hash: new Uint8Array(LOG_HASH_SIZE),
    }),
  };
}

/**
 * Validates a topup amount against business rules.
 * Returns { valid: true } or { valid: false, reason }.
 */
export function validateTopup(
  payload: CardPayload,
  amount: number,
): { valid: boolean; reason?: string } {
  if (amount < MIN_TOPUP_AMOUNT) {
    return {
      valid: false,
      reason: `Nominal top-up minimal ${MIN_TOPUP_AMOUNT.toLocaleString("id-ID")}`,
    };
  }
  if (amount > MAX_TOPUP_AMOUNT) {
    return {
      valid: false,
      reason: `Nominal top-up maksimal ${MAX_TOPUP_AMOUNT.toLocaleString("id-ID")}`,
    };
  }
  const balanceAfter = payload.wallet.balance + amount;
  if (balanceAfter > MAX_BALANCE) {
    return {
      valid: false,
      reason: `Saldo setelah top-up (${balanceAfter.toLocaleString("id-ID")}) melebihi batas maksimal ${MAX_BALANCE.toLocaleString("id-ID")}`,
    };
  }
  return { valid: true };
}

export function applyTopup(payload: CardPayload, amount: number, nowSeconds: number): CardPayload {
  const effectiveTimestamp = resolveTimestamp(nowSeconds);
  const newBalance = payload.wallet.balance + amount;
  return {
    ...payload,
    wallet: {
      ...payload.wallet,
      lastBalance: payload.wallet.balance,
      balance: newBalance,
      counter: payload.wallet.counter + 1n,
      lastTimestamp: effectiveTimestamp,
    },
    logEntries: buildLogEntry(payload.logEntries, {
      timestamp: effectiveTimestamp,
      amount,
      balanceAfter: newBalance,
      flags: TxType.CREDIT,
      hash: new Uint8Array(LOG_HASH_SIZE),
    }),
  };
}

export function applyResetState(payload: CardPayload, nowSeconds: number): CardPayload {
  const effectiveTimestamp = resolveTimestamp(nowSeconds);
  const newCounter = payload.wallet.counter + 1n;
  return {
    ...payload,
    identity: {
      ...payload.identity,
      status: CardStatus.ACTIVE,
    },
    wallet: {
      ...payload.wallet,
      state: CardState.IDLE,
      counter: newCounter,
      lastTimestamp: effectiveTimestamp,
      flags: 0,
    },
    session: {
      startTime: 0,
      endTime: 0,
      terminalId: 0,
    },
    logEntries: buildLogEntry(payload.logEntries, {
      timestamp: effectiveTimestamp,
      amount: 0,
      balanceAfter: payload.wallet.balance,
      flags: TxType.ADMIN,
      hash: new Uint8Array(LOG_HASH_SIZE),
    }),
  };
}

/**
 * Apply a blocked status to the card payload.
 *
 * Used to write the blocked status back to the physical card when the local DB
 * indicates the card is blocked (e.g. blocked by admin via server) but the on-card
 * status is still ACTIVE. This ensures the physical card becomes the authoritative
 * source of truth for blocked status, enabling offline enforcement.
 *
 * Increments the counter and adds an ADMIN log entry to maintain chain integrity.
 */
export function applyBlockStatus(
  payload: CardPayload,
  blockedStatus: CardStatus,
  nowSeconds: number,
): CardPayload {
  const effectiveTimestamp = resolveTimestamp(nowSeconds);
  const newCounter = payload.wallet.counter + 1n;
  return {
    ...payload,
    identity: {
      ...payload.identity,
      status: blockedStatus,
    },
    wallet: {
      ...payload.wallet,
      counter: newCounter,
      lastTimestamp: effectiveTimestamp,
    },
    logEntries: buildLogEntry(payload.logEntries, {
      timestamp: effectiveTimestamp,
      amount: 0,
      balanceAfter: payload.wallet.balance,
      flags: TxType.ADMIN,
      hash: new Uint8Array(LOG_HASH_SIZE),
    }),
  };
}

/**
 * Resolves the effective timestamp for a state transition.
 * If nowSeconds is 0 (programming error), falls back to current wall-clock time and logs a warning.
 */
function resolveTimestamp(nowSeconds: number): number {
  if (nowSeconds === 0) {
    const fallback = Math.floor(Date.now() / 1000);
    console.warn(
      `[state-machine] nowSeconds is 0 - substituting wall-clock time (${fallback}). This indicates a programming error.`,
    );
    return fallback;
  }
  return nowSeconds;
}

export function buildLogEntry(
  existing: CardPayload["logEntries"],
  entry: LogEntry,
): CardPayload["logEntries"] {
  const entries = [...existing, entry];
  if (entries.length > LOG_ENTRY_COUNT) entries.shift();
  return entries;
}
