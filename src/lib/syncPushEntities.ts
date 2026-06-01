/**
 * Client-side sync push logic for members and cards.
 *
 * Reads pending User and Card entries from IndexedDB (syncStatus === "pending"),
 * batches them, sends to POST /api/sync/push-entities, and marks them as "synced"
 * on success. Retries on network/5xx errors with exponential backoff.
 *
 * This complements syncPush.ts which handles transactions only.
 */

import { apiFetch, API_BASE_URL, DeviceBlockedError, getAccessToken } from "./api";
import { isDeviceBlocked } from "./deviceBlock";
import { localDb } from "#/db/local-db";
import type { User, Card } from "#/db/local-db";
import { addSyncLog } from "./syncLogStore";

// ── Constants ──────────────────────────────────────────────────────────

/** Maximum entries per push request */
export const MAX_BATCH_SIZE = 200;

/** Maximum retry attempts on network/5xx errors */
export const MAX_RETRY_ATTEMPTS = 3;

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

function toWireMember(m: User): PushMemberEntry {
  return {
    userId: m.userId,
    name: m.name,
    status: m.status,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function toWireCard(c: Card): PushCardEntry {
  return {
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
  };
}

function filterAccepted<T>(
  batch: T[],
  getId: (item: T) => string,
  rejectedIds: Set<string>,
): string[] {
  return batch.map(getId).filter((id) => !rejectedIds.has(id));
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

/**
 * Handle a successful (2xx) push response: log and return the parsed result.
 */
async function handlePushSuccess(response: Response): Promise<EntityPushResponse> {
  const result = (await response.json()) as EntityPushResponse;
  console.log(
    `[SyncPushEntities] ✓ Accepted: members=${result.membersAccepted}, cards=${result.cardsAccepted}`,
  );
  if (result.membersRejected.length > 0) {
    console.warn(`[SyncPushEntities] Rejected members:`, result.membersRejected);
  }
  if (result.cardsRejected.length > 0) {
    console.warn(`[SyncPushEntities] Rejected cards:`, result.cardsRejected);
  }
  return result;
}

/**
 * Handle a 4xx (non-429) push response: log, record sync log, and throw.
 */
async function handlePushClientError(response: Response, url: string): Promise<never> {
  const errorBody = await response.text().catch(() => "(could not read body)");
  const msg = `HTTP ${response.status}: ${errorBody}`;
  console.error(`[SyncPushEntities] ✗ Non-retryable: ${msg}`);
  addSyncLog(
    "error",
    `Entity push ditolak server (${response.status})`,
    `${url} | ${errorBody.slice(0, 200)}`,
  );
  throw new Error(msg);
}

/**
 * Handle a 429 rate-limited response: wait for Retry-After and continue.
 */
async function handlePushRateLimit(response: Response): Promise<void> {
  const retryAfter = Number.parseInt(response.headers.get("Retry-After") ?? "5", 10);
  console.warn(`[SyncPushEntities] Rate limited, retry after ${retryAfter}s`);
  await sleep(Math.min(retryAfter * 1000, 120_000));
}

/**
 * Handle a non-2xx push response. Returns the error to set as lastError,
 * or throws for non-retryable cases.
 */
async function handlePushNonOkResponse(
  response: Response,
  url: string,
  attempt: number,
): Promise<Error> {
  const errorBody = await response.text().catch(() => "(could not read body)");

  if (response.status >= 400 && response.status < 500 && response.status !== 429) {
    await handlePushClientError(response, url);
  }

  if (response.status === 429) {
    await handlePushRateLimit(response);
    return new Error(`HTTP 429: rate limited`);
  }

  // 5xx: retryable
  const err = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
  console.warn(`[SyncPushEntities] Server error (attempt ${attempt + 1}): ${err.message}`);
  return err;
}

/**
 * Build a human-readable error message from the last error encountered.
 */
function buildPushErrorMessage(lastError: unknown): string {
  if (lastError instanceof Error) {
    return `${lastError.name}: ${lastError.message}`;
  }
  if (lastError && typeof lastError === "object" && Object.keys(lastError).length === 0) {
    return "Network error (empty error object - likely CORS or DNS failure)";
  }
  return String(lastError);
}

async function pushEntitiesWithRetry(
  payload: EntityPushPayload,
  tenantId: string,
): Promise<EntityPushResponse> {
  let lastError: unknown;
  const url = `${API_BASE_URL}/api/sync/push-entities`;

  console.log(
    `[SyncPushEntities] POST ${url} | members=${payload.members.length}, cards=${payload.cards.length}`,
  );

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    if (isDeviceBlocked()) {
      throw new DeviceBlockedError("Device is blocked - entity push aborted");
    }

    try {
      const body = JSON.stringify(payload);
      console.log(
        `[SyncPushEntities] Attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}, payload size=${body.length} bytes`,
      );

      const response = await apiFetch(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        },
        tenantId,
      );

      console.log(`[SyncPushEntities] Response: ${response.status} ${response.statusText}`);

      if (response.ok) {
        return await handlePushSuccess(response);
      }

      lastError = await handlePushNonOkResponse(response, url, attempt);
    } catch (error: unknown) {
      if (error instanceof DeviceBlockedError) throw error;
      // If it's our own thrown error from 4xx, re-throw immediately
      if (error instanceof Error && error.message.startsWith("HTTP 4")) throw error;

      const errMsg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error(
        `[SyncPushEntities] ✗ Network/fetch error (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}): ${errMsg}`,
      );
      lastError = error;
    }

    if (attempt < MAX_RETRY_ATTEMPTS - 1) {
      const backoff = calculateBackoff(attempt);
      console.log(`[SyncPushEntities] Retrying in ${backoff}ms...`);
      await sleep(backoff);
    }
  }

  const errorMsg = buildPushErrorMessage(lastError);
  throw new Error(`Entity push failed after ${MAX_RETRY_ATTEMPTS} attempts: ${errorMsg}`);
}

// ── Batch push helpers ─────────────────────────────────────────────────

/**
 * Push one member batch (plus an optional card batch) to the server,
 * mark accepted entries as synced, and return partial result counts.
 */
async function pushMemberBatch(
  tenantId: string,
  memberBatch: User[],
  cardBatch: Card[],
): Promise<{
  membersAccepted: number;
  membersRejected: number;
  cardsAccepted: number;
  cardsRejected: number;
}> {
  const payload: EntityPushPayload = {
    tenantId,
    members: memberBatch.map(toWireMember),
    cards: cardBatch.map(toWireCard),
  };

  const response = await pushEntitiesWithRetry(payload, tenantId);

  const rejectedMemberIds = new Set(response.membersRejected.map((r) => r.userId));
  await markMembersSynced(
    tenantId,
    filterAccepted(memberBatch, (m) => m.userId, rejectedMemberIds),
  );

  const rejectedCardIds = new Set(response.cardsRejected.map((r) => r.cardId));
  await markCardsSynced(
    tenantId,
    filterAccepted(cardBatch, (c) => c.cardId, rejectedCardIds),
  );

  return {
    membersAccepted: response.membersAccepted,
    membersRejected: response.membersRejected.length,
    cardsAccepted: response.cardsAccepted,
    cardsRejected: response.cardsRejected.length,
  };
}

/**
 * Push one card-only batch to the server, mark accepted cards as synced,
 * and return partial result counts.
 */
async function pushCardBatch(
  tenantId: string,
  cardBatch: Card[],
): Promise<{ cardsAccepted: number; cardsRejected: number }> {
  const payload: EntityPushPayload = {
    tenantId,
    members: [],
    cards: cardBatch.map(toWireCard),
  };

  const response = await pushEntitiesWithRetry(payload, tenantId);

  const rejectedCardIds = new Set(response.cardsRejected.map((r) => r.cardId));
  await markCardsSynced(
    tenantId,
    filterAccepted(cardBatch, (c) => c.cardId, rejectedCardIds),
  );

  return {
    cardsAccepted: response.cardsAccepted,
    cardsRejected: response.cardsRejected.length,
  };
}

// ── Main Push Logic ────────────────────────────────────────────────────

/**
 * Push pending members and cards to the server for a tenant.
 * Called as part of the sync cycle before transaction push.
 */
export async function syncPushEntities(tenantId: string): Promise<EntityPushResult> {
  if (isDeviceBlocked()) {
    throw new DeviceBlockedError("Device is blocked - entity push aborted");
  }

  // Skip if no auth token - means this is a local-only tenant not registered on server
  const token = getAccessToken();
  if (!token) {
    console.log(`[SyncPushEntities] Skipped - no access token (local-only tenant)`);
    return { membersAccepted: 0, membersRejected: 0, cardsAccepted: 0, cardsRejected: 0 };
  }

  const [pendingMembers, pendingCards] = await Promise.all([
    getPendingMembers(tenantId),
    getPendingCards(tenantId),
  ]);

  console.log(
    `[SyncPushEntities] tenantId=${tenantId}, pendingMembers=${pendingMembers.length}, pendingCards=${pendingCards.length}`,
  );

  // Log sample data for debugging
  if (pendingMembers.length > 0) {
    console.log(`[SyncPushEntities] Sample member:`, JSON.stringify(pendingMembers[0]));
  }
  if (pendingCards.length > 0) {
    console.log(`[SyncPushEntities] Sample card:`, JSON.stringify(pendingCards[0]));
  }
  console.log(
    `[SyncPushEntities] API_BASE_URL="${API_BASE_URL}", full URL="${API_BASE_URL}/api/sync/push-entities"`,
  );

  // Nothing to push
  if (pendingMembers.length === 0 && pendingCards.length === 0) {
    return { membersAccepted: 0, membersRejected: 0, cardsAccepted: 0, cardsRejected: 0 };
  }

  try {
    return await _pushEntitiesInternal(tenantId, pendingMembers, pendingCards);
  } catch (err) {
    // Enrich error with pending entity counts for better diagnostics
    const baseMsg = err instanceof Error ? err.message : String(err);
    const enriched = new Error(
      `pendingMembers=${pendingMembers.length}, pendingCards=${pendingCards.length} | ${baseMsg}`,
    );
    enriched.name = "SyncPushEntitiesError";
    throw enriched;
  }
}

export interface MemberPushResult {
  membersAccepted: number;
  membersRejected: number;
}

export interface CardPushResult {
  cardsAccepted: number;
  cardsRejected: number;
}

async function _pushEntitiesInternal(
  tenantId: string,
  pendingMembers: User[],
  pendingCards: Card[],
): Promise<EntityPushResult> {
  const result: EntityPushResult = {
    membersAccepted: 0,
    membersRejected: 0,
    cardsAccepted: 0,
    cardsRejected: 0,
  };

  // Track how many cards have been included in member batches
  let cardsSentWithMembers = 0;

  // Batch members - include cards in the first batch (up to MAX_BATCH_SIZE)
  for (let i = 0; i < pendingMembers.length; i += MAX_BATCH_SIZE) {
    const memberBatch = pendingMembers.slice(i, i + MAX_BATCH_SIZE);
    const cardBatch = i === 0 ? pendingCards.slice(0, MAX_BATCH_SIZE) : [];
    if (i === 0) cardsSentWithMembers = cardBatch.length;

    const partial = await pushMemberBatch(tenantId, memberBatch, cardBatch);
    result.membersAccepted += partial.membersAccepted;
    result.membersRejected += partial.membersRejected;
    result.cardsAccepted += partial.cardsAccepted;
    result.cardsRejected += partial.cardsRejected;
  }

  // Push remaining cards that weren't included in member batches.
  const remainingCardsStart = cardsSentWithMembers;
  if (remainingCardsStart < pendingCards.length) {
    for (let i = remainingCardsStart; i < pendingCards.length; i += MAX_BATCH_SIZE) {
      const cardBatch = pendingCards.slice(i, i + MAX_BATCH_SIZE);
      const partial = await pushCardBatch(tenantId, cardBatch);
      result.cardsAccepted += partial.cardsAccepted;
      result.cardsRejected += partial.cardsRejected;
    }
  }

  return result;
}

// ── Granular Push Functions ────────────────────────────────────────────

/**
 * Push only pending members to the server for a tenant.
 * Used by the ordered sync orchestrator to push members before cards.
 * Respects device-blocked checks, access token checks, batch size limits, and retry logic.
 */
export async function syncPushMembers(tenantId: string): Promise<MemberPushResult> {
  if (isDeviceBlocked()) {
    throw new DeviceBlockedError("Device is blocked - member push aborted");
  }

  // Skip if no auth token - means this is a local-only tenant not registered on server
  const token = getAccessToken();
  if (!token) {
    console.log(`[SyncPushMembers] Skipped - no access token (local-only tenant)`);
    return { membersAccepted: 0, membersRejected: 0 };
  }

  const pendingMembers = await getPendingMembers(tenantId);

  console.log(`[SyncPushMembers] tenantId=${tenantId}, pendingMembers=${pendingMembers.length}`);

  // Nothing to push
  if (pendingMembers.length === 0) {
    return { membersAccepted: 0, membersRejected: 0 };
  }

  try {
    return await _pushMembersInternal(tenantId, pendingMembers);
  } catch (err) {
    const baseMsg = err instanceof Error ? err.message : String(err);
    const enriched = new Error(`pendingMembers=${pendingMembers.length} | ${baseMsg}`);
    enriched.name = "SyncPushMembersError";
    throw enriched;
  }
}

/**
 * Push only pending cards to the server for a tenant.
 * Used by the ordered sync orchestrator to push cards after members are confirmed.
 * Respects device-blocked checks, access token checks, batch size limits, and retry logic.
 */
export async function syncPushCards(tenantId: string): Promise<CardPushResult> {
  if (isDeviceBlocked()) {
    throw new DeviceBlockedError("Device is blocked - card push aborted");
  }

  // Skip if no auth token - means this is a local-only tenant not registered on server
  const token = getAccessToken();
  if (!token) {
    console.log(`[SyncPushCards] Skipped - no access token (local-only tenant)`);
    return { cardsAccepted: 0, cardsRejected: 0 };
  }

  const pendingCards = await getPendingCards(tenantId);

  console.log(`[SyncPushCards] tenantId=${tenantId}, pendingCards=${pendingCards.length}`);

  // Nothing to push
  if (pendingCards.length === 0) {
    return { cardsAccepted: 0, cardsRejected: 0 };
  }

  try {
    return await _pushCardsInternal(tenantId, pendingCards);
  } catch (err) {
    const baseMsg = err instanceof Error ? err.message : String(err);
    const enriched = new Error(`pendingCards=${pendingCards.length} | ${baseMsg}`);
    enriched.name = "SyncPushCardsError";
    throw enriched;
  }
}

// ── Internal push helpers for granular functions ───────────────────────

async function _pushMembersInternal(
  tenantId: string,
  pendingMembers: User[],
): Promise<MemberPushResult> {
  const result: MemberPushResult = {
    membersAccepted: 0,
    membersRejected: 0,
  };

  for (let i = 0; i < pendingMembers.length; i += MAX_BATCH_SIZE) {
    const memberBatch = pendingMembers.slice(i, i + MAX_BATCH_SIZE);

    const payload: EntityPushPayload = {
      tenantId,
      members: memberBatch.map(toWireMember),
      cards: [],
    };

    const response = await pushEntitiesWithRetry(payload, tenantId);

    result.membersAccepted += response.membersAccepted;
    result.membersRejected += response.membersRejected.length;

    // Mark accepted members as synced
    const rejectedMemberIds = new Set(response.membersRejected.map((r) => r.userId));
    await markMembersSynced(
      tenantId,
      filterAccepted(memberBatch, (m) => m.userId, rejectedMemberIds),
    );
  }

  return result;
}

async function _pushCardsInternal(tenantId: string, pendingCards: Card[]): Promise<CardPushResult> {
  const result: CardPushResult = {
    cardsAccepted: 0,
    cardsRejected: 0,
  };

  for (let i = 0; i < pendingCards.length; i += MAX_BATCH_SIZE) {
    const cardBatch = pendingCards.slice(i, i + MAX_BATCH_SIZE);

    const payload: EntityPushPayload = {
      tenantId,
      members: [],
      cards: cardBatch.map(toWireCard),
    };

    const response = await pushEntitiesWithRetry(payload, tenantId);

    result.cardsAccepted += response.cardsAccepted;
    result.cardsRejected += response.cardsRejected.length;

    // Mark accepted cards as synced
    const rejectedCardIds = new Set(response.cardsRejected.map((r) => r.cardId));
    await markCardsSynced(
      tenantId,
      filterAccepted(cardBatch, (c) => c.cardId, rejectedCardIds),
    );
  }

  return result;
}
