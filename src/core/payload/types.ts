export const MAGIC = 0x4b4f5057; // "KOPW"
export const CARD_SCHEMA_VERSION = 2;

export const BUFFER_SIZE = 216;
export const TRAILER_SIZE = 64;
export const CARD_SIZE = BUFFER_SIZE * 2 + TRAILER_SIZE; // 496
export const WIRE_SIZE = BUFFER_SIZE + TRAILER_SIZE; // 280 — compact NFC write format (active buffer + trailer only)

export const BUFFER_A_OFFSET = 0;
export const BUFFER_B_OFFSET = BUFFER_SIZE;
export const TRAILER_OFFSET = BUFFER_SIZE * 2;

// Offsets within each 216-byte buffer
export const HEADER_OFFSET = 0; // 16 bytes
export const IDENTITY_OFFSET = 16; // 48 bytes
export const WALLET_OFFSET = 64; // 24 bytes
export const SESSION_OFFSET = 88; // 16 bytes
export const LOG_OFFSET = 104; // 7 × 16 = 112 bytes

export const LOG_ENTRY_SIZE = 16;
export const LOG_ENTRY_COUNT = 5;

// Offsets within trailer (relative to trailer start)
export const TRAILER_EXPIRES_AT = 0; // uint32
export const TRAILER_KEY_VERSION = 4; // uint8
export const TRAILER_RESERVED_1 = 5; // 3 bytes
export const TRAILER_ROOT_HASH = 8; // 6 bytes
export const TRAILER_RESERVED_2 = 14; // 2 bytes
export const TRAILER_COUNTER_BIND = 16; // uint32
export const TRAILER_HMAC = 20; // 8 bytes
export const TRAILER_ACTIVE_PTR = 28; // uint8

export enum CardState {
  IDLE = 0,
  CHECKED_IN = 1,
  STATION_OPERATION = 2,
  CHECKED_OUT = 3,
}

export enum CardStatus {
  ACTIVE = 0,
  BLOCKED_TAMPER = 1,
  BLOCKED_FRAUD = 2,
  BLOCKED_EXPIRED = 3,
  BLOCKED_ADMIN = 4,
}

export enum TxType {
  DEBIT = 0,
  CREDIT = 1,
  CHECKIN = 2,
  CHECKOUT = 3,
  ADMIN = 4,
}

export interface LogEntry {
  deltaTime: number;
  amount: number;
  balanceAfter: number;
  flags: number;
  hash: Uint8Array;
}

export interface CardPayload {
  header: {
    magic: number;
    version: number;
    type: number;
    cardId: Uint8Array; // 6 bytes
    tenantBind: number; // FNV-32a hash of tenantId; 0 = unbound legacy card
  };
  identity: {
    name: string;
    userId: number;
    gender: number;
    status: number;
    createdAt: number;
  };
  wallet: {
    balance: number;
    lastBalance: number;
    counter: bigint;
    lastTimestamp: number;
    state: number;
    flags: number;
  };
  session: {
    startTime: number;
    endTime: number;
    terminalId: number;
  };
  logEntries: LogEntry[];
  trailer: {
    expiresAt: number;
    keyVersion: number;
    rootHash: Uint8Array; // 6 bytes
    counterBind: number;
    hmac: Uint8Array; // 8 bytes
    activePtr: number; // 0=Buffer A, 1=Buffer B
  };
}

export interface SessionGrant {
  keyVersion: number;
  sessionKey: Uint8Array;
  expiresAt: number;
  allowedOps: string[];
  signature: Uint8Array;
  tenantId: string;
  accountId: string;
  deviceId: string;
}

export interface ReconciliationEvent {
  cardId: string; // hex
  counter: number;
  type: string;
  amount: number;
  balanceAfter: number;
  timestamp: number;
  hash: string; // hex
  idempotencyKey: string;
}
