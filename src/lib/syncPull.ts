/**
 * Client-side sync pull logic.
 *
 * Reads current sync cursors from IndexedDB, calls GET /api/sync/pull,
 * paginates until all entity types are complete, merges server data into
 * IndexedDB via upsert in a single Dexie transaction (skipping entities
 * with pending Outbox entries), and updates local sync cursors on success.
 *
 * Handles 401 (abort + re-auth), 5xx (retry with exponential backoff, max 5 attempts).
 * Checks isDeviceBlocked() before each request and aborts if blocked.
 *
 * @see Requirements 7.1, 7.4, 7.5, 7.6, 7.9, 7.10
 */

import { apiFetch, API_BASE_URL, DeviceBlockedError, getAccessToken } from "./api";
import { isDeviceBlocked } from "./deviceBlock";
import { localDb } from "#/db/local-db";
import type { User, Card, TransactionLog } from "#/db/local-db";

// ── Constants ──────────────────────────────────────────────────────────

/** Maximum retry attempts on network/5xx errors */
export const MAX_PULL_RETRY_ATTEMPTS = 5;

/** Initial backoff delay in milliseconds */
export const INITIAL_BACKOFF_MS = 1000;

/** Maximum backoff delay in milliseconds */
export const MAX_BACKOFF_MS = 60_000;

// ── Types ──────────────────────────────────────────────────────────────

export interface SyncPullResult {
  /** Total members merged into local DB */
  membersPulled: number;
  /** Total cards merged into local DB */
  cardsPulled: number;
  /** Total transactions merged into local DB */
  transactionsPulled: number;
  /** Whether re-authentication is needed (401 received) */
  authRequired: boolean;
}

/** Shape of a single entity type in the pull response */
interface PullEntityResponse<T> {
  data: T[];
  cursor: string;
  hasMore: boolean;
}

/** Full pull response from the server */
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

// ── Errors ─────────────────────────────────────────────────────────────

/** Error thrown when sync pull exhausts all retry attempts. */
export class SyncPullError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SyncPullError";
  }
}

