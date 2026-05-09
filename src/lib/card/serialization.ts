/**
 * NFC Card Operations — Payload Serialization / Deserialization
 *
 * Compact binary format for the on-card payload. The total serialized size
 * (before encryption) must be small enough that serialized + encrypted + HMAC
 * stays under 256 bytes.
 *
 * Requirements: 15.1, 15.2
 *
 * Binary layout:
 *   [1B version] [1B tidLen] [tidLen B tid] [1B idLen] [idLen B id]
 *   [4B bal (uint32 BE)] [1B status] [4B lastIn (uint32 BE)]
 *   [1B logCount] [logCount × (4B t + 1B actionCode + 4B v(int32 BE))]
 *
 * Action codes: TOPUP=0, CHECKIN=1, EXIT=2
 */

import type { CardPayload, TransactionLogEntry } from './types.ts'

const ACTION_TO_CODE: Record<TransactionLogEntry['a'], number> = {
  TOPUP: 0,
  CHECKIN: 1,
  EXIT: 2,
}

const CODE_TO_ACTION: Record<number, TransactionLogEntry['a']> = {
  0: 'TOPUP',
  1: 'CHECKIN',
  2: 'EXIT',
}

const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

/**
 * Serialize a CardPayload into a compact binary Uint8Array.
 *
 * @param payload - The card payload to serialize
 * @returns Compact binary representation
 * @throws Error if the payload is too large
 */
export function serialize(payload: CardPayload): Uint8Array {
  const tidBytes = TEXT_ENCODER.encode(payload.tid)
  const idBytes = TEXT_ENCODER.encode(payload.id)
  const logCount = payload.logs.length

  // Calculate total size:
  // 1 (version) + 1 (tidLen) + tidLen + 1 (idLen) + idLen
  // + 4 (bal) + 1 (status) + 4 (lastIn)
  // + 1 (logCount) + logCount * 9 (4+1+4 per log entry)
  const size =
    1 +
    1 +
    tidBytes.length +
    1 +
    idBytes.length +
    4 +
    1 +
    4 +
    1 +
    logCount * 9

  const buffer = new ArrayBuffer(size)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let offset = 0

  // Version (1 byte)
  view.setUint8(offset, payload.v)
  offset += 1

  // Tenant ID (length-prefixed string)
  view.setUint8(offset, tidBytes.length)
  offset += 1
  bytes.set(tidBytes, offset)
  offset += tidBytes.length

  // Member ID (length-prefixed string)
  view.setUint8(offset, idBytes.length)
  offset += 1
  bytes.set(idBytes, offset)
  offset += idBytes.length

  // Balance (4-byte unsigned integer, big-endian) — Requirement 15.2
  view.setUint32(offset, payload.bal, false)
  offset += 4

  // Status (1 byte: 0 or 1)
  view.setUint8(offset, payload.status)
  offset += 1

  // Last check-in timestamp (4-byte unsigned integer, big-endian)
  view.setUint32(offset, payload.lastIn, false)
  offset += 4

  // Log count (1 byte)
  view.setUint8(offset, logCount)
  offset += 1

  // Log entries (9 bytes each: 4B timestamp + 1B action + 4B value)
  for (const log of payload.logs) {
    view.setUint32(offset, log.t, false)
    offset += 4
    view.setUint8(offset, ACTION_TO_CODE[log.a])
    offset += 1
    view.setInt32(offset, log.v, false)
    offset += 4
  }

  return bytes
}

/**
 * Deserialize a compact binary Uint8Array back into a CardPayload.
 *
 * @param data - Binary data to deserialize
 * @returns The deserialized card payload
 * @throws Error if the data is malformed
 */
export function deserialize(data: Uint8Array): CardPayload {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let offset = 0

  // Version
  const v = view.getUint8(offset)
  offset += 1

  // Tenant ID
  const tidLen = view.getUint8(offset)
  offset += 1
  const tid = TEXT_DECODER.decode(data.slice(offset, offset + tidLen))
  offset += tidLen

  // Member ID
  const idLen = view.getUint8(offset)
  offset += 1
  const id = TEXT_DECODER.decode(data.slice(offset, offset + idLen))
  offset += idLen

  // Balance (4-byte unsigned integer)
  const bal = view.getUint32(offset, false)
  offset += 4

  // Status
  const statusByte = view.getUint8(offset)
  offset += 1
  if (statusByte !== 0 && statusByte !== 1) {
    throw new Error(`Invalid card status byte: ${statusByte}`)
  }
  const status = statusByte as 0 | 1

  // Last check-in timestamp
  const lastIn = view.getUint32(offset, false)
  offset += 4

  // Log entries
  const logCount = view.getUint8(offset)
  offset += 1

  const logs: TransactionLogEntry[] = []
  for (let i = 0; i < logCount; i++) {
    const t = view.getUint32(offset, false)
    offset += 4
    const actionCode = view.getUint8(offset)
    offset += 1
    const logValue = view.getInt32(offset, false)
    offset += 4

    const a = CODE_TO_ACTION[actionCode]
    if (!a) {
      throw new Error(`Invalid action code: ${actionCode}`)
    }
    logs.push({ t, a, v: logValue })
  }

  return { v, tid, id, bal, status, lastIn, logs }
}
