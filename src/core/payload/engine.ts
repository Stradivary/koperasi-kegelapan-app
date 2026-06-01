import {
  MAGIC,
  CARD_SCHEMA_VERSION,
  CARD_SIZE,
  WIRE_SIZE,
  BUFFER_SIZE,
  TRAILER_SIZE,
  BUFFER_A_OFFSET,
  BUFFER_B_OFFSET,
  TRAILER_OFFSET,
  HEADER_OFFSET,
  IDENTITY_OFFSET,
  WALLET_OFFSET,
  SESSION_OFFSET,
  LOG_OFFSET,
  LOG_ENTRY_SIZE,
  LOG_ENTRY_COUNT,
  TRAILER_EXPIRES_AT,
  TRAILER_KEY_VERSION,
  TRAILER_ROOT_HASH,
  TRAILER_COUNTER_BIND,
  TRAILER_HMAC,
  TRAILER_ACTIVE_PTR,
  type CardPayload,
  type LogEntry,
} from "./types";

const DEC = new TextDecoder();
const ENC = new TextEncoder();

function readUint24LE(view: DataView, offset: number): number {
  return (
    view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16)
  );
}

function writeUint24LE(view: DataView, offset: number, value: number): void {
  view.setUint8(offset, value & 0xff);
  view.setUint8(offset + 1, (value >> 8) & 0xff);
  view.setUint8(offset + 2, (value >> 16) & 0xff);
}

function readNullTerminatedUtf8(buf: Uint8Array, offset: number, length: number): string {
  const slice = buf.slice(offset, offset + length);
  const nullIdx = slice.indexOf(0);
  return DEC.decode(nullIdx === -1 ? slice : slice.slice(0, nullIdx));
}

function writeNullPaddedUtf8(buf: Uint8Array, offset: number, maxLen: number, value: string): void {
  const encoded = ENC.encode(value);
  const toCopy = Math.min(encoded.length, maxLen);
  buf.set(encoded.slice(0, toCopy), offset);
  buf.fill(0, offset + toCopy, offset + maxLen);
}

function decodeBuffer(raw: Uint8Array, bufOffset: number): Omit<CardPayload, "trailer"> {
  const buf = raw.slice(bufOffset, bufOffset + BUFFER_SIZE);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const header = {
    magic: view.getUint32(HEADER_OFFSET, true),
    version: view.getUint8(HEADER_OFFSET + 4),
    type: view.getUint8(HEADER_OFFSET + 5),
    cardId: buf.slice(HEADER_OFFSET + 6, HEADER_OFFSET + 12),
    tenantBind: view.getUint32(HEADER_OFFSET + 12, true), // bytes 12–15
  };

  const identity = {
    name: readNullTerminatedUtf8(buf, IDENTITY_OFFSET, 24),
    userId: readNullTerminatedUtf8(buf, IDENTITY_OFFSET + 24, 8),
    gender: view.getUint8(IDENTITY_OFFSET + 32),
    status: view.getUint8(IDENTITY_OFFSET + 33),
    createdAt: view.getUint32(IDENTITY_OFFSET + 36, true),
  };

  const wallet = {
    balance: view.getUint32(WALLET_OFFSET, true),
    lastBalance: view.getUint32(WALLET_OFFSET + 4, true),
    counter: view.getBigUint64(WALLET_OFFSET + 8, true),
    lastTimestamp: view.getUint32(WALLET_OFFSET + 16, true),
    state: view.getUint8(WALLET_OFFSET + 20),
    flags: view.getUint8(WALLET_OFFSET + 21),
  };

  const session = {
    startTime: view.getUint32(SESSION_OFFSET, true),
    endTime: view.getUint32(SESSION_OFFSET + 4, true),
    terminalId: view.getUint32(SESSION_OFFSET + 8, true),
  };

  const logEntries: LogEntry[] = [];
  for (let i = 0; i < LOG_ENTRY_COUNT; i++) {
    const base = LOG_OFFSET + i * LOG_ENTRY_SIZE;
    const hash = buf.slice(base + 12, base + 16);
    // Sentinel: all-zero hash means empty slot
    if (hash.every((b) => b === 0)) break;
    logEntries.push({
      timestamp: view.getUint32(base, true),
      amount: readUint24LE(view, base + 4),
      balanceAfter: view.getUint32(base + 7, true),
      flags: view.getUint8(base + 11),
      hash,
    });
  }

  return { header, identity, wallet, session, logEntries };
}

