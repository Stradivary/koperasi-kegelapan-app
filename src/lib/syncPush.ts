/**
 * Client-side sync push logic.
 *
 * Reads pending Outbox entries from IndexedDB, batches them (max 500),
 * sends to POST /api/sync/push, handles responses (accepted → "synced",
 * stale_counter → "conflict"), and retries on network/5xx errors with
 * exponential backoff.
 *
 * @see Requirements 6.1, 6.2, 6.5, 6.7, 6.8
 */

import { apiFetch, API_BASE_URL, DeviceBlockedError } from "./api";
import { isDeviceBlocked } from "./deviceBlock";
import {
  getSyncableEntries,
  updateSyncStatus,
} from "./transactionLogService";
import type { TransactionLog } from "../db/local-db";

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
  userId?: number | null;
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

// ── Main Push Logic ────────────────────────────────────────────────────

/**
 * Send a single batch to the server with retry logic.
 * Returns the server response or throws after max retries.
 */
async function pushBatchWithRetry(
  payload: PushBatchPayload,
  tenantId: string,
): Promise<SyncPushResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    // Check device block before each request
    if (isDeviceBlocked()) {
      throw new DeviceBlockedError("Device is blocked — sync push aborted");
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

      // 2xx: success
      if (response.ok) {
        return (await response.json()) as SyncPushResponse;
      }

      // 4xx (except 429): not retryable, return as-is or throw
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        // Client errors are not retryable — treat as a failed batch
        const body = await response.json().catch(() => ({
          accepted: 0,
          rejected: [],
          serverCursor: String(Math.floor(Date.now() / 1000)),
        }));
        return body as SyncPushResponse;
      }

      // 429: rate limited — respect Retry-After header
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") ?? "5", 10);
        const pauseMs = Math.min(retryAfter * 1000, 120_000);
        await sleep(pauseMs);
        continue;
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
    if (attempt < MAX_RETRY_ATTEMPTS - 1) {
      const backoff = calculateBackoff(attempt);
      await sleep(backoff);
    }
  }

  throw new SyncPushError(
    `Sync push failed after ${MAX_RETRY_ATTEMPTS} attempts`,
    lastError,
  );
}

/**
 * Execute the full sync push cycle for a tenant.
 *
 * 1. Gets pending entries from transactionLogService.getSyncableEntries(tenantId)
 * 2. Batches them into groups of max 500
 * 3. Sends each batch to POST /api/sync/push using apiFetch
 * 4. On success: marks accepted entries as "synced" via updateSyncStatus
 * 5. On stale_counter rejection: marks those entries as "conflict"
 * 6. Returns a flag indicating if a pull is needed (when stale_counter conflicts detected)
 * 7. Implements exponential backoff retry on network/5xx errors
 * 8. Checks isDeviceBlocked() before each request and aborts if blocked
 */
export async function syncPush(tenantId: string): Promise<SyncPushResult> {
  // Check device block before starting
  if (isDeviceBlocked()) {
    throw new DeviceBlockedError("Device is blocked — sync push aborted");
  }

  // Step 1: Get pending entries
  const pendingEntries = await getSyncableEntries(tenantId);

  if (pendingEntries.length === 0) {
    return {
      totalAccepted: 0,
      totalRejected: 0,
      pullNeeded: false,
      conflictCount: 0,
    };
  }

  // Step 2: Batch into groups of max 500
  const batches = batchEntries(pendingEntries, MAX_BATCH_SIZE);

  let totalAccepted = 0;
  let totalRejected = 0;
  let pullNeeded = false;
  let conflictCount = 0;

  // Step 3: Send each batch
  for (const batch of batches) {
    // Check device block before each batch
    if (isDeviceBlocked()) {
      throw new DeviceBlockedError("Device is blocked — sync push aborted");
    }

    const payload: PushBatchPayload = {
      tenantId,
      transactions: batch.map(toPushTransaction),
    };

    const response = await pushBatchWithRetry(payload, tenantId);

    totalAccepted += response.accepted;
    totalRejected += response.rejected.length;

    // Build a map of idempotency_key → rejection reason for quick lookup
    const rejectionMap = new Map<string, string>();
    for (const rejection of response.rejected) {
      rejectionMap.set(rejection.key, rejection.reason);
    }

    // Step 4 & 5: Update sync status for each entry in the batch
    for (const entry of batch) {
      const key = generateIdempotencyKey(entry);
      const rejection = rejectionMap.get(key);

      if (!entry.id) continue; // Safety: skip entries without an ID

      if (rejection === "stale_counter") {
        // Step 5: Mark as conflict and flag pull needed
        await updateSyncStatus(entry.id, "conflict");
        pullNeeded = true;
        conflictCount++;
      } else if (rejection) {
        // Other rejections: mark as conflict
        await updateSyncStatus(entry.id, "conflict");
        conflictCount++;
      } else {
        // Step 4: Accepted — mark as synced
        await updateSyncStatus(entry.id, "synced");
      }
    }
  }

  return {
    totalAccepted,
    totalRejected,
    pullNeeded,
    conflictCount,
  };
}

// ── Error class ────────────────────────────────────────────────────────

/** Error thrown when sync push exhausts all retry attempts. */
export class SyncPushError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "SyncPushError";
  }
}
