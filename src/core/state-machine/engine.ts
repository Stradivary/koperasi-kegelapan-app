import { CardState, CardStatus, type CardPayload, type SessionGrant } from '../payload/types'

export type TransitionTrigger =
  | 'gate_checkin'
  | 'terminal_start'
  | 'terminal_end'
  | 'gate_checkout'
  | 'force_checkout'
  | 'admin_reset'

interface TransitionResult {
  valid: boolean
  reason?: string
  nextState?: CardState
}

const VALID_TRANSITIONS: Record<CardState, Partial<Record<TransitionTrigger, CardState>>> = {
  [CardState.IDLE]: {
    gate_checkin: CardState.CHECKED_IN,
  },
  [CardState.CHECKED_IN]: {
    terminal_start: CardState.TERMINAL_OPERATION,
    gate_checkout: CardState.CHECKED_OUT,
    force_checkout: CardState.CHECKED_OUT,
  },
  [CardState.TERMINAL_OPERATION]: {
    terminal_end: CardState.CHECKED_IN,
    force_checkout: CardState.CHECKED_OUT,
  },
  [CardState.CHECKED_OUT]: {
    admin_reset: CardState.IDLE,
  },
}

export function validateTransition(
  payload: CardPayload,
  trigger: TransitionTrigger,
  nowSeconds: number,
): TransitionResult {
  const { state, flags: _flags } = payload.wallet
  const { status } = payload.identity

  if (status !== CardStatus.ACTIVE) {
    return { valid: false, reason: `Card is not active: status=${status}` }
  }

  if (trigger !== 'admin_reset' && isSessionExpired(payload, nowSeconds)) {
    if (trigger === 'gate_checkout' || trigger === 'force_checkout') {
      return { valid: true, nextState: CardState.CHECKED_OUT }
    }
    return { valid: false, reason: 'Session expired' }
  }

  const nextState = VALID_TRANSITIONS[state as CardState]?.[trigger]
  if (nextState === undefined) {
    return {
      valid: false,
      reason: `Invalid transition from ${CardState[state]} via ${trigger}`,
    }
  }

  return { valid: true, nextState }
}

export function isSessionExpired(payload: CardPayload, nowSeconds: number): boolean {
  const { state, lastTimestamp } = payload.wallet
  if (state === CardState.IDLE || state === CardState.CHECKED_OUT) return false

  const SESSION_TIMEOUT_SECONDS = 24 * 60 * 60
  const CLOCK_DRIFT_TOLERANCE = 60 * 60
  return nowSeconds > lastTimestamp + SESSION_TIMEOUT_SECONDS + CLOCK_DRIFT_TOLERANCE
}

export function isWriteEligible(
  payload: CardPayload,
  grant: SessionGrant,
  requiredOp: string,
  nowSeconds: number,
): { eligible: boolean; reason?: string } {
  const { status } = payload.identity
  if (status !== CardStatus.ACTIVE) {
    return { eligible: false, reason: `Card blocked: status=${status}` }
  }

  if (nowSeconds >= grant.expiresAt) {
    return { eligible: false, reason: 'Session grant expired' }
  }

  if (!grant.allowedOps.includes(requiredOp)) {
    return { eligible: false, reason: `Operation '${requiredOp}' not in grant` }
  }

  return { eligible: true }
}

export function applyCheckin(
  payload: CardPayload,
  terminalId: number,
  nowSeconds: number,
): CardPayload {
  return {
    ...payload,
    wallet: {
      ...payload.wallet,
      state: CardState.CHECKED_IN,
      lastTimestamp: nowSeconds,
    },
    session: {
      startTime: nowSeconds,
      endTime: 0,
      terminalId,
    },
  }
}

export function applyCheckout(payload: CardPayload, nowSeconds: number): CardPayload {
  return {
    ...payload,
    wallet: {
      ...payload.wallet,
      state: CardState.CHECKED_OUT,
      lastTimestamp: nowSeconds,
    },
    session: {
      ...payload.session,
      endTime: nowSeconds,
    },
  }
}

export function applyDebit(payload: CardPayload, amount: number, nowSeconds: number): CardPayload {
  const newBalance = payload.wallet.balance - amount
  const sessionStart = payload.session.startTime
  const deltaTime = Math.min(nowSeconds - sessionStart, 0xffff)
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
      flags: 0x00,
      hash: new Uint8Array(6),
    }),
  }
}

function buildLogEntry(
  existing: CardPayload['logEntries'],
  entry: CardPayload['logEntries'][number],
): CardPayload['logEntries'] {
  const entries = [...existing, entry]
  if (entries.length > 7) entries.shift()
  return entries
}
