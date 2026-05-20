/**
 * Client-side sync push logic for members and cards.
 *
 * Reads pending User and Card entries from IndexedDB (syncStatus === "pending"),
 * batches them, sends to POST /api/sync/push-entities, and marks them as "synced"
 * on success. Retries on network/5xx errors with exponential backoff.
 *
 * This complements syncPush.ts which handles transactions only.
 */

import { apiFetch, API_BASE_URL, DeviceBlockedError } from "./api";
import { isDeviceBlocked } from "./deviceBlock";
import { localDb } from "../db/local-db";
import type { User, Card } from "../db/local-db";

// ── Constants ──────────────────────────────────────────────────────────

/** Maximum entries per push request */
export const MAX_BATCH_SIZE = 200;

/** Maximum retry attempts on network/5xx errors */
export const MAX_RETRY_ATTEMPTS = 5;

/** Initial backoff delay in milliseconds */
export const INITIAL_BACKOFF_MS = 1000;

/** Maximum backoff delay in milliseconds */
export const MAX_BACKOFF_MS = 60_000;

// ── Types ──────────────────────────────────────────────────────────────

export interface EntityPushResult {
  membersAccepted: number;
  membersRejected: number;
  cardsAccepted: number;
  cardsRejected: number;
}

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

interface EntityPushResponse {
  membersAccepted: number;
  membersRejected: { userId: string; reason: string }[];
  cardsAccepted: number;
  cardsRejected: { cardId: string; reason: string }[];
}

// ── Helpers ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoff(attempt: number): number {
  const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_BACKOFF_MS);
}

// ── Query pending entities ─────────────────────────────────────────────

/**
 * Get all users with syncStatus "pending" for a tenant.
 * Also catches users without syncStatus (pre-migration) and marks them pending.
 */
export async function getPendingMembers(tenantId: string): Promise<User[]> {
  // First, fix any members that don't have syncStatus set (pre-v4 migration edge case)
  const allMembers = await localDb.users.where("tenantId").equals(tenantId).toArray();
  const unmarked = allMembers.filter((m) => !m.syncStatus);
  if (unmarked.length > 0) {
    for (const m of unmarked) {
      await localDb.users.update([m.tenantId, m.userId], { syncStatus: "pending" });
    }
  }

  return localDb.users.where("[tenantId+syncStatus]").equals([tenantId, "pending"]).toArray();
}

/**
 * Get all cards with syncStatus "pending" for a tenant.
 * Also catches cards without syncStatus (pre-migration) and marks them pending.
 */
export async function getPendingCards(tenantId: string): Promise<Card[]> {
  // First, fix any cards that don't have syncStatus set (pre-v4 migration edge case)
  const allCards = await localDb.cards.where("tenantId").equals(tenantId).toArray();
  const unmarked = allCards.filter((c) => !c.syncStatus);
  if (unmarked.length > 0) {
    for (const c of unmarked) {
      await localDb.cards.update([c.tenantId, c.cardId], { syncStatus: "pending" });
    }
  }

  return localDb.cards.where("[tenantId+syncStatus]").equals([tenantId, "pending"]).toArray();
}

/**
 * Get total count of pending entities (members + cards) for a tenant.
 */
export async function getPendingEntityCount(tenantId: string): Promise<number> {
  const [members, cards] = await Promise.all([
    getPendingMembers(tenantId),
    getPendingCards(tenantId),
  ]);
  return members.length + cards.length;
}

// ── Mark entities as synced ────────────────────────────────────────────

async function markMembersSynced(tenantId: string, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    await localDb.users.update([tenantId, userId], { syncStatus: "synced" });
  }
}

async function markCardsSynced(tenantId: string, cardIds: string[]): Promise<void> {
  for (const cardId of cardIds) {
    await localDb.cards.update([tenantId, cardId], { syncStatus: "synced" });
  }
}

// ── Push with retry ────────────────────────────────────────────────────