/** Error thrown when the server returns 401 and re-auth is needed. */
export class SyncPullAuthError extends Error {
  constructor() {
    super("Sync pull aborted: authentication required");
    this.name = "SyncPullAuthError";
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Calculate exponential backoff delay.
 * Starts at INITIAL_BACKOFF_MS, doubles each attempt, capped at MAX_BACKOFF_MS.
 */
export function calculateBackoff(attempt: number): number {
  const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_BACKOFF_MS);
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read current sync cursors from IndexedDB for a tenant.
 * Returns cursor values for members, cards, and transactions.
 * Defaults to "0" if no cursor exists (initial sync).
 */
export async function getSyncCursors(tenantId: string): Promise<{
  members: string;
  cards: string;
  transactions: string;
}> {
  const cursors = await localDb.syncCursors
    .where("[tenantId+entityType]")
    .between([tenantId, ""], [tenantId, "\uffff"], true, true)
    .toArray();

  const cursorMap = new Map(cursors.map((c) => [c.entityType, c.lastCursor]));

  return {
    members: cursorMap.get("members") ?? "0",
    cards: cursorMap.get("cards") ?? "0",
    transactions: cursorMap.get("transactions") ?? "0",
  };
}

/**
 * Update sync cursors in IndexedDB for a tenant.
 */
async function updateSyncCursors(
  tenantId: string,
  cursors: { members: string; cards: string; transactions: string },
): Promise<void> {
  const now = Date.now();

  await localDb.syncCursors.bulkPut([
    { tenantId, entityType: "members", lastCursor: cursors.members, updatedAt: now },
    { tenantId, entityType: "cards", lastCursor: cursors.cards, updatedAt: now },
    { tenantId, entityType: "transactions", lastCursor: cursors.transactions, updatedAt: now },
  ]);
}

/**
 * Get the set of [cardId+counter] keys that have pending outbox entries.
 * These should be skipped during merge to avoid overwriting local pending data.
 */
async function getPendingOutboxKeys(tenantId: string): Promise<Set<string>> {
  const pending = await localDb.transactionLog
    .where("[tenantId+syncStatus]")
    .equals([tenantId, "pending"])
    .toArray();

  const keys = new Set<string>();
  for (const entry of pending) {
    keys.add(`${entry.cardId}:${entry.counter}`);
  }
  return keys;
}

/**
 * Build the pull URL with cursor query parameters.
 */
function buildPullUrl(
  tenantId: string,
  cursors: { members: string; cards: string; transactions: string },
): string {
  const params = new URLSearchParams({
    tenantId,
    membersCursor: cursors.members,
    cardsCursor: cursors.cards,
    txCursor: cursors.transactions,
  });
  return `${API_BASE_URL}/api/sync/pull?${params.toString()}`;
}

/**
 * Determine if an error is retryable (network error or 5xx response).
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof DeviceBlockedError) return false;
  if (error instanceof SyncPullAuthError) return false;
  // Network errors (TypeError from fetch) are retryable
  if (error instanceof TypeError) return true;
  return true;
}

// ── Merge Logic ────────────────────────────────────────────────────────

/**
 * Merge pulled members into IndexedDB users table via upsert.
 */
function mapMemberToUser(member: MemberPullEntry): User {
  return {
    tenantId: member.tenantId,
    userId: member.userId,
    name: member.name,
    status: member.status as User["status"],
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    syncStatus: "synced",
  };
}

/**
 * Merge pulled cards into IndexedDB cards table via upsert.
 */
function mapCardToLocal(card: CardPullEntry): Card {
  return {
    tenantId: card.tenantId,
    cardId: card.cardId,
    userId: card.userId,
    status: card.status as Card["status"],
    balance: card.balance,
    counter: card.counter,
    keyVersion: card.keyVersion,
    createdAt: card.createdAt,
    lastActivityAt: card.lastActivityAt,
    expiresAt: card.expiresAt,
    notes: card.notes,
    syncStatus: "synced",
  };
}

/**
 * Map a pulled transaction to the local TransactionLog format.
 */
function mapTransactionToLocal(tx: TransactionPullEntry): TransactionLog {
  return {
    tenantId: tx.tenantId,
    cardId: tx.cardId,
    userId: tx.userId,
    cardName: null,
    counter: tx.counter,
    type: tx.type as TransactionLog["type"],
    amount: tx.amount,
    balanceAfter: tx.balanceAfter,
    timestamp: tx.timestamp,
    hash: tx.hash,
    terminalId: tx.terminalId,
    deviceId: tx.deviceId,
    syncStatus: "synced",
    syncedAt: Date.now(),
    createdAt: tx.createdAt,
  };
}

// ── Single Pull Request with Retry ─────────────────────────────────────

/**
 * Execute a single pull request with retry logic.
 * Throws SyncPullAuthError on 401, DeviceBlockedError if blocked.
 */
async function pullWithRetry(
  tenantId: string,
  cursors: { members: string; cards: string; transactions: string },
): Promise<SyncPullResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_PULL_RETRY_ATTEMPTS; attempt++) {
    // Check device block before each request
    if (isDeviceBlocked()) {
      throw new DeviceBlockedError("Device is blocked — sync pull aborted");
    }

    try {
      const url = buildPullUrl(tenantId, cursors);
      const response = await apiFetch(url, { method: "GET" }, tenantId);

      // 2xx: success
      if (response.ok) {
        return (await response.json()) as SyncPullResponse;
      }

      // 401: abort and signal re-auth
      if (response.status === 401) {
        throw new SyncPullAuthError();
      }

      // 429: rate limited — respect Retry-After header
      if (response.status === 429) {
        const retryAfter = Number.parseInt(response.headers.get("Retry-After") ?? "5", 10);
        const pauseMs = Math.min(retryAfter * 1000, 120_000);
        await sleep(pauseMs);
        continue;
      }

      // 4xx (non-401, non-429): not retryable
      if (response.status >= 400 && response.status < 500) {
        throw new SyncPullError(`Sync pull failed with client error: ${response.status}`);
      }

      // 5xx: retryable server error
      lastError = new Error(`Server error: ${response.status}`);
    } catch (error: unknown) {
      if (!isRetryableError(error)) {
        throw error;
      }
      lastError = error;
    }

    // Wait with exponential backoff before retrying
    if (attempt < MAX_PULL_RETRY_ATTEMPTS - 1) {
      const backoff = calculateBackoff(attempt);
      await sleep(backoff);
    }
  }

