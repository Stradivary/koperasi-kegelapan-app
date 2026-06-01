/**
 * Client-side sync push logic.
 *
 * Reads pending Outbox entries from IndexedDB, batches them (max 500),
 * sends to POST /api/sync/push, handles responses (accepted → "synced",
 * stale_counter → "conflict"), and retries on network/5xx errors with
 * exponential backoff.
 *
 * Corrupt entries (missing required fields) are validated before push and
 * marked as "failed" to prevent infinite retry loops. Non-retryable server
 * rejections (4xx except 429) also mark entries as "failed".
 *
 * @see Requirements 2.5, 3.4, 3.8, 6.1, 6.2, 6.5, 6.7, 6.8
 */

import { apiFetch, API_BASE_URL, DeviceBlockedError, getAccessToken } from "./api";
import { isDeviceBlocked } from "./deviceBlock";
import { getSyncableEntries, updateSyncStatus } from "./transactionLogService";
import type { TransactionLog } from "#/db/local-db";

// ── Constants ──────────────────────────────────────────────────────────

/** Maximum entries per push request */
export const MAX_BATCH_SIZE = 500;

/** Maximum retry attempts on network/5xx errors */
export const MAX_RETRY_ATTEMPTS = 10;

/** Initial backoff delay in milliseconds */
export const INITIAL_BACKOFF_MS = 1000;

/** Maximum backoff delay in milliseconds */
export const MAX_BACKOFF_MS = 60_000;

// ── Types ──────────────────────────────────────────────────────────────

export interface SyncPushResult {
  /** Total entries accepted by the server across all batches */
  totalAccepted: number;
  /** Total entries rejected by the server across all batches */
  totalRejected: number;
  /** Whether a pull is needed (stale_counter conflicts detected) */
  pullNeeded: boolean;
  /** Number of entries marked as "conflict" */
  conflictCount: number;
  /** Number of entries marked as "failed" (corrupt or non-retryable rejection) */
  failedCount: number;
}

export interface SyncPushRejection {
  key: string;
  reason: string;
}

export interface SyncPushResponse {
  accepted: number;
  rejected: SyncPushRejection[];
  serverCursor: string;
}

interface PushBatchPayload {
  tenantId: string;
  transactions: PushTransaction[];
}

interface PushTransaction {
  cardId: string;
  counter: number;
  type: string;
  amount: number;
  balanceAfter: number;
  timestamp: number;
  hash: string;
  idempotencyKey: string;
  userId?: string | null;
  terminalId?: number | null;
  deviceId?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Generate the idempotency key for a transaction entry.
 * Format: {tenantId}:{cardId}:{counter}
 */
export function generateIdempotencyKey(entry: TransactionLog): string {
  return `${entry.tenantId}:${entry.cardId}:${entry.counter}`;
}

/**
 * Split an array into batches of a given size.
 */
export function batchEntries<T>(entries: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < entries.length; i += batchSize) {
    batches.push(entries.slice(i, i + batchSize));
  }
  return batches;
}

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
 * Map a TransactionLog entry to the push payload format.
 */
function toPushTransaction(entry: TransactionLog): PushTransaction {
  return {
    cardId: entry.cardId,
    counter: entry.counter,
    type: entry.type,
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    timestamp: entry.timestamp,
    hash: entry.hash,
    idempotencyKey: generateIdempotencyKey(entry),
    userId: entry.userId,
    terminalId: entry.terminalId,
    deviceId: entry.deviceId,
  };
}

/**
 * Determine if an error is retryable (network error or 5xx response).
 */
function isRetryableError(error: unknown): boolean {
  // DeviceBlockedError is NOT retryable
  if (error instanceof DeviceBlockedError) return false;
  // Network errors (TypeError from fetch) are retryable
  if (error instanceof TypeError) return true;
  // Other errors are retryable (generic network issues)
  return true;
}

// ── Payload Validation ─────────────────────────────────────────────────

/**
 * Validate that a TransactionLog entry has all required fields for push.
 * Checks: cardId, counter, type, amount, hash.
 * Returns true if the entry is valid, false if it's corrupt.
 */
export function isValidPushEntry(entry: TransactionLog): boolean {
  // cardId must be a non-empty string
  if (!entry.cardId || typeof entry.cardId !== "string") return false;
  // counter must be a finite number
  if (typeof entry.counter !== "number" || !Number.isFinite(entry.counter)) return false;
  // type must be a non-empty string
  if (!entry.type || typeof entry.type !== "string") return false;
  // amount must be a finite number
  if (typeof entry.amount !== "number" || !Number.isFinite(entry.amount)) return false;
  // hash must be a non-empty string
  if (!entry.hash || typeof entry.hash !== "string") return false;
  return true;
}

