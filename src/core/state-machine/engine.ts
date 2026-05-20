import {
  CardState,
  CardStatus,
  TxType,
  LOG_ENTRY_COUNT,
  type CardPayload,
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

  const nextState = VALID_TRANSITIONS[state as CardState]?.[trigger];
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
export const MIN_BALANCE_AFTER_CHECKOUT = 10_000;

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
  const newCounter = payload.wallet.counter + 1n;
  return {
    ...payload,
    wallet: {
      ...payload.wallet,
      state: CardState.CHECKED_IN,
      counter: newCounter,
      lastTimestamp: nowSeconds,
    },
    session: {
      startTime: nowSeconds,
      endTime: 0,
      terminalId,
    },
    logEntries: buildLogEntry(payload.logEntries, {
      deltaTime: 0,
      amount: 0,
      balanceAfter: payload.wallet.balance,
      flags: TxType.CHECKIN,
      hash: new Uint8Array(6),
    }),
  };
}

export function applyCheckout(payload: CardPayload, nowSeconds: number): CardPayload {
  const durationSeconds = nowSeconds - payload.session.startTime;
  const fee = calculateCheckoutFee(payload, nowSeconds);
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
      lastTimestamp: nowSeconds,
    },
    session: {
      ...payload.session,
      endTime: nowSeconds,
    },
    logEntries: buildLogEntry(payload.logEntries, {
      deltaTime: Math.min(durationSeconds, 0xffff),
      amount: fee,
      balanceAfter: newBalance,
      flags: TxType.CHECKOUT,
      hash: new Uint8Array(6),
    }),
  };
}

export function applyDebit(payload: CardPayload, amount: number, nowSeconds: number): CardPayload {
  const newBalance = payload.wallet.balance - amount;
  const sessionStart = payload.session.startTime;
  const deltaTime = Math.min(nowSeconds - sessionStart, 0xffff);
  return {
    ...payload,
    wallet: {
      ...payload.wallet,
      lastBalance: payload.wallet.balance,
      balance: newBalance,
      counter: payload.wallet.counter + 1n,
      lastTimestamp: nowSeconds,
    },
    logEntries: buildLogEntry(payload.logEntries, {
      deltaTime,
      amount,
      balanceAfter: newBalance,
      flags: TxType.DEBIT,
      hash: new Uint8Array(6),
    }),
  };
}

export function applyTopup(payload: CardPayload, amount: number, nowSeconds: number): CardPayload {
  const newBalance = payload.wallet.balance + amount;
  return {
    ...payload,
    wallet: {
      ...payload.wallet,
      lastBalance: payload.wallet.balance,
      balance: newBalance,
      counter: payload.wallet.counter + 1n,
      lastTimestamp: nowSeconds,
    },
    logEntries: buildLogEntry(payload.logEntries, {
      deltaTime: 0,
      amount,
      balanceAfter: newBalance,
      flags: TxType.CREDIT,
      hash: new Uint8Array(6),
    }),
  };
}

export function applyResetState(payload: CardPayload, nowSeconds: number): CardPayload {
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
      lastTimestamp: nowSeconds,
      flags: 0,
    },
    session: {
      startTime: 0,
      endTime: 0,
      terminalId: 0,
    },
    logEntries: buildLogEntry(payload.logEntries, {
      deltaTime: 0,
      amount: 0,
      balanceAfter: payload.wallet.balance,
      flags: TxType.ADMIN,
      hash: new Uint8Array(6),
    }),
  };
}

export function buildLogEntry(
  existing: CardPayload["logEntries"],
  entry: CardPayload["logEntries"][number],
): CardPayload["logEntries"] {
  const entries = [...existing, entry];
  if (entries.length > LOG_ENTRY_COUNT) entries.shift();
  return entries;
}