  throw new SyncPullError(`Sync pull failed after ${MAX_PULL_RETRY_ATTEMPTS} attempts`, lastError);
}

/**
/**
 * Merge pulled members into the users table, skipping locally pending members.
 * Returns the count of records merged.
 */
async function mergePulledMembers(tenantId: string, data: MemberPullEntry[]): Promise<number> {
  if (data.length === 0) return 0;

  const mappedUsers = data.map(mapMemberToUser);
  const pendingMemberKeys = new Set<string>();
  const pendingMembers = await localDb.users
    .where("[tenantId+syncStatus]")
    .equals([tenantId, "pending"])
    .toArray();
  for (const m of pendingMembers) {
    pendingMemberKeys.add(`${m.tenantId}:${m.userId}`);
  }
  const usersToMerge = mappedUsers.filter(
    (u) => !pendingMemberKeys.has(`${u.tenantId}:${u.userId}`),
  );
  if (usersToMerge.length > 0) {
    await localDb.users.bulkPut(usersToMerge);
  }
  return usersToMerge.length;
}

/**
 * Merge pulled cards into the cards table, skipping locally pending cards.
 * Returns the count of records merged.
 */
async function mergePulledCards(tenantId: string, data: CardPullEntry[]): Promise<number> {
  if (data.length === 0) return 0;

  const mappedCards = data.map(mapCardToLocal);
  const pendingCardKeys = new Set<string>();
  const pendingCards = await localDb.cards
    .where("[tenantId+syncStatus]")
    .equals([tenantId, "pending"])
    .toArray();
  for (const c of pendingCards) {
    pendingCardKeys.add(`${c.tenantId}:${c.cardId}`);
  }
  const cardsToMerge = mappedCards.filter((c) => !pendingCardKeys.has(`${c.tenantId}:${c.cardId}`));
  if (cardsToMerge.length > 0) {
    await localDb.cards.bulkPut(cardsToMerge);
  }
  return cardsToMerge.length;
}

/**
 * Merge pulled transactions into the transactionLog table.
 * Skips pending outbox entries and updates existing entries to "synced".
 * Returns the count of records merged.
 */
async function mergePulledTransactions(
  data: TransactionPullEntry[],
  pendingKeys: Set<string>,
): Promise<number> {
  if (data.length === 0) return 0;

  let txMerged = 0;
  const transactions: TransactionLog[] = [];

  for (const tx of data) {
    const key = `${tx.cardId}:${tx.counter}`;
    if (pendingKeys.has(key)) continue;

    const existing = await localDb.transactionLog
      .where("[tenantId+cardId+counter]")
      .equals([tx.tenantId, tx.cardId, tx.counter])
      .first();

    if (existing) {
      if (existing.id != null && existing.syncStatus !== "synced") {
        await localDb.transactionLog.update(existing.id, {
          syncStatus: "synced",
          syncedAt: Date.now(),
        });
      }
      txMerged++;
      continue;
    }

    transactions.push(mapTransactionToLocal(tx));
  }

  if (transactions.length > 0) {
    await localDb.transactionLog.bulkPut(transactions);
    txMerged += transactions.length;
  }

  return txMerged;
}