/**
 * Partition entries into valid and corrupt groups.
 * Corrupt entries are those missing required fields.
 */
export function partitionEntries(entries: TransactionLog[]): {
  valid: TransactionLog[];
  corrupt: TransactionLog[];
} {
  const valid: TransactionLog[] = [];
  const corrupt: TransactionLog[] = [];
  for (const entry of entries) {
    if (isValidPushEntry(entry)) {
      valid.push(entry);
    } else {
      corrupt.push(entry);
    }
  }
  return { valid, corrupt };
}

/**
 * Process a server response for a single batch: update sync statuses for each
 * entry and return aggregate counts.
 */
async function processBatchResponse(
  batch: TransactionLog[],
  response: SyncPushResponse,
): Promise<{
  accepted: number;
  rejected: number;
  pullNeeded: boolean;
  conflictCount: number;
  failedCount: number;
}> {
  const accepted = response.accepted;
  const rejected = response.rejected.length;
  let pullNeeded = false;
  let conflictCount = 0;
  let failedCount = 0;

  // Build a map of idempotency_key → rejection reason for quick lookup
  const rejectionMap = new Map<string, string>();
  for (const rejection of response.rejected) {
    rejectionMap.set(rejection.key, rejection.reason);
  }

  for (const entry of batch) {
    const key = generateIdempotencyKey(entry);
    const rejection = rejectionMap.get(key);

    if (!entry.id) continue; // Safety: skip entries without an ID

    if (rejection === "stale_counter") {
      await updateSyncStatus(entry.id, "conflict");
      pullNeeded = true;
      conflictCount++;
    } else if (rejection) {
      await updateSyncStatus(entry.id, "failed");
      failedCount++;
    } else {
      await updateSyncStatus(entry.id, "synced");
    }
  }

  return { accepted, rejected, pullNeeded, conflictCount, failedCount };
}

// ── Main Push Logic ────────────────────────────────────────────────────

/**
 * Handle a non-2xx, non-429 4xx response from the push endpoint.
 * Throws NonRetryableServerError.
 */
async function handlePushClientError(response: Response): Promise<never> {
  const body = await response.json().catch(() => ({
    accepted: 0,
    rejected: [],
    serverCursor: String(Math.floor(Date.now() / 1000)),
  }));
  throw new NonRetryableServerError(
    `Server rejected batch with status ${response.status}`,
    response.status,
    body as SyncPushResponse,
  );
}

/**
 * Handle a 429 rate-limited response: wait for Retry-After and signal retry.
 */
async function handlePushRateLimit(response: Response): Promise<void> {
  const retryAfter = Number.parseInt(response.headers.get("Retry-After") ?? "5", 10);
  const pauseMs = Math.min(retryAfter * 1000, 120_000);
  await sleep(pauseMs);
}

/**
 * Process a single HTTP response from the push endpoint.
 * Returns the parsed response on 2xx, throws on 4xx, returns null on 5xx (retryable).
 */
async function processPushHttpResponse(response: Response): Promise<SyncPushResponse | null> {
  if (response.ok) {
    return (await response.json()) as SyncPushResponse;
  }

  if (response.status >= 400 && response.status < 500 && response.status !== 429) {
    await handlePushClientError(response);
  }

  if (response.status === 429) {
    await handlePushRateLimit(response);
    return null; // signal: retry
  }

  // 5xx: retryable
  return null;
}

/**
 * Send a single batch to the server with retry logic.
 * Returns the server response or throws after max retries.
 * Throws NonRetryableServerError for 4xx responses (except 429).
 */