async function pushEntitiesWithRetry(
  payload: EntityPushPayload,
  tenantId: string,
): Promise<EntityPushResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    if (isDeviceBlocked()) {
      throw new DeviceBlockedError("Device is blocked — entity push aborted");
    }

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/sync/push-entities`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        tenantId,
      );

      console.log(`[SyncPushEntities] Server response status: ${response.status}`);

      if (response.ok) {
        const result = (await response.json()) as EntityPushResponse;
        console.log(
          `[SyncPushEntities] Accepted: members=${result.membersAccepted}, cards=${result.cardsAccepted}`,
        );
        return result;
      }

      // 4xx (except 429): not retryable
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const errorBody = await response.text().catch(() => "");
        console.warn(`[SyncPushEntities] Non-retryable error ${response.status}: ${errorBody}`);
        // Return empty response — entities stay pending for next attempt
        return {
          membersAccepted: 0,
          membersRejected: [],
          cardsAccepted: 0,
          cardsRejected: [],
        };
      }

      // 429: rate limited
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") ?? "5", 10);
        await sleep(Math.min(retryAfter * 1000, 120_000));
        continue;
      }

      // 5xx: retryable
      lastError = new Error(`Server error: ${response.status}`);
    } catch (error: unknown) {
      if (error instanceof DeviceBlockedError) throw error;
      lastError = error;
    }

    if (attempt < MAX_RETRY_ATTEMPTS - 1) {
      await sleep(calculateBackoff(attempt));
    }
  }

  throw new Error(`Entity push failed after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError}`);
}

// ── Main Push Logic ────────────────────────────────────────────────────

/**
 * Push pending members and cards to the server for a tenant.
 * Called as part of the sync cycle before transaction push.
 */
export async function syncPushEntities(tenantId: string): Promise<EntityPushResult> {
  if (isDeviceBlocked()) {
    throw new DeviceBlockedError("Device is blocked — entity push aborted");
  }

  const [pendingMembers, pendingCards] = await Promise.all([
    getPendingMembers(tenantId),
    getPendingCards(tenantId),
  ]);

  console.log(
    `[SyncPushEntities] tenantId=${tenantId}, pendingMembers=${pendingMembers.length}, pendingCards=${pendingCards.length}`,
  );

  // Nothing to push
  if (pendingMembers.length === 0 && pendingCards.length === 0) {
    return { membersAccepted: 0, membersRejected: 0, cardsAccepted: 0, cardsRejected: 0 };
  }

  const result: EntityPushResult = {
    membersAccepted: 0,
    membersRejected: 0,
    cardsAccepted: 0,
    cardsRejected: 0,
  };

  // Batch members
  for (let i = 0; i < pendingMembers.length; i += MAX_BATCH_SIZE) {
    const memberBatch = pendingMembers.slice(i, i + MAX_BATCH_SIZE);
    const cardBatch = i === 0 ? pendingCards.slice(0, MAX_BATCH_SIZE) : [];

    const payload: EntityPushPayload = {
      tenantId,
      members: memberBatch.map((m) => ({
        userId: m.userId,
        name: m.name,
        status: m.status,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
      cards: cardBatch.map((c) => ({
        cardId: c.cardId,
        userId: c.userId,
        status: c.status,
        balance: c.balance,
        counter: c.counter,
        keyVersion: c.keyVersion,
        createdAt: c.createdAt,
        lastActivityAt: c.lastActivityAt,
        expiresAt: c.expiresAt,
        notes: c.notes,
      })),
    };

    const response = await pushEntitiesWithRetry(payload, tenantId);

    result.membersAccepted += response.membersAccepted;
    result.membersRejected += response.membersRejected.length;
    result.cardsAccepted += response.cardsAccepted;
    result.cardsRejected += response.cardsRejected.length;

    // Mark accepted members as synced
    const rejectedMemberIds = new Set(response.membersRejected.map((r) => r.userId));
    const acceptedMemberIds = memberBatch
      .map((m) => m.userId)
      .filter((id) => !rejectedMemberIds.has(id));
    await markMembersSynced(tenantId, acceptedMemberIds);

    // Mark accepted cards as synced
    const rejectedCardIds = new Set(response.cardsRejected.map((r) => r.cardId));
    const acceptedCardIds = cardBatch.map((c) => c.cardId).filter((id) => !rejectedCardIds.has(id));
    await markCardsSynced(tenantId, acceptedCardIds);
  }

  // Handle remaining card batches if there are more cards than fit in the first batch
  if (pendingCards.length > MAX_BATCH_SIZE) {
    for (let i = MAX_BATCH_SIZE; i < pendingCards.length; i += MAX_BATCH_SIZE) {
      const cardBatch = pendingCards.slice(i, i + MAX_BATCH_SIZE);

      const payload: EntityPushPayload = {
        tenantId,
        members: [],
        cards: cardBatch.map((c) => ({
          cardId: c.cardId,
          userId: c.userId,
          status: c.status,
          balance: c.balance,
          counter: c.counter,
          keyVersion: c.keyVersion,
          createdAt: c.createdAt,
          lastActivityAt: c.lastActivityAt,
          expiresAt: c.expiresAt,
          notes: c.notes,
        })),
      };

      const response = await pushEntitiesWithRetry(payload, tenantId);

      result.cardsAccepted += response.cardsAccepted;
      result.cardsRejected += response.cardsRejected.length;

      const rejectedCardIds = new Set(response.cardsRejected.map((r) => r.cardId));
      const acceptedCardIds = cardBatch
        .map((c) => c.cardId)
        .filter((id) => !rejectedCardIds.has(id));
      await markCardsSynced(tenantId, acceptedCardIds);
    }
  }

  return result;
}
