import { CARD_SIZE, WIRE_SIZE } from "../payload/types";
import type { CardPayload, CardStatus } from "../payload/types";
import { checkBlocked, checkBlockedSync, type BlockCheckResult } from "../validation/blockEnforcer";

export type NfcReadResult =
  | { ok: true; raw: Uint8Array; serialNumber: string }
  | { ok: false; error: string };

export type NfcWriteResult = { ok: true } | { ok: false; error: string };

export type NfcAvailability = "available" | "unavailable" | "permission_denied" | "unknown";

declare global {
  interface NDEFReader {
    scan(options?: { signal?: AbortSignal }): Promise<void>;
    write(
      message: NDEFMessageInit,
      options?: { signal?: AbortSignal; overwrite?: boolean },
    ): Promise<void>;
    addEventListener(type: "reading", handler: (event: NDEFReadingEvent) => void): void;
    addEventListener(type: "readingerror", handler: (event: NDEFErrorEvent) => void): void;
  }
  interface NDEFReadingEvent extends Event {
    serialNumber: string;
    message: NDEFMessage;
  }
  interface NDEFErrorEvent extends Event {
    error: DOMException;
  }
  interface NDEFMessage {
    records: NDEFRecord[];
  }
  interface NDEFRecord {
    recordType: string;
    data: DataView | null;
  }
  interface NDEFMessageInit {
    records: Array<{ recordType: string; data: BufferSource }>;
  }
  const NDEFReader: new () => NDEFReader;
}

export function isNfcSupported(): boolean {
  return typeof globalThis !== "undefined" && "NDEFReader" in globalThis;
}

export async function checkNfcAvailability(): Promise<NfcAvailability> {
  if (!isNfcSupported()) return "unavailable";
  try {
    const result = await (
      navigator as Navigator & {
        permissions: { query: (q: { name: string }) => Promise<{ state: string }> };
      }
    ).permissions.query({ name: "nfc" as PermissionName });
    if (result.state === "denied") return "permission_denied";
    return "available";
  } catch {
    return "unknown";
  }
}

