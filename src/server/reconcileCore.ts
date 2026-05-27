import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

export interface ReconcileEvent {
  cardId: string; // hex
  counter: number;
  type: string;
  amount: number;
  balanceAfter: number;
  timestamp: number;
  hash: string; // hex
  idempotencyKey: string;
  // Extra fields from outbox entry (ignored but present)
  tenantId?: string;
  terminalId?: number;
  status?: string;
  createdAt?: number;
  attempts?: number;
}

export interface ReconcileRequest {
  terminalId: number;
  events: ReconcileEvent[];
}

export interface ReconcileFlag {
  cardId: string;
  counter: number;
  reason: string;
}

export interface ReconcileResult {
  accepted: number;
  rejected: number;
  flags: ReconcileFlag[];
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Extract tenantId from the event — either from the explicit field
 * or parsed from the idempotencyKey (format: "tenantId:cardIdHex:counter")
 */
export function extractTenantId(event: ReconcileEvent): string | null {
  if (event.tenantId) return event.tenantId;
  const parts = event.idempotencyKey?.split(":");
  return parts && parts.length >= 3 ? parts[0] : null;
}

/**
 * Validate required fields on a reconcile event.
 * Returns { valid: true } if all fields are present, or { valid: false, reason } otherwise.
 */
export function validateReconcileEvent(event: ReconcileEvent): { valid: boolean; reason?: string } {
  if (
    !event.cardId ||
    event.counter == null ||
    !event.type ||
    event.amount == null ||
    event.balanceAfter == null ||
    event.timestamp == null ||
    !event.hash
  ) {
    return { valid: false, reason: "malformed_event" };
  }
  return { valid: true };
}

/**
 * Process a single reconcile event: validate, check for duplicates, and persist.
 * Returns { accepted: true } on success, or { accepted: false, reason } on rejection.
 */
async function processEvent(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: ReconcileEvent,
  terminalId: number,
): Promise<{ accepted: boolean; reason?: string }> {
  // Validate required fields
  const validation = validateReconcileEvent(event);
  if (!validation.valid) {
    return { accepted: false, reason: validation.reason ?? "malformed_event" };
  }

  const tenantId = extractTenantId(event);
  if (!tenantId) {
    return { accepted: false, reason: "missing_tenant_id" };
  }

  // Convert hex strings to binary for blob columns
  const cardIdBlob = hexToBytes(event.cardId);
  const hashBlob = hexToBytes(event.hash);

  // Check for duplicate first
  const existing = await db.get<{ id: number }>(sql`
    SELECT id FROM audit_log
    WHERE card_id = ${cardIdBlob} AND counter = ${event.counter}
    LIMIT 1
  `);

  if (existing) {
    return { accepted: false, reason: "duplicate_counter" };
  }

  // Insert into audit_log
  await db.run(sql`
    INSERT INTO audit_log (tenant_id, card_id, counter, type, amount, balance_after, timestamp, hash, terminal_id, flagged)
    VALUES (${tenantId}, ${cardIdBlob}, ${event.counter}, ${event.type}, ${event.amount}, ${event.balanceAfter}, ${event.timestamp}, ${hashBlob}, ${terminalId}, 0)
  `);

  // Update card balance in cards table (only if this is a newer counter)
  await db.run(sql`
    UPDATE cards
    SET balance = ${event.balanceAfter},
        counter = ${event.counter},
        last_activity_at = ${event.timestamp}
    WHERE card_id = ${cardIdBlob}
      AND counter < ${event.counter}
  `);

  return { accepted: true };
}

export async function processReconciliation(
  db: DrizzleD1Database<Record<string, unknown>>,
  body: ReconcileRequest,
): Promise<ReconcileResult> {
  const { terminalId, events } = body;

  if (!Array.isArray(events) || events.length === 0) {
    return { accepted: 0, rejected: 0, flags: [] };
  }

  let accepted = 0;
  let rejected = 0;
  const flags: ReconcileFlag[] = [];

  for (const event of events) {
    try {
      const result = await processEvent(db, event, terminalId);
      if (result.accepted) {
        accepted++;
      } else {
        rejected++;
        flags.push({
          cardId: event.cardId ?? "unknown",
          counter: event.counter ?? 0,
          reason: result.reason ?? "rejected",
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      rejected++;
      flags.push({
        cardId: event.cardId,
        counter: event.counter,
        reason:
          msg.includes("UNIQUE") || msg.includes("duplicate")
            ? "duplicate_counter"
            : "internal_error",
      });
    }
  }

  return { accepted, rejected, flags };
}