function encodeBuffer(payload: Omit<CardPayload, "trailer">): Uint8Array {
  const buf = new Uint8Array(BUFFER_SIZE);
  const view = new DataView(buf.buffer);

  view.setUint32(HEADER_OFFSET, payload.header.magic, true);
  view.setUint8(HEADER_OFFSET + 4, CARD_SCHEMA_VERSION);
  view.setUint8(HEADER_OFFSET + 5, payload.header.type);
  buf.set(payload.header.cardId.slice(0, 6), HEADER_OFFSET + 6);
  view.setUint32(HEADER_OFFSET + 12, payload.header.tenantBind ?? 0, true);

  writeNullPaddedUtf8(buf, IDENTITY_OFFSET, 24, payload.identity.name);
  writeNullPaddedUtf8(buf, IDENTITY_OFFSET + 24, 8, payload.identity.userId);
  view.setUint8(IDENTITY_OFFSET + 32, payload.identity.gender);
  view.setUint8(IDENTITY_OFFSET + 33, payload.identity.status);
  view.setUint32(IDENTITY_OFFSET + 36, payload.identity.createdAt, true);

  view.setUint32(WALLET_OFFSET, payload.wallet.balance, true);
  view.setUint32(WALLET_OFFSET + 4, payload.wallet.lastBalance, true);
  view.setBigUint64(WALLET_OFFSET + 8, payload.wallet.counter, true);
  view.setUint32(WALLET_OFFSET + 16, payload.wallet.lastTimestamp, true);
  view.setUint8(WALLET_OFFSET + 20, payload.wallet.state);
  view.setUint8(WALLET_OFFSET + 21, payload.wallet.flags);

  view.setUint32(SESSION_OFFSET, payload.session.startTime, true);
  view.setUint32(SESSION_OFFSET + 4, payload.session.endTime, true);
  view.setUint32(SESSION_OFFSET + 8, payload.session.terminalId, true);

  for (let i = 0; i < Math.min(payload.logEntries.length, LOG_ENTRY_COUNT); i++) {
    const base = LOG_OFFSET + i * LOG_ENTRY_SIZE;
    const entry = payload.logEntries[i];
    if (entry.amount > 0xffffff) {
      throw new Error(`Log entry amount ${entry.amount} exceeds uint24 maximum (16,777,215)`);
    }
    view.setUint32(base, entry.timestamp, true);
    writeUint24LE(view, base + 4, entry.amount);
    view.setUint32(base + 7, entry.balanceAfter, true);
    view.setUint8(base + 11, entry.flags);
    buf.set(entry.hash.slice(0, 4), base + 12);
  }

  return buf;
}

function decodeTrailer(raw: Uint8Array, offset = TRAILER_OFFSET): CardPayload["trailer"] {
  const trl = raw.slice(offset, offset + TRAILER_SIZE);
  const view = new DataView(trl.buffer, trl.byteOffset, trl.byteLength);
  return {
    expiresAt: view.getUint32(TRAILER_EXPIRES_AT, true),
    keyVersion: view.getUint8(TRAILER_KEY_VERSION),
    rootHash: trl.slice(TRAILER_ROOT_HASH, TRAILER_ROOT_HASH + 6),
    counterBind: view.getUint32(TRAILER_COUNTER_BIND, true),
    hmac: trl.slice(TRAILER_HMAC, TRAILER_HMAC + 8),
    activePtr: view.getUint8(TRAILER_ACTIVE_PTR),
  };
}

