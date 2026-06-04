import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, gt, asc, sql } from "drizzle-orm";
import { transactionLog, cards, users, devices } from "../../../src/db/schema";
import { pushEntitiesRoute } from "./push-entities";
import { logger } from "../lib/logger";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

export const syncRoutes = new Hono<{ Bindings: Env }>();

// Mount entity push route (provides /push-entities under /api/sync/)
syncRoutes.route("/", pushEntitiesRoute);

// ─── Types ───────────────────────────────────────────────────────────────────

interface PushTransaction {
  cardId: string;
  userId?: string | null;
  counter: number;
  type: "debit" | "credit" | "checkin" | "checkout" | "topup" | "admin";
  amount: number;
  balanceAfter: number;
  timestamp: number;
  hash: string;
  terminalId?: number | null;
  deviceId?: string | null;
  idempotencyKey: string;
}

interface SyncPushPayload {
  tenantId: string;
  transactions: PushTransaction[];
}

interface RejectedEntry {
  key: string;
  reason: string;
}

interface SyncPushResponse {
  accepted: number;
  rejected: RejectedEntry[];
  serverCursor: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

const VALID_TYPES = new Set(["debit", "credit", "checkin", "checkout", "topup", "admin"]);

// ─── Push helpers ─────────────────────────────────────────────────────────────

/**
 * Validate all fields and ranges on a push transaction.
 * Returns { valid: true } or { valid: false, reason }.
 */
function validateTransaction(tx: PushTransaction): { valid: boolean; reason?: string } {
  if (
    !tx.cardId ||
    tx.counter == null ||
    !tx.type ||
    tx.amount == null ||
    tx.balanceAfter == null ||
    tx.timestamp == null ||
    !tx.hash ||
    !tx.idempotencyKey
  ) {
    return { valid: false, reason: "malformed_event" };
  }
  if (!VALID_TYPES.has(tx.type)) {
    return { valid: false, reason: "invalid_type" };
  }
  if (tx.amount < 0 || tx.amount > 16000000) {
    return { valid: false, reason: "invalid_amount" };
  }
  if (tx.type === "topup" && tx.amount < 2000) {
    return { valid: false, reason: "topup_amount_below_minimum" };
  }
  if (tx.type === "topup" && tx.amount > 2000000) {
    return { valid: false, reason: "topup_amount_exceeds_limit" };
  }
  if (tx.type === "credit" && tx.amount < 2000) {
    return { valid: false, reason: "issuance_amount_below_minimum" };
  }
  if (tx.balanceAfter < 0 || tx.balanceAfter > 16000000) {
    return { valid: false, reason: "invalid_balance" };
  }
  if (tx.counter < 0 || tx.counter > 65535) {
    return { valid: false, reason: "invalid_counter" };
  }
  return { valid: true };
}

/**
 * Persist a single validated transaction to the DB.
 * Returns { accepted: true } on success/duplicate, or { accepted: false, reason } on rejection.
 */
async function processTransaction(
  db: ReturnType<typeof drizzle>,
  tenantId: string,
  tx: PushTransaction,
  now: number,
  auth: { deviceId?: string | null },
): Promise<{ accepted: boolean; reason?: string }> {
  try {
    // Check idempotency: skip duplicates silently
    const existing = await db
      .select({ id: transactionLog.id })
      .from(transactionLog)
      .where(eq(transactionLog.idempotencyKey, tx.idempotencyKey))
      .get();

    if (existing) {
      return { accepted: true };
    }

    // Check stale counter: get the server's known counter for this card
    const cardIdBlob = hexToBytes(tx.cardId);
    const cardRecord = await db
      .select({ counter: cards.counter })
      .from(cards)
      .where(and(eq(cards.tenantId, tenantId), eq(cards.cardId, cardIdBlob)))
      .get();

    if (cardRecord && tx.counter <= cardRecord.counter) {
      return { accepted: false, reason: "stale_counter" };
    }

    // Insert into transaction_log
    await db.insert(transactionLog).values({
      tenantId,
      cardId: tx.cardId,
      userId: tx.userId ?? null,
      counter: tx.counter,
      type: tx.type,
      amount: tx.amount,
      balanceAfter: tx.balanceAfter,
      timestamp: tx.timestamp,
      hash: tx.hash,
      terminalId: tx.terminalId ?? null,
      deviceId: tx.deviceId ?? auth.deviceId ?? null,
      idempotencyKey: tx.idempotencyKey,
      flagged: 0,
      createdAt: now,
    });

    // Update card balance/counter if this transaction has a higher counter
    await db.run(sql`
      UPDATE cards
      SET balance = ${tx.balanceAfter},
          counter = ${tx.counter},
          last_activity_at = ${tx.timestamp},
          updated_at = ${now}
      WHERE tenant_id = ${tenantId}
        AND card_id = ${cardIdBlob}
        AND counter < ${tx.counter}
    `);

    return { accepted: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || msg.includes("duplicate")) {
      return { accepted: true };
    }
    return { accepted: false, reason: "internal_error" };
  }
}

// ─── POST /push ──────────────────────────────────────────────────────────────

syncRoutes.post("/push", async (c) => {
  // 1. Authenticate: extract tenant_id from JWT token
  const auth = c.get("auth");
  if (!auth) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // 2. Parse request body
  const body = await c.req.json<SyncPushPayload>().catch(() => null);
  if (!body) {
    return c.json({ error: "malformed_payload" }, 400);
  }

  const { tenantId: payloadTenantId, transactions } = body;

  // 3. Use token's tenantId as authoritative source
  const tenantId = auth.tenantId;
  if (payloadTenantId && payloadTenantId !== tenantId) {
    logger.warn("sync/push: tenantId mismatch", { payloadTenantId, tokenTenantId: tenantId });
  }

  // 4. Validate transactions array
  if (!Array.isArray(transactions)) {
    return c.json({ error: "malformed_payload: transactions must be an array" }, 400);
  }

  if (transactions.length === 0) {
    return c.json({
      accepted: 0,
      rejected: [],
      serverCursor: String(Math.floor(Date.now() / 1000)),
    } satisfies SyncPushResponse);
  }

  // Enforce batch size limit (max 500 per request)
  if (transactions.length > 500) {
    return c.json({ error: "Batch size exceeds maximum of 500 transactions" }, 400);
  }

  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  let accepted = 0;
  const rejected: RejectedEntry[] = [];

  for (const tx of transactions) {
    // Validate required fields, type, and ranges
    const validation = validateTransaction(tx);
    if (!validation.valid) {
      rejected.push({
        key: tx.idempotencyKey ?? "unknown",
        reason: validation.reason ?? "malformed_event",
      });
      continue;
    }

    const result = await processTransaction(db, tenantId, tx, now, auth);
    if (result.accepted) {
      accepted++;
    } else {
      rejected.push({ key: tx.idempotencyKey, reason: result.reason ?? "internal_error" });
    }
  }

  // serverCursor: the current server timestamp as the cursor for the client
  const serverCursor = String(now);

  return c.json({
    accepted,
    rejected,
    serverCursor,
  } satisfies SyncPushResponse);
});

// ─── Types for Pull ──────────────────────────────────────────────────────────

interface PullEntityResponse<T> {
  data: T[];
  cursor: string;
  hasMore: boolean;
}

interface SyncPullResponse {
  members: PullEntityResponse<MemberPullEntry>;
  cards: PullEntityResponse<CardPullEntry>;
  transactions: PullEntityResponse<TransactionPullEntry>;
}

interface MemberPullEntry {
  tenantId: string;
  userId: string;
  name: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

interface CardPullEntry {
  tenantId: string;
  cardId: string;
  userId: string | null;
  status: string;
  balance: number;
  counter: number;
  keyVersion: number;
  createdAt: number;
  lastActivityAt: number | null;
  expiresAt: number | null;
  notes: string | null;
  updatedAt: number;
}

interface TransactionPullEntry {
  id: number;
  tenantId: string;
  cardId: string;
  userId: string | null;
  counter: number;
  type: string;
  amount: number;
  balanceAfter: number;
  timestamp: number;
  hash: string;
  terminalId: number | null;
  deviceId: string | null;
  idempotencyKey: string;
  flagged: number;
  createdAt: number;
}

// ─── Helpers for Pull ────────────────────────────────────────────────────────

const PULL_LIMIT = 500;

function bytesToHex(bytes: unknown): string {
  if (bytes instanceof ArrayBuffer) {
    bytes = new Uint8Array(bytes);
  }
  if (bytes instanceof Uint8Array) {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // If it's already a string (shouldn't happen but handle gracefully)
  return String(bytes);
}

function parseCursor(cursor: string | undefined | null): number {
  if (!cursor || cursor === "0" || cursor === "") {
    return 0;
  }
  const parsed = Number.parseInt(cursor, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// ─── GET /pull ───────────────────────────────────────────────────────────────

syncRoutes.get("/pull", async (c) => {
  // 1. Authenticate: extract tenant_id from JWT token
  const auth = c.get("auth");
  if (!auth) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // 2. Validate tenant isolation: token tenant_id must match query param tenantId
  const queryTenantId = c.req.query("tenantId");
  // Use token's tenantId as authoritative - fall back to query param for backward compat
  const tenantId = auth.tenantId;
  if (queryTenantId && queryTenantId !== tenantId) {
    // Log mismatch but don't block - client may have stale local ID
    logger.warn("sync/pull: tenantId mismatch", { queryTenantId, tokenTenantId: tenantId });
  }

  // 3. Parse cursor query params (default to "0" if empty)
  const membersCursor = parseCursor(c.req.query("membersCursor"));
  const cardsCursor = parseCursor(c.req.query("cardsCursor"));
  const txCursor = parseCursor(c.req.query("txCursor"));

  const db = drizzle(c.env.DB);

  // 4. Query members (users table) - updated_at is stored as unix timestamp (mode: "timestamp" means Date in Drizzle)
  // We need to compare against the raw integer column value
  const membersResult = await db
    .select({
      tenantId: users.tenantId,
      userId: users.userId,
      name: users.name,
      status: users.status,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), gt(users.updatedAt, new Date(membersCursor * 1000))))
    .orderBy(asc(users.updatedAt))
    .limit(PULL_LIMIT)
    .all();

  const membersHasMore = membersResult.length >= PULL_LIMIT;
  const membersData: MemberPullEntry[] = membersResult.map((m) => ({
    tenantId: m.tenantId,
    userId: m.userId,
    name: m.name,
    status: m.status,
    createdAt:
      m.createdAt instanceof Date ? Math.floor(m.createdAt.getTime() / 1000) : Number(m.createdAt),
    updatedAt:
      m.updatedAt instanceof Date ? Math.floor(m.updatedAt.getTime() / 1000) : Number(m.updatedAt),
  }));
  const newMembersCursor =
    membersData.length > 0 ? String(membersData.at(-1)!.updatedAt) : String(membersCursor);

  // 5. Query cards - updatedAt is raw integer (unix timestamp seconds)
  const cardsResult = await db
    .select({
      tenantId: cards.tenantId,
      cardId: cards.cardId,
      userId: cards.userId,
      status: cards.status,
      balance: cards.balance,
      counter: cards.counter,
      keyVersion: cards.keyVersion,
      createdAt: cards.createdAt,
      lastActivityAt: cards.lastActivityAt,
      expiresAt: cards.expiresAt,
      notes: cards.notes,
      updatedAt: cards.updatedAt,
    })
    .from(cards)
    .where(and(eq(cards.tenantId, tenantId), gt(cards.updatedAt, cardsCursor)))
    .orderBy(asc(cards.updatedAt))
    .limit(PULL_LIMIT)
    .all();

  const cardsHasMore = cardsResult.length >= PULL_LIMIT;
  const cardsData: CardPullEntry[] = cardsResult.map((card) => {
    const createdAtValue =
      card.createdAt instanceof Date
        ? Math.floor(card.createdAt.getTime() / 1000)
        : Number(card.createdAt);

    let lastActivityAtValue: number | null = null;
    if (card.lastActivityAt != null) {
      lastActivityAtValue =
        card.lastActivityAt instanceof Date
          ? Math.floor(card.lastActivityAt.getTime() / 1000)
          : Number(card.lastActivityAt);
    }

    let expiresAtValue: number | null = null;
    if (card.expiresAt != null) {
      expiresAtValue =
        card.expiresAt instanceof Date
          ? Math.floor(card.expiresAt.getTime() / 1000)
          : Number(card.expiresAt);
    }

    return {
      tenantId: card.tenantId,
      cardId: bytesToHex(card.cardId),
      userId: card.userId,
      status: card.status,
      balance: card.balance,
      counter: card.counter,
      keyVersion: card.keyVersion,
      createdAt: createdAtValue,
      lastActivityAt: lastActivityAtValue,
      expiresAt: expiresAtValue,
      notes: card.notes,
      updatedAt: Number(card.updatedAt),
    };
  });
  const newCardsCursor =
    cardsData.length > 0 ? String(cardsData.at(-1)!.updatedAt) : String(cardsCursor);

  // 6. Query transactions - createdAt is raw integer (unix timestamp seconds)
  const txResult = await db
    .select({
      id: transactionLog.id,
      tenantId: transactionLog.tenantId,
      cardId: transactionLog.cardId,
      userId: transactionLog.userId,
      counter: transactionLog.counter,
      type: transactionLog.type,
      amount: transactionLog.amount,
      balanceAfter: transactionLog.balanceAfter,
      timestamp: transactionLog.timestamp,
      hash: transactionLog.hash,
      terminalId: transactionLog.terminalId,
      deviceId: transactionLog.deviceId,
      idempotencyKey: transactionLog.idempotencyKey,
      flagged: transactionLog.flagged,
      createdAt: transactionLog.createdAt,
    })
    .from(transactionLog)
    .where(and(eq(transactionLog.tenantId, tenantId), gt(transactionLog.createdAt, txCursor)))
    .orderBy(asc(transactionLog.createdAt))
    .limit(PULL_LIMIT)
    .all();

  const txHasMore = txResult.length >= PULL_LIMIT;
  const txData: TransactionPullEntry[] = txResult.map((tx) => ({
    id: tx.id,
    tenantId: tx.tenantId,
    cardId: tx.cardId,
    userId: tx.userId,
    counter: tx.counter,
    type: tx.type,
    amount: tx.amount,
    balanceAfter: tx.balanceAfter,
    timestamp: tx.timestamp,
    hash: tx.hash,
    terminalId: tx.terminalId,
    deviceId: tx.deviceId,
    idempotencyKey: tx.idempotencyKey,
    flagged: tx.flagged,
    createdAt: tx.createdAt,
  }));
  const newTxCursor = txData.length > 0 ? String(txData.at(-1)!.createdAt) : String(txCursor);

  // 7. Return response
  const response: SyncPullResponse = {
    members: {
      data: membersData,
      cursor: newMembersCursor,
      hasMore: membersHasMore,
    },
    cards: {
      data: cardsData,
      cursor: newCardsCursor,
      hasMore: cardsHasMore,
    },
    transactions: {
      data: txData,
      cursor: newTxCursor,
      hasMore: txHasMore,
    },
  };

  return c.json(response);
});

// ─── GET /devices - List all devices for the authenticated tenant ────────────

syncRoutes.get("/devices", async (c) => {
  const auth = c.get("auth");
  if (!auth) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const { tenantId } = auth;

  try {
    const db = drizzle(c.env.DB);

    const [deviceList, memberCount, cardCount, txCount] = await Promise.all([
      db.select().from(devices).where(eq(devices.tenantId, tenantId)).all(),
      db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), sql`${users.status} != 'deleted'`))
        .get(),
      db
        .select({ count: sql<number>`count(*)` })
        .from(cards)
        .where(and(eq(cards.tenantId, tenantId), sql`${cards.status} != 'deleted'`))
        .get(),
      db
        .select({ count: sql<number>`count(*)` })
        .from(transactionLog)
        .where(eq(transactionLog.tenantId, tenantId))
        .get(),
    ]);

    return c.json({
      devices: deviceList,
      serverCounts: {
        members: memberCount?.count ?? 0,
        cards: cardCount?.count ?? 0,
        transactions: txCount?.count ?? 0,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("sync/devices: failed to fetch devices", { tenantId, error: msg });
    return c.json({ error: "Failed to fetch devices" }, 500);
  }
});
