import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, gt, asc, sql } from "drizzle-orm";
import { transactionLog, cards, users, devices } from "../../../src/db/schema";
import { syncSseRoutes } from "./sync-sse";
import { pushEntitiesRoute } from "./push-entities";
import { logger } from "../lib/logger";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

export const syncRoutes = new Hono<{ Bindings: Env }>();

// Mount SSE sub-routes (provides /sse and /broadcast under /api/sync/)
syncRoutes.route("/", syncSseRoutes);

// Mount entity push route (provides /push-entities under /api/sync/)
syncRoutes.route("/", pushEntitiesRoute);

// ─── Token Payload Extraction ────────────────────────────────────────────────

interface TokenPayload {
  tenantId: string;
  accountId: string;
  deviceId?: string;
}

function extractTokenPayload(request: Request): TokenPayload | null {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.tenantId || !payload.accountId) return null;
    return {
      tenantId: payload.tenantId,
      accountId: payload.accountId,
      deviceId: payload.deviceId ?? undefined,
    };
  } catch {
    return null;
  }
}

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
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

const VALID_TYPES = new Set(["debit", "credit", "checkin", "checkout", "topup", "admin"]);

// ─── POST /push ──────────────────────────────────────────────────────────────

syncRoutes.post("/push", async (c) => {
  // 1. Authenticate: extract tenant_id from JWT token
  const tokenPayload = extractTokenPayload(c.req.raw);
  if (!tokenPayload) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // 2. Parse request body
  const body = await c.req.json<SyncPushPayload>().catch(() => null);
  if (!body) {
    return c.json({ error: "malformed_payload" }, 400);
  }

  const { tenantId: payloadTenantId, transactions } = body;

  // 3. Use token's tenantId as authoritative source
  const tenantId = tokenPayload.tenantId;
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
    // Validate required fields
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
      rejected.push({ key: tx.idempotencyKey ?? "unknown", reason: "malformed_event" });
      continue;
    }

    // Validate type
    if (!VALID_TYPES.has(tx.type)) {
      rejected.push({ key: tx.idempotencyKey, reason: "invalid_type" });
      continue;
    }

    // Validate amount and balance ranges
    if (tx.amount < 0 || tx.amount > 16000000) {
      rejected.push({ key: tx.idempotencyKey, reason: "invalid_amount" });
      continue;
    }
    if (tx.balanceAfter < 0 || tx.balanceAfter > 16000000) {
      rejected.push({ key: tx.idempotencyKey, reason: "invalid_balance" });
      continue;
    }

    // Validate counter range
    if (tx.counter < 0 || tx.counter > 65535) {
      rejected.push({ key: tx.idempotencyKey, reason: "invalid_counter" });
      continue;
    }

    try {
      // Check idempotency: skip duplicates silently
      const existing = await db
        .select({ id: transactionLog.id })
        .from(transactionLog)
        .where(eq(transactionLog.idempotencyKey, tx.idempotencyKey))
        .get();

      if (existing) {
        // Duplicate idempotency key — skip silently (counts as accepted per spec)
        accepted++;
        continue;
      }

      // Check stale counter: get the server's known counter for this card
      const cardIdBlob = hexToBytes(tx.cardId);
      const cardRecord = await db
        .select({ counter: cards.counter })
        .from(cards)
        .where(and(eq(cards.tenantId, tenantId), eq(cards.cardId, cardIdBlob)))
        .get();

      // If card exists and counter is stale, reject
      if (cardRecord && tx.counter <= cardRecord.counter) {
        rejected.push({ key: tx.idempotencyKey, reason: "stale_counter" });
        continue;
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
        deviceId: tx.deviceId ?? tokenPayload.deviceId ?? null,
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

      accepted++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Handle UNIQUE constraint violations (idempotency_key or tenant_card_counter)
      if (msg.includes("UNIQUE") || msg.includes("duplicate")) {
        // Idempotency key collision or tenant+card+counter collision — skip silently
        accepted++;
      } else {
        rejected.push({ key: tx.idempotencyKey, reason: "internal_error" });
      }
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

function bytesToHex(bytes: Uint8Array | ArrayBuffer | unknown): string {
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
  const parsed = parseInt(cursor, 10);
  return isNaN(parsed) ? 0 : parsed;
}

// ─── GET /pull ───────────────────────────────────────────────────────────────

syncRoutes.get("/pull", async (c) => {
  // 1. Authenticate: extract tenant_id from JWT token
  const tokenPayload = extractTokenPayload(c.req.raw);
  if (!tokenPayload) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // 2. Validate tenant isolation: token tenant_id must match query param tenantId
  const queryTenantId = c.req.query("tenantId");
  // Use token's tenantId as authoritative — fall back to query param for backward compat
  const tenantId = tokenPayload.tenantId;
  if (queryTenantId && queryTenantId !== tenantId) {
    // Log mismatch but don't block — client may have stale local ID
    logger.warn("sync/pull: tenantId mismatch", { queryTenantId, tokenTenantId: tenantId });
  }

  // 3. Parse cursor query params (default to "0" if empty)
  const membersCursor = parseCursor(c.req.query("membersCursor"));
  const cardsCursor = parseCursor(c.req.query("cardsCursor"));
  const txCursor = parseCursor(c.req.query("txCursor"));

  const db = drizzle(c.env.DB);

  // 4. Query members (users table) — updated_at is stored as unix timestamp (mode: "timestamp" means Date in Drizzle)
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
    membersData.length > 0
      ? String(membersData[membersData.length - 1].updatedAt)
      : String(membersCursor);

  // 5. Query cards — updatedAt is raw integer (unix timestamp seconds)
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
  const cardsData: CardPullEntry[] = cardsResult.map((card) => ({
    tenantId: card.tenantId,
    cardId: bytesToHex(card.cardId),
    userId: card.userId,
    status: card.status,
    balance: card.balance,
    counter: card.counter,
    keyVersion: card.keyVersion,
    createdAt:
      card.createdAt instanceof Date
        ? Math.floor(card.createdAt.getTime() / 1000)
        : Number(card.createdAt),
    lastActivityAt:
      card.lastActivityAt instanceof Date
        ? Math.floor(card.lastActivityAt.getTime() / 1000)
        : card.lastActivityAt != null
          ? Number(card.lastActivityAt)
          : null,
    expiresAt:
      card.expiresAt instanceof Date
        ? Math.floor(card.expiresAt.getTime() / 1000)
        : card.expiresAt != null
          ? Number(card.expiresAt)
          : null,
    notes: card.notes,
    updatedAt: Number(card.updatedAt),
  }));
  const newCardsCursor =
    cardsData.length > 0 ? String(cardsData[cardsData.length - 1].updatedAt) : String(cardsCursor);

  // 6. Query transactions — createdAt is raw integer (unix timestamp seconds)
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
  const newTxCursor =
    txData.length > 0 ? String(txData[txData.length - 1].createdAt) : String(txCursor);

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

// ─── GET /devices — List all devices for the authenticated tenant ────────────

syncRoutes.get("/devices", async (c) => {
  const tokenPayload = extractTokenPayload(c.req.raw);
  if (!tokenPayload) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const { tenantId } = tokenPayload;

  try {
    const db = drizzle(c.env.DB);
    const deviceList = await db.select().from(devices).where(eq(devices.tenantId, tenantId)).all();

    return c.json({ devices: deviceList });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("sync/devices: failed to fetch devices", { tenantId, error: msg });
    return c.json({ error: "Failed to fetch devices" }, 500);
  }
});