function encodeTrailer(trailer: CardPayload["trailer"]): Uint8Array {
  const trl = new Uint8Array(TRAILER_SIZE);
  const view = new DataView(trl.buffer);
  view.setUint32(TRAILER_EXPIRES_AT, trailer.expiresAt, true);
  view.setUint8(TRAILER_KEY_VERSION, trailer.keyVersion);
  trl.set(trailer.rootHash.slice(0, 6), TRAILER_ROOT_HASH);
  view.setUint32(TRAILER_COUNTER_BIND, trailer.counterBind, true);
  trl.set(trailer.hmac.slice(0, 8), TRAILER_HMAC);
  view.setUint8(TRAILER_ACTIVE_PTR, trailer.activePtr);
  return trl;
}

export function decodePayload(raw: Uint8Array): CardPayload {
  if (raw.length < WIRE_SIZE) throw new Error(`Card buffer too small: ${raw.length}`);

  if (raw.length < CARD_SIZE) {
    // Wire format: [activeBuffer (BUFFER_SIZE)] + [trailer (TRAILER_SIZE)]
    const trailer = decodeTrailer(raw, BUFFER_SIZE);
    const body = decodeBuffer(raw, 0);
    if (body.header.magic !== MAGIC)
      throw new Error(`Invalid card magic: 0x${body.header.magic.toString(16)}`);
    return { ...body, trailer };
  }

  // Full dual-buffer format
  const trailer = decodeTrailer(raw);
  const bufOffset = trailer.activePtr === 0 ? BUFFER_A_OFFSET : BUFFER_B_OFFSET;
  const body = decodeBuffer(raw, bufOffset);
  if (body.header.magic !== MAGIC)
    throw new Error(`Invalid card magic: 0x${body.header.magic.toString(16)}`);
  return { ...body, trailer };
}

export function encodePayload(payload: CardPayload): Uint8Array {
  const raw = new Uint8Array(CARD_SIZE);
  const bufBytes = encodeBuffer(payload);
  const trlBytes = encodeTrailer(payload.trailer);

  const activeOffset = payload.trailer.activePtr === 0 ? BUFFER_A_OFFSET : BUFFER_B_OFFSET;
  raw.set(bufBytes, activeOffset);
  raw.set(trlBytes, TRAILER_OFFSET);
  return raw;
}

// Compact wire format: [activeBuffer (216)] + [trailer (64)] = WIRE_SIZE bytes.
// Use this for all NFC writes - fits NTAG215 with headroom vs the 496-byte full format.
export function encodePayloadWire(payload: CardPayload): Uint8Array {
  const raw = new Uint8Array(WIRE_SIZE);
  raw.set(encodeBuffer(payload), 0);
  raw.set(encodeTrailer({ ...payload.trailer, activePtr: 0 }), BUFFER_SIZE);
  return raw;
}

export function getInactiveBufferOffset(activePtr: number): number {
  return activePtr === 0 ? BUFFER_B_OFFSET : BUFFER_A_OFFSET;
}

export function getActiveBufferOffset(activePtr: number): number {
  return activePtr === 0 ? BUFFER_A_OFFSET : BUFFER_B_OFFSET;
}

export function buildHmacInput(
  bufferBytes: Uint8Array,
  trailer: CardPayload["trailer"],
): Uint8Array {
  const anchorSize = 4 + 1 + 6 + 4;
  const data = new Uint8Array(BUFFER_SIZE + anchorSize);
  data.set(bufferBytes, 0);
  const view = new DataView(data.buffer, BUFFER_SIZE);
  view.setUint32(0, trailer.expiresAt, true);
  view.setUint8(4, trailer.keyVersion);
  data.set(trailer.rootHash.slice(0, 6), BUFFER_SIZE + 5);
  view.setUint32(11, trailer.counterBind, true);
  return data;
}

export function validateMagic(raw: Uint8Array, bufOffset: number): boolean {
  if (raw.length < bufOffset + 4) return false;
  const view = new DataView(raw.buffer, raw.byteOffset + bufOffset);
  return view.getUint32(0, true) === MAGIC;
}
