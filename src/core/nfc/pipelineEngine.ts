import { decodePayload, encodePayloadWire, buildHmacInput, validateMagic } from "../payload/engine";
import {
  computeHmac,
  verifyHmac,
  computeChainHash,
  encryptBuffer,
  decryptBuffer,
} from "../crypto/engine";
import type { CardPayload, SessionGrant } from "../payload/types";
import {
  BUFFER_SIZE,
  WIRE_SIZE,
  CARD_SCHEMA_VERSION,
  TRAILER_COUNTER_BIND,
} from "../payload/types";
import { isTenantBindValid } from "../payload/tenantBind";
import { readCard, writeCard } from "./engine";

/** Standardized reason code for tenant mismatch validation failures */
export const TENANT_MISMATCH_REASON = "TENANT_MISMATCH" as const;

/** User-facing Indonesian message for unregistered/foreign cards */
export const UNREGISTERED_CARD_MESSAGE =
  "Kartu anda tidak terdaftar / anda bukan member, harap daftarkan terlebih dahulu di station" as const;

const ENCRYPTED_BODY_START = 16; // IDENTITY_OFFSET — first byte of encrypted region
const ENCRYPTED_BODY_END = 184; // LOG_OFFSET + LOG_ENTRY_COUNT*LOG_ENTRY_SIZE = 104 + 80
const AUTH_TAG_END = 200; // ENCRYPTED_BODY_END + 16 (AES-GCM auth tag)

async function encryptCardBody(
  bufBytes: Uint8Array,
  sessionKey: Uint8Array,
  cardId: Uint8Array,
  counter: bigint,
): Promise<Uint8Array> {
  const plainBody = bufBytes.slice(ENCRYPTED_BODY_START, ENCRYPTED_BODY_END);
  const encrypted = await encryptBuffer(sessionKey, cardId, counter, plainBody);
  const result = new Uint8Array(BUFFER_SIZE);
  result.set(bufBytes.slice(0, ENCRYPTED_BODY_START));
  result.set(encrypted.slice(0, ENCRYPTED_BODY_END - ENCRYPTED_BODY_START), ENCRYPTED_BODY_START);
  result.set(encrypted.slice(ENCRYPTED_BODY_END - ENCRYPTED_BODY_START), ENCRYPTED_BODY_END);
  return result;
}

export async function decryptCardBody(
  bufBytes: Uint8Array,
  sessionKey: Uint8Array,
  cardId: Uint8Array,
  counter: bigint,
): Promise<Uint8Array> {
  const ciphertextWithTag = new Uint8Array(AUTH_TAG_END - ENCRYPTED_BODY_START);
  ciphertextWithTag.set(bufBytes.slice(ENCRYPTED_BODY_START, ENCRYPTED_BODY_END));
  ciphertextWithTag.set(
    bufBytes.slice(ENCRYPTED_BODY_END, AUTH_TAG_END),
    ENCRYPTED_BODY_END - ENCRYPTED_BODY_START,
  );
  const plainBody = await decryptBuffer(sessionKey, cardId, counter, ciphertextWithTag);
  const result = new Uint8Array(BUFFER_SIZE);
  result.set(bufBytes.slice(0, ENCRYPTED_BODY_START));
  result.set(plainBody, ENCRYPTED_BODY_START);
  return result;
}

export type PipelineReadResult =
  | { ok: true; payload: CardPayload; serialNumber: string }
  | { ok: false; error: string; tamper?: boolean };

export type PipelineWriteResult = { ok: true; payload: CardPayload } | { ok: false; error: string };

export async function readAndValidateCard(
  signal: AbortSignal,
  sessionGrant: SessionGrant,
): Promise<PipelineReadResult> {
  const nfcResult = await readCard(signal);
  if (!nfcResult.ok) return { ok: false, error: nfcResult.error };

  let payload: CardPayload;
  try {
    const version = nfcResult.raw[4];
    let decodableRaw = nfcResult.raw;
    if (version === CARD_SCHEMA_VERSION) {
      const trailerView = new DataView(
        nfcResult.raw.buffer,
        nfcResult.raw.byteOffset + BUFFER_SIZE,
      );
      const counterBind = trailerView.getUint32(TRAILER_COUNTER_BIND, true);
      const cardId = nfcResult.raw.slice(6, 12);
      const decryptedBuf = await decryptCardBody(
        nfcResult.raw.slice(0, BUFFER_SIZE),
        sessionGrant.sessionKey,
        cardId,
        BigInt(counterBind),
      );
      const full = new Uint8Array(WIRE_SIZE);
      full.set(decryptedBuf, 0);
      full.set(nfcResult.raw.slice(BUFFER_SIZE), BUFFER_SIZE);
      decodableRaw = full;
    }
    payload = decodePayload(decodableRaw);
  } catch (e) {
    return { ok: false, error: `Payload decode failed: ${e}`, tamper: true };
  }

  const validationResult = await validateCard(payload, nfcResult.raw, sessionGrant);
  if (!validationResult.valid) {
    return {
      ok: false,
      error: validationResult.reason ?? "Validation failed",
      tamper: validationResult.tamper,
    };
  }

  return { ok: true, payload, serialNumber: nfcResult.serialNumber };
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
  tamper?: boolean;
}