/**
 * Merge a single pull response page into IndexedDB.
 * Performs an atomic Dexie transaction for members, cards, and transactions.
 * Returns the counts of records merged.
 */
async function mergePullResponse(
  tenantId: string,
  response: SyncPullResponse,
  pendingKeys: Set<string>,
): Promise<{ membersMerged: number; cardsMerged: number; txMerged: number }> {
  let membersMerged = 0;
  let cardsMerged = 0;
  let txMerged = 0;

  await localDb.transaction(
    "rw",
    [localDb.users, localDb.cards, localDb.transactionLog],
    async () => {
      membersMerged = await mergePulledMembers(tenantId, response.members.data);
      cardsMerged = await mergePulledCards(tenantId, response.cards.data);
      txMerged = await mergePulledTransactions(response.transactions.data, pendingKeys);
    },
  );

  return { membersMerged, cardsMerged, txMerged };
}

// ── Main Pull Logic ────────────────────────────────────────────────────

/**
 * Execute the full sync pull cycle for a tenant.
 *
 * 1. Reads current sync cursors from IndexedDB syncCursors table
 * 2. Calls GET /api/sync/pull with cursor values
 * 3. Paginates: if any entity type has hasMore=true, calls again with updated cursors
 * 4. Merges server data into IndexedDB:
 *    - Members: upsert into users table by [tenantId, userId]
 *    - Cards: upsert into cards table by [tenantId, cardId]
 *    - Transactions: upsert into transactionLog table, SKIP entries with pending syncStatus
 * 5. Updates local sync cursors in syncCursors table
 * 6. Handles 401 (abort + re-auth), 5xx (retry with backoff, max 5 attempts)
 * 7. Checks isDeviceBlocked() before each request and aborts if blocked
 */
export async function syncPull(tenantId: string): Promise<SyncPullResult> {
  // Check device block before starting
  if (isDeviceBlocked()) {
    throw new DeviceBlockedError("Device is blocked — sync pull aborted");
  }

  // Skip if no auth token — means this is a local-only tenant not registered on server
  const token = getAccessToken();
  if (!token) {
    return {
      membersPulled: 0,
      cardsPulled: 0,
      transactionsPulled: 0,
      authRequired: false,
    };
  }

  // Step 1: Read current sync cursors
  const cursors = await getSyncCursors(tenantId);

  // Track running cursors for pagination
  const runningCursors = { ...cursors };

  // Accumulate all pulled data across pages
  let totalMembersPulled = 0;
  let totalCardsPulled = 0;
  let totalTransactionsPulled = 0;

  // Step 2 & 3: Paginate until all entity types are complete
  let hasMore = true;

  while (hasMore) {
    // Check device block before each page request
    if (isDeviceBlocked()) {
      throw new DeviceBlockedError("Device is blocked — sync pull aborted");
    }

    // Fetch one page
    const response = await pullWithRetry(tenantId, runningCursors);

    // Step 4: Merge server data into IndexedDB
    // Get pending outbox keys to skip during merge
    const pendingKeys = await getPendingOutboxKeys(tenantId);

    const { membersMerged, cardsMerged, txMerged } = await mergePullResponse(
      tenantId,
      response,
      pendingKeys,
    );
    totalMembersPulled += membersMerged;
    totalCardsPulled += cardsMerged;
    totalTransactionsPulled += txMerged;

    // Update running cursors from response
    runningCursors.members = response.members.cursor;
    runningCursors.cards = response.cards.cursor;
    runningCursors.transactions = response.transactions.cursor;

    // Check if any entity type still has more data
    hasMore = response.members.hasMore || response.cards.hasMore || response.transactions.hasMore;
  }

  // Step 5: Update local sync cursors on success
  await updateSyncCursors(tenantId, runningCursors);

  return {
    membersPulled: totalMembersPulled,
    cardsPulled: totalCardsPulled,
    transactionsPulled: totalTransactionsPulled,
    authRequired: false,
  };
}
