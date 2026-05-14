import { decodePayload, encodePayloadWire, buildHmacInput, validateMagic } from '../payload/engine'
import { computeHmac, verifyHmac, computeChainHash } from '../crypto/engine'
import type { CardPayload, SessionGrant } from '../payload/types'
import { BUFFER_SIZE } from '../payload/types'
import { readCard, writeCard } from './engine'

export type PipelineReadResult =
  | { ok: true; payload: CardPayload; serialNumber: string }
  | { ok: false; error: string; tamper?: boolean }

export type PipelineWriteResult =
  | { ok: true; payload: CardPayload }
  | { ok: false; error: string }

export async function readAndValidateCard(
  signal: AbortSignal,
  sessionGrant: SessionGrant,
): Promise<PipelineReadResult> {
  const nfcResult = await readCard(signal)
  if (!nfcResult.ok) return { ok: false, error: nfcResult.error }

  let payload: CardPayload
  try {
    payload = decodePayload(nfcResult.raw)
  } catch (e) {
    return { ok: false, error: `Payload decode failed: ${e}`, tamper: true }
  }

  const validationResult = await validateCard(payload, nfcResult.raw, sessionGrant)
  if (!validationResult.valid) {
    return { ok: false, error: validationResult.reason ?? 'Validation failed', tamper: validationResult.tamper }
  }

  return { ok: true, payload, serialNumber: nfcResult.serialNumber }
}

interface ValidationResult {
  valid: boolean
  reason?: string
  tamper?: boolean
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
    }
  }

  const activeBufferOffset = payload.trailer.activePtr === 0 ? 0 : 216
  const activeBuffer = raw.slice(activeBufferOffset, activeBufferOffset + 216)
  const hmacInput = buildHmacInput(activeBuffer, payload.trailer)
  const hmacValid = await verifyHmac(
    sessionGrant.sessionKey,
    payload.header.cardId,
    hmacInput,
    payload.trailer.hmac,
  )

  if (!hmacValid) {
    return { valid: false, reason: 'HMAC verification failed', tamper: true }
  }

  const counterBindLower = Number(payload.wallet.counter & 0xffffffffn)
  if (counterBindLower !== payload.trailer.counterBind) {
    return { valid: false, reason: 'Counter bind mismatch', tamper: true }
  }

  const chainValid = await validateChainHash(payload)
  if (!chainValid) {
    return { valid: false, reason: 'Chain hash invalid', tamper: true }
  }

  return { valid: true }
}

async function validateChainHash(payload: CardPayload): Promise<boolean> {
  if (payload.logEntries.length === 0) return true

  let prevHash = new Uint8Array(6)
  for (const entry of payload.logEntries) {
    const expected = await computeChainHash(
      entry.deltaTime,
      entry.amount,
      entry.balanceAfter,
      entry.flags,
      prevHash,
    )
    let diff = 0
    for (let i = 0; i < 6; i++) diff |= expected[i] ^ entry.hash[i]
    if (diff !== 0) return false
    prevHash = new Uint8Array(entry.hash)
  }
  return true
}

export async function prepareWrite(
  currentPayload: CardPayload,
  updatedPayload: CardPayload,
  sessionGrant: SessionGrant,
): Promise<Uint8Array> {
  const newCounter = updatedPayload.wallet.counter
  const cardId = updatedPayload.header.cardId

  const logEntries = await recomputeChainHashes(updatedPayload.logEntries)
  const withHashes = { ...updatedPayload, logEntries }

  const rootHash = logEntries.length > 0
    ? logEntries[logEntries.length - 1].hash
    : new Uint8Array(6)

  const newTrailer: CardPayload['trailer'] = {
    ...currentPayload.trailer,
    rootHash,
    counterBind: Number(newCounter & 0xffffffffn),
    activePtr: 0,
    hmac: new Uint8Array(8),
  }

  const finalPayload: CardPayload = { ...withHashes, trailer: newTrailer }
  const newBufBytes = encodePayloadWire(finalPayload).slice(0, BUFFER_SIZE)

  const hmacInput = buildHmacInput(newBufBytes, newTrailer)
  const hmac = await computeHmac(sessionGrant.sessionKey, cardId, hmacInput)

  const signedTrailer = { ...newTrailer, hmac }
  const signedPayload: CardPayload = { ...withHashes, trailer: signedTrailer }

  return encodePayloadWire(signedPayload)
}

async function recomputeChainHashes(entries: CardPayload['logEntries']): Promise<CardPayload['logEntries']> {
  const result: CardPayload['logEntries'] = []
  let prevHash = new Uint8Array(6)

  for (const entry of entries) {
    const hash = await computeChainHash(
      entry.deltaTime,
      entry.amount,
      entry.balanceAfter,
      entry.flags,
      prevHash,
    )
    result.push({ ...entry, hash })
    prevHash = new Uint8Array(hash)
  }
  return result
}

export async function commitWrite(
  raw: Uint8Array,
  signal: AbortSignal,
): Promise<PipelineWriteResult> {
  const writeResult = await writeCard(raw, signal)
  if (!writeResult.ok) return { ok: false, error: writeResult.error }

  try {
    const payload = decodePayload(raw)
    return { ok: true, payload }
  } catch (e) {
    return { ok: false, error: `Decode after write failed: ${e}` }
  }
}


export async function recoverFromIncompleteWrite(
  raw: Uint8Array,
  sessionGrant: SessionGrant,
): Promise<PipelineReadResult> {
  const trailer = raw.slice(432, 496)
  const view = new DataView(trailer.buffer, trailer.byteOffset)
  const activePtr = view.getUint8(28)

  const inactivePtr = activePtr === 0 ? 1 : 0
  const inactiveOffset = inactivePtr === 0 ? 0 : 216

  if (!validateMagic(raw, inactiveOffset)) {
    const activeOffset = activePtr === 0 ? 0 : 216
    if (!validateMagic(raw, activeOffset)) {
      return { ok: false, error: 'Both buffers invalid during recovery' }
    }
  }

  return readAndValidateCard(new AbortController().signal, sessionGrant)
}