export async function validateCard(
  payload: CardPayload,
  raw: Uint8Array,
  sessionGrant: SessionGrant,
): Promise<ValidationResult> {
  if (payload.trailer.keyVersion !== sessionGrant.keyVersion) {
    return {
      valid: false,
      reason: `Key version mismatch: card=${payload.trailer.keyVersion}, grant=${sessionGrant.keyVersion}`,
      tamper: false,
    };
  }

  const activeBufferOffset = payload.trailer.activePtr === 0 ? 0 : 216;
  const activeBuffer = raw.slice(activeBufferOffset, activeBufferOffset + 216);
  const hmacInput = buildHmacInput(activeBuffer, payload.trailer);
  const hmacValid = await verifyHmac(
    sessionGrant.sessionKey,
    payload.header.cardId,
    hmacInput,
    payload.trailer.hmac,
  );

  if (!hmacValid) {
    return { valid: false, reason: "HMAC verification failed", tamper: true };
  }

  const counterBindLower = Number(payload.wallet.counter & 0xffffffffn);
  if (counterBindLower !== payload.trailer.counterBind) {
    return { valid: false, reason: "Counter bind mismatch", tamper: true };
  }

  if (!isTenantBindValid(payload.header.tenantBind, sessionGrant.tenantId)) {
    return { valid: false, reason: UNREGISTERED_CARD_MESSAGE, tamper: false };
  }

  const chainValid = await validateChainHash(payload);
  if (!chainValid) {
    return { valid: false, reason: "Chain hash invalid", tamper: true };
  }

  return { valid: true };
}

async function validateChainHash(payload: CardPayload): Promise<boolean> {
  if (payload.logEntries.length === 0) return true;

  let prevHash = new Uint8Array(6);
  for (const entry of payload.logEntries) {
    const expected = await computeChainHash(
      entry.deltaTime,
      entry.amount,
      entry.balanceAfter,
      entry.flags,
      prevHash,
    );
    let diff = 0;
    for (let i = 0; i < 6; i++) diff |= expected[i] ^ entry.hash[i];
    if (diff !== 0) return false;
    prevHash = new Uint8Array(entry.hash);
  }
  return true;
}

export async function prepareWrite(
  currentPayload: CardPayload,
  updatedPayload: CardPayload,
  sessionGrant: SessionGrant,
): Promise<{ bytes: Uint8Array; payload: CardPayload }> {
  const newCounter = updatedPayload.wallet.counter;
  const cardId = updatedPayload.header.cardId;

  const logEntries = await recomputeChainHashes(updatedPayload.logEntries);
  const withHashes = { ...updatedPayload, logEntries };

  const rootHash =
    logEntries.length > 0 ? logEntries[logEntries.length - 1].hash : new Uint8Array(6);

  const newTrailer: CardPayload["trailer"] = {
    ...currentPayload.trailer,
    rootHash,
    counterBind: Number(newCounter & 0xffffffffn),
    activePtr: 0,
    hmac: new Uint8Array(8),
  };

  const finalPayload: CardPayload = { ...withHashes, trailer: newTrailer };
  const wireBytes = encodePayloadWire(finalPayload);
  const plainBufBytes = wireBytes.slice(0, BUFFER_SIZE);

  const isV2 = finalPayload.header.version === CARD_SCHEMA_VERSION;
  const activeBufBytes = isV2
    ? await encryptCardBody(plainBufBytes, sessionGrant.sessionKey, cardId, newCounter)
    : plainBufBytes;

  const hmacInput = buildHmacInput(activeBufBytes, newTrailer);
  const hmac = await computeHmac(sessionGrant.sessionKey, cardId, hmacInput);

  const signedTrailer = { ...newTrailer, hmac };
  const signedPayload: CardPayload = { ...withHashes, trailer: signedTrailer };

  // Build wire: [encrypted/plaintext buffer] + [signed trailer from re-encoding]
  const signedWire = encodePayloadWire(signedPayload);
  const result = new Uint8Array(WIRE_SIZE);
  result.set(activeBufBytes, 0);
  result.set(signedWire.slice(BUFFER_SIZE), BUFFER_SIZE);

  return { bytes: result, payload: signedPayload };
}

async function recomputeChainHashes(
  entries: CardPayload["logEntries"],
): Promise<CardPayload["logEntries"]> {
  const result: CardPayload["logEntries"] = [];
  let prevHash = new Uint8Array(6);

  for (const entry of entries) {
    const hash = await computeChainHash(
      entry.deltaTime,
      entry.amount,
      entry.balanceAfter,
      entry.flags,
      prevHash,
    );
    result.push({ ...entry, hash });
    prevHash = new Uint8Array(hash);
  }
  return result;
}

export async function commitWrite(
  raw: Uint8Array,
  payload: CardPayload,
  signal: AbortSignal,
): Promise<PipelineWriteResult> {
  const writeResult = await writeCard(raw, signal);
  if (!writeResult.ok) return { ok: false, error: writeResult.error };
  return { ok: true, payload };
}

export async function recoverFromIncompleteWrite(
  raw: Uint8Array,
  sessionGrant: SessionGrant,
): Promise<PipelineReadResult> {
  const trailer = raw.slice(432, 496);
  const view = new DataView(trailer.buffer, trailer.byteOffset);
  const activePtr = view.getUint8(28);

  const inactivePtr = activePtr === 0 ? 1 : 0;
  const inactiveOffset = inactivePtr === 0 ? 0 : 216;

  if (!validateMagic(raw, inactiveOffset)) {
    const activeOffset = activePtr === 0 ? 0 : 216;
    if (!validateMagic(raw, activeOffset)) {
      return { ok: false, error: "Both buffers invalid during recovery" };
    }
  }

  return readAndValidateCard(new AbortController().signal, sessionGrant);
}
