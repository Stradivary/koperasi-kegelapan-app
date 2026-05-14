import { describe, it, expect } from 'vitest'
import { decodePayload, encodePayload, encodePayloadWire } from './engine'
import { MAGIC, CARD_SCHEMA_VERSION, CardState, CardStatus, CARD_SIZE, WIRE_SIZE } from './types'

function makeMinimalCard(activePtr = 0): Uint8Array {
  const raw = new Uint8Array(CARD_SIZE)
  const view = new DataView(raw.buffer)
  const bufOffset = activePtr === 0 ? 0 : 216

  view.setUint32(bufOffset + 0, MAGIC, true)
  view.setUint8(bufOffset + 4, CARD_SCHEMA_VERSION)
  view.setUint8(bufOffset + 5, 0)
  for (let i = 0; i < 6; i++) raw[bufOffset + 6 + i] = i + 1

  const nameBytes = new TextEncoder().encode('Test User')
  raw.set(nameBytes, bufOffset + 16)

  view.setUint32(bufOffset + 16 + 32, 1001, true)
  view.setUint8(bufOffset + 16 + 36, 0)
  view.setUint8(bufOffset + 16 + 37, CardStatus.ACTIVE)

  view.setUint32(bufOffset + 64, 500000, true)
  view.setUint32(bufOffset + 64 + 4, 500000, true)
  view.setBigUint64(bufOffset + 64 + 8, 10n, true)
  view.setUint32(bufOffset + 64 + 16, 1700000000, true)
  view.setUint8(bufOffset + 64 + 20, CardState.CHECKED_IN)

  view.setUint32(bufOffset + 88, 1700000000, true)
  view.setUint32(bufOffset + 88 + 4, 0, true)
  view.setUint32(bufOffset + 88 + 8, 42, true)

  const trailerOffset = 432
  view.setUint32(trailerOffset + 0, 1800000000, true)
  view.setUint8(trailerOffset + 4, 1)
  view.setUint32(trailerOffset + 16, 10, true)
  view.setUint8(trailerOffset + 28, activePtr)

  return raw
}

describe('decodePayload', () => {
  it('decodes a valid buffer', () => {
    const raw = makeMinimalCard(0)
    const payload = decodePayload(raw)

    expect(payload.header.magic).toBe(MAGIC)
    expect(payload.header.version).toBe(CARD_SCHEMA_VERSION)
    expect(payload.header.cardId).toEqual(Uint8Array.from([1, 2, 3, 4, 5, 6]))
    expect(payload.identity.name).toBe('Test User')
    expect(payload.identity.userId).toBe(1001)
    expect(payload.identity.status).toBe(CardStatus.ACTIVE)
    expect(payload.wallet.balance).toBe(500000)
    expect(payload.wallet.counter).toBe(10n)
    expect(payload.wallet.state).toBe(CardState.CHECKED_IN)
    expect(payload.session.terminalId).toBe(42)
    expect(payload.trailer.activePtr).toBe(0)
    expect(payload.trailer.keyVersion).toBe(1)
  })

  it('throws on invalid magic', () => {
    const raw = makeMinimalCard(0)
    const view = new DataView(raw.buffer)
    view.setUint32(0, 0xdeadbeef, true)
    expect(() => decodePayload(raw)).toThrow('Invalid card magic')
  })

  it('throws on undersized buffer', () => {
    expect(() => decodePayload(new Uint8Array(100))).toThrow('too small')
  })
  it('selects buffer B when activePtr=1', () => {
    const raw = makeMinimalCard(1)
    const payload = decodePayload(raw)
    expect(payload.trailer.activePtr).toBe(1)
    expect(payload.header.magic).toBe(MAGIC)
  })
})

describe('encodePayload / decodePayload round-trip', () => {
  it('round-trips name correctly', () => {
    const raw = makeMinimalCard(0)
    const decoded = decodePayload(raw)
    const reencoded = encodePayload(decoded)
    const redecoded = decodePayload(reencoded)
    expect(redecoded.identity.name).toBe(decoded.identity.name)
    expect(redecoded.wallet.balance).toBe(decoded.wallet.balance)
    expect(redecoded.wallet.counter).toBe(decoded.wallet.counter)
  })

  it('preserves log entries', () => {
    const raw = makeMinimalCard(0)
    const decoded = decodePayload(raw)
    const withLog = {
      ...decoded,
      logEntries: [
        { deltaTime: 100, amount: 15000, balanceAfter: 485000, flags: 0x00, hash: new Uint8Array(6) },
      ],
    }
    const encoded = encodePayload(withLog)
    const redecoded = decodePayload(encoded)
    expect(redecoded.logEntries[0].amount).toBe(15000)
    expect(redecoded.logEntries[0].balanceAfter).toBe(485000)
  })
})

describe('encodePayloadWire / decodePayload wire format', () => {
  it('produces WIRE_SIZE bytes', () => {
    const raw = makeMinimalCard(0)
    const decoded = decodePayload(raw)
    const wire = encodePayloadWire(decoded)
    expect(wire.length).toBe(WIRE_SIZE)
    expect(WIRE_SIZE).toBe(280)
  })

  it('round-trips correctly', () => {
    const raw = makeMinimalCard(0)
    const decoded = decodePayload(raw)
    const wire = encodePayloadWire(decoded)
    const redecoded = decodePayload(wire)
    expect(redecoded.header.magic).toBe(MAGIC)
    expect(redecoded.identity.name).toBe(decoded.identity.name)
    expect(redecoded.identity.userId).toBe(decoded.identity.userId)
    expect(redecoded.wallet.balance).toBe(decoded.wallet.balance)
    expect(redecoded.wallet.counter).toBe(decoded.wallet.counter)
    expect(redecoded.trailer.expiresAt).toBe(decoded.trailer.expiresAt)
    expect(redecoded.trailer.activePtr).toBe(0)
  })

  it('wire format is smaller than full card format', () => {
    expect(WIRE_SIZE).toBeLessThan(CARD_SIZE)
    expect(CARD_SIZE - WIRE_SIZE).toBe(216) // one inactive buffer dropped
  })
})