async function pushBatchWithRetry(
  payload: PushBatchPayload,
  tenantId: string,
): Promise<SyncPushResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    // Check device block before each request
    if (isDeviceBlocked()) {
      throw new DeviceBlockedError("Device is blocked - sync push aborted");
    }

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/sync/push`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        tenantId,
      );

      const result = await processPushHttpResponse(response);
      if (result !== null) return result;

      // null means retryable (429 already slept - just continue; 5xx sets lastError)
      if (response.status === 429) {
        continue;
      }
      lastError = new Error(`Server error: ${response.status}`);
    } catch (error: unknown) {
      // Re-throw non-retryable errors immediately
      if (error instanceof NonRetryableServerError) throw error;
      if (!isRetryableError(error)) {
        throw error;
      }
      lastError = error;
    }

    // Wait with exponential backoff before retrying
    if (attempt < MAX_RETRY_ATTEMPTS - 1) {
      const backoff = calculateBackoff(attempt);
      await sleep(backoff);
    }
  }

  throw new SyncPushError(`Sync push failed after ${MAX_RETRY_ATTEMPTS} attempts`, lastError);
}

/**
 * Mark all corrupt entries as "failed" and return the count.
 */
async function markCorruptEntriesFailed(corrupt: TransactionLog[]): Promise<number> {
  let count = 0;
  for (const entry of corrupt) {
    if (entry.id) {
      await updateSyncStatus(entry.id, "failed");
      count++;
    }
  }
  return count;
}

/**
 * Process a single batch: send to server, handle response, return aggregate counts.
 * Returns null if the batch was marked failed (NonRetryableServerError).
 */
async function processSingleBatch(
  batch: TransactionLog[],
  tenantId: string,
): Promise<{
  accepted: number;
  rejected: number;
  pullNeeded: boolean;
  conflictCount: number;
  failedCount: number;
} | null> {
  const payload: PushBatchPayload = {
    tenantId,
    transactions: batch.map(toPushTransaction),
  };

  let response: SyncPushResponse;
  try {
    response = await pushBatchWithRetry(payload, tenantId);
  } catch (error: unknown) {
    if (error instanceof NonRetryableServerError) {
      const failedCount = await markCorruptEntriesFailed(batch);
      return { accepted: 0, rejected: 0, pullNeeded: false, conflictCount: 0, failedCount };
    }
    throw error;
  }

  return processBatchResponse(batch, response);
}

/**
 * Execute the full sync push cycle for a tenant.
 *
 * 1. Gets pending entries from transactionLogService.getSyncableEntries(tenantId)
 * 2. Validates entries - marks corrupt ones as "failed" and removes from batch
 * 3. Batches valid entries into groups of max 500
 * 4. Sends each batch to POST /api/sync/push using apiFetch
 * 5. On success: marks accepted entries as "synced" via updateSyncStatus
 * 6. On stale_counter rejection: marks those entries as "conflict"
 * 7. On non-retryable 4xx rejection: marks entries as "failed" (no retry)
 * 8. Returns a flag indicating if a pull is needed (when stale_counter conflicts detected)
 * 9. Implements exponential backoff retry on network/5xx errors
 * 10. Checks isDeviceBlocked() before each request and aborts if blocked
 */
export async function syncPush(tenantId: string): Promise<SyncPushResult> {
  // Check device block before starting
  if (isDeviceBlocked()) {
    throw new DeviceBlockedError("Device is blocked - sync push aborted");
  }

  // Skip if no auth token - means this is a local-only tenant not registered on server
  const token = getAccessToken();
  if (!token) {
    return {
      totalAccepted: 0,
      totalRejected: 0,
      pullNeeded: false,
      conflictCount: 0,
      failedCount: 0,
    };
  }

  // Step 1: Get pending entries
  const pendingEntries = await getSyncableEntries(tenantId);

  if (pendingEntries.length === 0) {
    return {
      totalAccepted: 0,
      totalRejected: 0,
      pullNeeded: false,
      conflictCount: 0,
      failedCount: 0,
    };
  }

  // Step 2: Validate entries - isolate corrupt ones before push
  const { valid: validEntries, corrupt: corruptEntries } = partitionEntries(pendingEntries);

  let failedCount = await markCorruptEntriesFailed(corruptEntries);

  // If no valid entries remain after filtering, return early
  if (validEntries.length === 0) {
    return {
      totalAccepted: 0,
      totalRejected: 0,
      pullNeeded: false,
      conflictCount: 0,
      failedCount,
    };
  }

  // Step 3: Batch valid entries into groups of max 500
  const batches = batchEntries(validEntries, MAX_BATCH_SIZE);

  let totalAccepted = 0;
  let totalRejected = 0;
  let pullNeeded = false;
  let conflictCount = 0;

  // Step 4: Send each batch
  for (const batch of batches) {
    // Check device block before each batch
    if (isDeviceBlocked()) {
      throw new DeviceBlockedError("Device is blocked - sync push aborted");
    }

    const batchResult = await processSingleBatch(batch, tenantId);
    if (batchResult === null) continue;

    totalAccepted += batchResult.accepted;
    totalRejected += batchResult.rejected;
    if (batchResult.pullNeeded) pullNeeded = true;
    conflictCount += batchResult.conflictCount;
    failedCount += batchResult.failedCount;
  }

  return {
    totalAccepted,
    totalRejected,
    pullNeeded,
    conflictCount,
    failedCount,
  };
}

// ── Error classes ──────────────────────────────────────────────────────

/** Error thrown when sync push exhausts all retry attempts. */
export class SyncPushError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SyncPushError";
  }
}

/** Error thrown when server returns a non-retryable 4xx response (except 429). */
export class NonRetryableServerError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: SyncPushResponse,
  ) {
    super(message);
    this.name = "NonRetryableServerError";
  }
}
