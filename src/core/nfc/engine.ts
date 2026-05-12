import { CARD_SIZE } from '../payload/types'

export type NfcReadResult =
  | { ok: true; raw: Uint8Array; serialNumber: string }
  | { ok: false; error: string }

export type NfcWriteResult = { ok: true } | { ok: false; error: string }

export type NfcAvailability = 'available' | 'unavailable' | 'permission_denied' | 'unknown'

declare global {
  interface NDEFReader {
    scan(options?: { signal?: AbortSignal }): Promise<void>
    write(message: NDEFMessageInit, options?: { signal?: AbortSignal }): Promise<void>
    addEventListener(type: 'reading', handler: (event: NDEFReadingEvent) => void): void
    addEventListener(type: 'readingerror', handler: (event: Event) => void): void
  }
  interface NDEFReadingEvent extends Event {
    serialNumber: string
    message: NDEFMessage
  }
  interface NDEFMessage {
    records: NDEFRecord[]
  }
  interface NDEFRecord {
    recordType: string
    data: DataView | null
  }
  interface NDEFMessageInit {
    records: Array<{ recordType: string; data: BufferSource }>
  }
  const NDEFReader: new () => NDEFReader
}

export function isNfcSupported(): boolean {
  return typeof globalThis !== 'undefined' && 'NDEFReader' in globalThis
}

export async function checkNfcAvailability(): Promise<NfcAvailability> {
  if (!isNfcSupported()) return 'unavailable'
  try {
    const result = await (navigator as Navigator & { permissions: { query: (q: { name: string }) => Promise<{ state: string }> } })
      .permissions.query({ name: 'nfc' as PermissionName })
    if (result.state === 'denied') return 'permission_denied'
    return 'available'
  } catch {
    return 'unknown'
  }
}

export async function readCard(signal: AbortSignal): Promise<NfcReadResult> {
  if (!isNfcSupported()) return { ok: false, error: 'NFC not supported on this device' }

  return new Promise((resolve) => {
    const reader = new NDEFReader()
    reader.addEventListener('reading', (event: NDEFReadingEvent) => {
      try {
        const raw = extractCardBytes(event.message)
        if (!raw) {
          resolve({ ok: false, error: 'No raw bytes in NFC message' })
          return
        }
        resolve({ ok: true, raw, serialNumber: event.serialNumber })
      } catch (e) {
        resolve({ ok: false, error: String(e) })
      }
    })
    reader.addEventListener('readingerror', () => {
      resolve({ ok: false, error: 'NFC read error' })
    })
    reader.scan({ signal }).catch((e: Error) => {
      resolve({ ok: false, error: e.message })
    })
  })
}

export async function writeCard(raw: Uint8Array, signal: AbortSignal): Promise<NfcWriteResult> {
  if (!isNfcSupported()) return { ok: false, error: 'NFC not supported on this device' }
  if (raw.length !== CARD_SIZE) return { ok: false, error: `Expected ${CARD_SIZE} bytes, got ${raw.length}` }

  try {
    const writer = new NDEFReader()
    await writer.write(
      {
        records: [{ recordType: 'unknown', data: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer }],
      },
      { signal },
    )
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

function extractCardBytes(message: NDEFMessage): Uint8Array | null {
  for (const record of message.records) {
    if (record.data) {
      const bytes = new Uint8Array(record.data.buffer.slice(record.data.byteOffset, record.data.byteOffset + record.data.byteLength))
      if (bytes.length >= CARD_SIZE) return bytes.slice(0, CARD_SIZE)
    }
  }
  return null
}
