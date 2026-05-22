/**
 * Server-side endpoint for receiving pushed members and cards from clients.
 *
 * POST /push-entities — accepts batches of members and cards, upserts them
 * into the D1 database with tenant isolation enforced via JWT token.
 */

import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, sql } from "drizzle-orm";
import { users, cards } from "../../../src/db/schema";
import { logger } from "../lib/logger";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

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

interface PushMemberEntry {
  userId: string;
  name: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

interface PushCardEntry {
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
}

interface EntityPushPayload {
  tenantId: string;
  members: PushMemberEntry[];
  cards: PushCardEntry[];
}

interface MemberRejection {
  userId: string;
  reason: string;
}

interface CardRejection {
  cardId: string;
  reason: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

const VALID_MEMBER_STATUSES = new Set(["active", "suspended", "closed", "deleted"]);
const VALID_CARD_STATUSES = new Set([
  "active",
  "ACTIVE",
  "BLOCKED_TAMPER",
  "BLOCKED_FRAUD",
  "BLOCKED_EXPIRED",
  "BLOCKED_ADMIN",
  "blocked_tamper",
  "blocked_fraud",
  "blocked_expired",
  "blocked_admin",
  "deleted",
]);

// ─── Route ───────────────────────────────────────────────────────────────────

// ─── Per-entity processors ────────────────────────────────────────────────────

async function processMember(
  db: ReturnType<typeof drizzle>,
  tenantId: string,
  member: PushMemberEntry,
): Promise<{ accepted: boolean; rejection?: MemberRejection }> {
  if (!member.name || !member.userId) {
    return { accepted: false, rejection: { userId: member.userId ?? "", reason: "malformed_entry" } };
  }

  if (member.status && !VALID_MEMBER_STATUSES.has(member.status)) {
    return { accepted: false, rejection: { userId: member.userId, reason: "invalid_status" } };
  }

  try {
    const existing = await db
      .select({ updatedAt: users.updatedAt })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.userId, member.userId)))
      .get();

    if (existing) {
      const existingUpdatedAt =
        existing.updatedAt instanceof Date
          ? Math.floor(existing.updatedAt.getTime() / 1000)
          : Number(existing.updatedAt);

      if (member.updatedAt > existingUpdatedAt) {
        await db
          .update(users)
          .set({
            name: member.name,
            status: (member.status as "active" | "suspended" | "closed") ?? "active",
            updatedAt: new Date(member.updatedAt * 1000),
          })
          .where(and(eq(users.tenantId, tenantId), eq(users.userId, member.userId)));
      }
    } else {
      await db.insert(users).values({
        tenantId,
        userId: member.userId,
        name: member.name,
        status: (member.status as "active" | "suspended" | "closed") ?? "active",
        createdAt: new Date(member.createdAt * 1000),
        updatedAt: new Date(member.updatedAt * 1000),
      });
    }
    return { accepted: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || msg.includes("duplicate")) {
      return { accepted: true }; // Race condition — treat as accepted
    }
    logger.error("push-entities: member insert failed", {
      userId: member.userId,
      error: msg,
      tenantId,
    });
    return { accepted: false, rejection: { userId: member.userId, reason: `internal_error: ${msg}` } };
  }
}

