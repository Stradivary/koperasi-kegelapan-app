import type { CardPayload } from "#/core/payload/types";
import type { WriteJournal } from "#/infrastructure/persistence/dexie/indexeddb";
import { getWriteJournalStore } from "#/infrastructure/persistence/dexie/indexeddb.lazy";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Journal entries older than this are considered stale and auto-cleared */
const JOURNAL_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/** Maximum recovery attempts before giving up */
export const MAX_JOURNAL_RECOVERY_ATTEMPTS = 3;

// ─── Serialization helpers ───────────────────────────────────────────────────

/**
 * Serialize a CardPayload to a JSON string, converting Uint8Arrays to hex.
 */
function serializePayload(payload: CardPayload): string {
  return JSON.stringify(payload, (_key, value) => {
    if (value instanceof Uint8Array) {
      return {
        __type: "Uint8Array",
        hex: Array.from(value)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      };
    }
    if (typeof value === "bigint") {
      return { __type: "bigint", value: value.toString() };
    }
    return value;
  });
}

/**
 * Deserialize a JSON string back to a CardPayload, restoring Uint8Arrays from hex.
 */
function deserializePayload(json: string): CardPayload {
  return JSON.parse(json, (_key, value) => {
    if (value && typeof value === "object" && value.__type === "Uint8Array") {
      const hex = value.hex as string;
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }
    if (value && typeof value === "object" && value.__type === "bigint") {
      return BigInt(value.value);
    }
    return value;
  }) as CardPayload;
}

// ─── Public helpers ──────────────────────────────────────────────────────────

export function getCardIdHex(payload: CardPayload): string {
  return Array.from(payload.header.cardId)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Journal operations ──────────────────────────────────────────────────────

/**
 * Persist a write-ahead journal entry BEFORE attempting the physical NFC write.
 * This ensures recovery is possible if the write or verification fails.
 * Non-fatal: if IndexedDB is unavailable, the write proceeds without journaling.
 */
export async function saveWriteJournal(params: {
  tenantId: string;
  cardIdHex: string;
  serialNumber: string | null;
  rawBytes: Uint8Array;
  expectedPayload: CardPayload;
  previousPayload: CardPayload;
  updatedPayload: CardPayload;
  operationType: string;
  terminalId: number;
}): Promise<void> {
  try {
    const writeJournalStore = await getWriteJournalStore();
    const entry: WriteJournal = {
      tenantId: params.tenantId,
      cardIdHex: params.cardIdHex,
      serialNumber: params.serialNumber,
      rawBytes: params.rawBytes,
      expectedPayload: serializePayload(params.expectedPayload),
      previousPayload: serializePayload(params.previousPayload),
      updatedPayload: serializePayload(params.updatedPayload),
      operationType: params.operationType,
      terminalId: params.terminalId,
      createdAt: Date.now(),
      attempts: 0,
      status: "pending",
    };
    await writeJournalStore.put(entry);
  } catch {
    // Non-fatal - write proceeds without journal protection
  }
}

/**
 * Clear the journal entry after a successful write+verify+record cycle.
 * Non-fatal: failures are silently ignored.
 */
export async function clearWriteJournal(tenantId: string, cardIdHex: string): Promise<void> {
  try {
    const writeJournalStore = await getWriteJournalStore();
    await writeJournalStore.delete(tenantId, cardIdHex);
  } catch {
    // Non-fatal - stale entry will be auto-cleared on expiry
  }
}

/**
 * Retrieve a pending journal entry for a specific card.
 * Returns null if no entry exists, entry is expired, or max attempts exceeded.
 * Fails gracefully (returns null) if IndexedDB is unavailable or the store doesn't exist yet.
 */
export async function getPendingJournal(
  tenantId: string,
  cardIdHex: string,
): Promise<{
  entry: WriteJournal;
  rawBytes: Uint8Array;
  expectedPayload: CardPayload;
  previousPayload: CardPayload;
  updatedPayload: CardPayload;
} | null> {
  let entry: WriteJournal | undefined;
  try {
    const writeJournalStore = await getWriteJournalStore();
    entry = await writeJournalStore.get(tenantId, cardIdHex);
  } catch {
    // IndexedDB unavailable or store not yet created (version upgrade pending)
    return null;
  }
  if (!entry) return null;

  // Auto-clear expired entries
  if (Date.now() - entry.createdAt > JOURNAL_EXPIRY_MS) {
    try {
      const writeJournalStore = await getWriteJournalStore();
      await writeJournalStore.delete(tenantId, cardIdHex);
    } catch {
      // Best-effort cleanup
    }
    return null;
  }

  // Max attempts exceeded - leave entry for manual inspection but don't auto-recover
  if (entry.attempts >= MAX_JOURNAL_RECOVERY_ATTEMPTS) {
    return null;
  }

  try {
    return {
      entry,
      rawBytes: entry.rawBytes,
      expectedPayload: deserializePayload(entry.expectedPayload),
      previousPayload: deserializePayload(entry.previousPayload),
      updatedPayload: deserializePayload(entry.updatedPayload),
    };
  } catch {
    // Corrupted journal entry - clear it
    try {
      const store = await getWriteJournalStore();
      await store.delete(tenantId, cardIdHex);
    } catch {
      // Best-effort
    }
    return null;
  }
}

/**
 * Increment the attempt counter and mark as recovering.
 * Non-fatal: failures are silently ignored.
 */
export async function markJournalRecovering(tenantId: string, cardIdHex: string): Promise<void> {
  try {
    const writeJournalStore = await getWriteJournalStore();
    const entry = await writeJournalStore.get(tenantId, cardIdHex);
    if (!entry) return;
    await writeJournalStore.put({
      ...entry,
      attempts: entry.attempts + 1,
      status: "recovering",
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Reset journal status back to pending (e.g., after a failed recovery attempt).
 * Non-fatal: failures are silently ignored.
 */
export async function markJournalPending(tenantId: string, cardIdHex: string): Promise<void> {
  try {
    const writeJournalStore = await getWriteJournalStore();
    const entry = await writeJournalStore.get(tenantId, cardIdHex);
    if (!entry) return;
    await writeJournalStore.put({ ...entry, status: "pending" });
  } catch {
    // Non-fatal
  }
}
