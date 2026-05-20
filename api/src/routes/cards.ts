import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { cards, cardEvents } from "../../../src/db/schema";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

export const cardsRoutes = new Hono<{ Bindings: Env }>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HEX_REGEX = /^[0-9a-f]+$/;

function isValidHexUid(uid: string): boolean {
  if (!uid || uid.length < 8 || uid.length > 14) return false;
  return HEX_REGEX.test(uid);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

interface TokenPayload {
  tenantId: string;
  accountId: string;
  role: string;
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
      role: payload.role ?? "",
      deviceId: payload.deviceId ?? undefined,
    };
  } catch {
    return null;
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_BLOCK_REASONS = [
  "blocked_admin",
  "blocked_tamper",
  "blocked_fraud",
  "blocked_expired",
] as const;

type BlockReason = (typeof VALID_BLOCK_REASONS)[number];

// ─── GET /check-uid ──────────────────────────────────────────────────────────

cardsRoutes.get("/check-uid", async (c) => {
  const uid = c.req.query("uid");

  if (!uid) {
    return c.json({ error: "uid query parameter is required" }, 400);
  }

  // Normalize: lowercase, strip any non-hex characters
  const normalizedUid = uid.toLowerCase().replace(/[^0-9a-f]/g, "");

  // Validate: must be valid hex and between 8-14 characters
  if (!isValidHexUid(normalizedUid)) {
    return c.json({ error: "Invalid UID format: must be 8-14 hex characters" }, 400);
  }

  const db = drizzle(c.env.DB);

  // Query cards table for UID existence across all tenants
  // cardId is stored as a blob, so convert hex to bytes for comparison
  const cardIdBlob = hexToBytes(normalizedUid);

  const existingCard = await db
    .select({ tenantId: cards.tenantId })
    .from(cards)
    .where(eq(cards.cardId, cardIdBlob))
    .get();

  if (existingCard) {
    return c.json({ exists: true, tenantId: existingCard.tenantId });
  }

  return c.json({ exists: false });
});

// ─── POST /:cardId/block ─────────────────────────────────────────────────────

cardsRoutes.post("/:cardId/block", async (c) => {
  // 1. Authenticate
  const tokenPayload = extractTokenPayload(c.req.raw);
  if (!tokenPayload) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const cardId = c.req.param("cardId");
  if (!cardId) {
    return c.json({ error: "cardId is required" }, 400);
  }

  // 2. Parse and validate request body
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: "Request body is required" }, 400);
  }

  const { reason, changedBy } = body as { reason?: string; changedBy?: string };

  if (!reason || typeof reason !== "string") {
    return c.json({ error: "reason is required" }, 400);
  }

  if (!changedBy || typeof changedBy !== "string") {
    return c.json({ error: "changedBy is required" }, 400);
  }

  if (!VALID_BLOCK_REASONS.includes(reason as BlockReason)) {
    return c.json(
      {
        error: `Invalid reason. Must be one of: ${VALID_BLOCK_REASONS.join(", ")}`,
      },
      400,
    );
  }

  const tenantId = tokenPayload.tenantId;
  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  // 3. Verify card exists for this tenant
  const cardIdBlob = hexToBytes(cardId);
  const existingCard = await db
    .select({ tenantId: cards.tenantId, status: cards.status })
    .from(cards)
    .where(and(eq(cards.tenantId, tenantId), eq(cards.cardId, cardIdBlob)))
    .get();

  if (!existingCard) {
    return c.json({ error: "Card not found" }, 404);
  }

  // 4. Map reason to the DB status enum value
  const statusMap: Record<BlockReason, string> = {
    blocked_admin: "BLOCKED_ADMIN",
    blocked_tamper: "BLOCKED_TAMPER",
    blocked_fraud: "BLOCKED_FRAUD",
    blocked_expired: "BLOCKED_EXPIRED",
  };

  const newStatus = statusMap[reason as BlockReason];

  // 5. Update card status and insert event in a transaction
  await db.transaction(async (tx) => {
    // Update card status
    await tx
      .update(cards)
      .set({
        status: newStatus as typeof existingCard.status,
        updatedAt: now,
        notes: `Blocked by ${changedBy}: ${reason}`,
      })
      .where(and(eq(cards.tenantId, tenantId), eq(cards.cardId, cardIdBlob)));

    // Insert card_status_change event for SSE broadcast
    const eventPayload = JSON.stringify({
      type: "card_status_change",
      cardId,
      tenantId,
      newStatus: reason,
      changedBy,
      timestamp: now,
    });

    await tx.insert(cardEvents).values({
      tenantId,
      cardId,
      eventType: "card_status_change",
      payload: eventPayload,
      sourceDeviceId: tokenPayload.deviceId ?? null,
      createdAt: now,
    });
  });

  // 6. Return success
  return c.json({
    success: true,
    cardId,
    status: reason,
    changedBy,
    timestamp: now,
  });
});