async function processCard(
  db: ReturnType<typeof drizzle>,
  tenantId: string,
  card: PushCardEntry,
  now: number,
): Promise<{ accepted: boolean; rejection?: CardRejection }> {
  if (!card.cardId) {
    return { accepted: false, rejection: { cardId: card.cardId ?? "unknown", reason: "malformed_entry" } };
  }

  if (card.status && !VALID_CARD_STATUSES.has(card.status)) {
    return { accepted: false, rejection: { cardId: card.cardId, reason: "invalid_status" } };
  }

  try {
    const cardIdBlob = hexToBytes(card.cardId);

    const existing = await db
      .select({ counter: cards.counter, updatedAt: cards.updatedAt })
      .from(cards)
      .where(and(eq(cards.tenantId, tenantId), eq(cards.cardId, cardIdBlob)))
      .get();

    if (existing) {
      const existingUpdatedAt = Number(existing.updatedAt);
      const incomingUpdatedAt = card.createdAt;

      if (card.counter >= existing.counter || incomingUpdatedAt > existingUpdatedAt) {
        await db.run(sql`
          UPDATE cards
          SET user_id = ${card.userId},
              status = ${card.status ?? "active"},
              balance = ${card.balance},
              counter = CASE WHEN ${card.counter} > counter THEN ${card.counter} ELSE counter END,
              key_version = ${card.keyVersion},
              last_activity_at = ${card.lastActivityAt},
              expires_at = ${card.expiresAt},
              notes = ${card.notes},
              updated_at = ${now}
          WHERE tenant_id = ${tenantId}
            AND card_id = ${cardIdBlob}
        `);
      }
    } else {
      await db.run(sql`
        INSERT INTO cards (tenant_id, card_id, user_id, status, balance, counter, key_version, created_at, last_activity_at, expires_at, notes, updated_at)
        VALUES (${tenantId}, ${cardIdBlob}, ${card.userId}, ${card.status ?? "active"}, ${card.balance}, ${card.counter}, ${card.keyVersion}, ${card.createdAt}, ${card.lastActivityAt}, ${card.expiresAt}, ${card.notes}, ${now})
      `);
    }
    return { accepted: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || msg.includes("duplicate")) {
      return { accepted: true };
    }
    logger.error("push-entities: card insert failed", {
      cardId: card.cardId,
      error: msg,
      tenantId,
    });
    return { accepted: false, rejection: { cardId: card.cardId, reason: `internal_error: ${msg}` } };
  }
}

export const pushEntitiesRoute = new Hono<{ Bindings: Env }>();

pushEntitiesRoute.post("/push-entities", async (c) => {
  // 1. Authenticate
  const tokenPayload = extractTokenPayload(c.req.raw);
  if (!tokenPayload) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // 2. Parse body
  const body = await c.req.json<EntityPushPayload>().catch(() => null);
  if (!body) {
    return c.json({ error: "malformed_payload" }, 400);
  }

  // 3. Use token's tenantId as authoritative
  const tenantId = tokenPayload.tenantId;
  if (body.tenantId && body.tenantId !== tenantId) {
    logger.warn("push-entities: tenantId mismatch", {
      bodyTenantId: body.tenantId,
      tokenTenantId: tenantId,
    });
  }
  const members = body.members ?? [];
  const cardEntries = body.cards ?? [];

  logger.info("push-entities: processing batch", {
    tenantId,
    deviceId: tokenPayload.deviceId,
    membersCount: members.length,
    cardsCount: cardEntries.length,
  });

  // Enforce batch limits
  if (members.length > 200) {
    return c.json({ error: "Members batch exceeds maximum of 200" }, 400);
  }
  if (cardEntries.length > 200) {
    return c.json({ error: "Cards batch exceeds maximum of 200" }, 400);
  }

  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  let membersAccepted = 0;
  const membersRejected: MemberRejection[] = [];

  let cardsAccepted = 0;
  const cardsRejected: CardRejection[] = [];

  // 4. Process members — upsert (insert or update if newer)
  for (const member of members) {
    const result = await processMember(db, tenantId, member);
    if (result.accepted) {
      membersAccepted++;
    } else if (result.rejection) {
      membersRejected.push(result.rejection);
    }
  }

  // 5. Process cards — upsert (insert or update based on counter/updatedAt)
  for (const card of cardEntries) {
    const result = await processCard(db, tenantId, card, now);
    if (result.accepted) {
      cardsAccepted++;
    } else if (result.rejection) {
      cardsRejected.push(result.rejection);
    }
  }

  logger.info("push-entities: completed", {
    tenantId,
    deviceId: tokenPayload.deviceId,
    membersAccepted,
    membersRejected: membersRejected.length,
    cardsAccepted,
    cardsRejected: cardsRejected.length,
  });

  return c.json({
    membersAccepted,
    membersRejected,
    cardsAccepted,
    cardsRejected,
  });
});