export async function readCard(signal: AbortSignal): Promise<NfcReadResult> {
  if (!isNfcSupported()) return { ok: false, error: "NFC not supported on this device" };

  return new Promise((resolve) => {
    const reader = new NDEFReader();
    reader.addEventListener("reading", (event: NDEFReadingEvent) => {
      try {
        const raw = extractCardBytes(event.message);
        if (!raw) {
          resolve({ ok: false, error: "Kartu tidak berisi data yang valid" });
          return;
        }
        resolve({ ok: true, raw, serialNumber: event.serialNumber });
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
    reader.addEventListener("readingerror", (event: NDEFErrorEvent) => {
      resolve({ ok: false, error: friendlyReadError(event.error) });
    });
    reader.scan({ signal }).catch((e: Error) => {
      resolve({ ok: false, error: e.message });
    });
  });
}

export async function writeCard(raw: Uint8Array, signal: AbortSignal): Promise<NfcWriteResult> {
  if (!isNfcSupported()) return { ok: false, error: "NFC not supported on this device" };
  if (raw.length !== WIRE_SIZE && raw.length !== CARD_SIZE) {
    return { ok: false, error: `Expected ${WIRE_SIZE} or ${CARD_SIZE} bytes, got ${raw.length}` };
  }

  try {
    const writer = new NDEFReader();
    await writer.write(
      {
        records: [
          {
            recordType: "unknown",
            data: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
          },
        ],
      },
      { signal, overwrite: true },
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyWriteError(e) };
  }
}

export function friendlyReadError(err: DOMException | undefined): string {
  if (!err) return "Gagal membaca kartu NFC";
  const msg = err.message.toLowerCase();
  if (msg.includes("not ndef") || msg.includes("ndef")) {
    return "Kartu tidak memiliki data NDEF. Pastikan kartu sudah ditulis terlebih dahulu.";
  }
  if (msg.includes("aborted") || err.name === "AbortError") return "Operasi dibatalkan";
  return err.message;
}

export function friendlyWriteError(e: unknown): string {
  if (!(e instanceof DOMException)) return String(e);
  const msg = e.message.toLowerCase();
  if (e.name === "NotSupportedError" || msg.includes("not ndef") || msg.includes("ndef")) {
    return "Kartu tidak kompatibel NDEF. Gunakan kartu NTAG213 / NTAG215 / NTAG216.";
  }
  if (msg.includes("io") || msg.includes("i/o")) {
    return "Gagal menulis: kartu dipindahkan terlalu cepat. Tahan kartu sampai proses selesai.";
  }
  if (msg.includes("aborted") || e.name === "AbortError") return "Operasi dibatalkan";
  return e.message;
}

export function extractCardBytes(message: NDEFMessage): Uint8Array | null {
  for (const record of message.records) {
    if (record.data) {
      const bytes = new Uint8Array(
        record.data.buffer.slice(
          record.data.byteOffset,
          record.data.byteOffset + record.data.byteLength,
        ),
      );
      if (bytes.length >= CARD_SIZE) return bytes.slice(0, CARD_SIZE);
      if (bytes.length >= WIRE_SIZE) return bytes.slice(0, WIRE_SIZE);
    }
  }
  return null;
}

// ============================================================================
// Block Enforcement for NFC Operations
// ============================================================================

/** Result of a pre-operation block check */
export type BlockGuardResult =
  | { allowed: true }
  | { allowed: false; error: string; errorCode: BlockCheckResult["errorCode"] };

/**
 * Checks whether a card is blocked before a check-in operation.
 *
 * Uses both the on-card status (from decoded CardPayload) and the local IndexedDB
 * record to determine if the card is blocked. If either source indicates a blocked
 * status, the operation is rejected with the appropriate error message and code.
 *
 * This check MUST be called BEFORE any state changes are made to the card.
 *
 * @param tenantId - Tenant identifier
 * @param cardId - Card identifier (hex string, e.g. serialNumber normalized)
 * @param payload - Decoded CardPayload from NFC read
 * @returns Promise<BlockGuardResult> - { allowed: true } or { allowed: false, error, errorCode }
 *
 * @see Requirement 6.1 - Reject check-in on blocked cards within 200ms
 * @see Requirement 6.4 - On-card status is authoritative
 * @see Requirement 6.5 - Local DB record used as fallback
 * @see Requirement 6.7 - Works regardless of online/offline status
 */
export async function enforceBlockOnCheckin(
  tenantId: string,
  cardId: string,
  payload: CardPayload,
): Promise<BlockGuardResult> {
  const onCardStatus = payload.identity.status as CardStatus;
  const result = await checkBlocked(tenantId, cardId, onCardStatus);

  if (result.blocked) {
    return {
      allowed: false,
      error: result.message ?? "Akses Ditolak: Kartu Diblokir",
      errorCode: result.errorCode,
    };
  }

  return { allowed: true };
}

/**
 * Checks whether a card is blocked before a check-out operation.
 *
 * Uses both the on-card status (from decoded CardPayload) and the local IndexedDB
 * record to determine if the card is blocked. If either source indicates a blocked
 * status, the operation is rejected with the appropriate error message and code.
 *
 * This check MUST be called BEFORE any state changes are made to the card.
 *
 * @param tenantId - Tenant identifier
 * @param cardId - Card identifier (hex string, e.g. serialNumber normalized)
 * @param payload - Decoded CardPayload from NFC read
 * @returns Promise<BlockGuardResult> - { allowed: true } or { allowed: false, error, errorCode }
 *
 * @see Requirement 6.2 - Reject check-out on blocked cards within 200ms
 * @see Requirement 6.4 - On-card status is authoritative
 * @see Requirement 6.5 - Local DB record used as fallback
 * @see Requirement 6.7 - Works regardless of online/offline status
 */
export async function enforceBlockOnCheckout(
  tenantId: string,
  cardId: string,
  payload: CardPayload,
): Promise<BlockGuardResult> {
  const onCardStatus = payload.identity.status as CardStatus;
  const result = await checkBlocked(tenantId, cardId, onCardStatus);

  if (result.blocked) {
    return {
      allowed: false,
      error: result.message ?? "Akses Ditolak: Kartu Diblokir",
      errorCode: result.errorCode,
    };
  }

  return { allowed: true };
}

/**
 * Synchronous block check for when card data and DB record are already available.
 *
 * Useful in scenarios where the card payload has been decoded and the local DB
 * card record has already been fetched (e.g., in the useNfcCard hook flow).
 *
 * @param payload - Decoded CardPayload from NFC read
 * @param dbCard - Optional card record from local IndexedDB (if already fetched)
 * @returns BlockGuardResult
 *
 * @see Requirement 6.4 - On-card status is authoritative
 * @see Requirement 6.5 - Local DB record used as fallback
 */
export function enforceBlockSync(
  payload: CardPayload,
  dbCard?: Parameters<typeof checkBlockedSync>[1],
): BlockGuardResult {
  const onCardStatus = payload.identity.status as CardStatus;
  const result = checkBlockedSync(onCardStatus, dbCard);

  if (result.blocked) {
    return {
      allowed: false,
      error: result.message ?? "Akses Ditolak: Kartu Diblokir",
      errorCode: result.errorCode,
    };
  }

  return { allowed: true };
}
