/**
 * RealTimeSyncManager - manages real-time data synchronization between devices
 * via Server-Sent Events (SSE) with fallback to periodic pull.
 *
 * Responsibilities:
 * - Full data pull on login (cursor-based pagination)
 * - Persistent SSE connection for real-time updates
 * - Automatic reconnection with exponential backoff
 * - Periodic pull fallback while SSE is disconnected
 * - Handle card_status_change events: update IndexedDB + invalidate TanStack Query caches
 * - Retry on IndexedDB write failure (1 retry, then mark for re-sync)
 *
 * @see Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { syncPull } from "#/application/sync/syncPull.usecase";
import { localDb } from "#/infrastructure/persistence/dexie/localDb";
import { getAccessToken } from "./apiClient";
import { addSyncLog } from "#/infrastructure/persistence/dexie/syncLogStore";
import type { QueryClient } from "@tanstack/react-query";
// ── Types ──────────────────────────────────────────────────────────────

export interface RealTimeSyncConfig {
  tenantId: string;
  deviceId: string;
  /** SSE endpoint URL */
  sseUrl: string;
}

export interface SyncEvent {
  type: "card_status_change" | "member_update" | "transaction" | "checkin" | "checkout";
  payload: Record<string, unknown>;
  timestamp: number;
  sourceDeviceId: string;
}

export interface CardStatusChangePayload {
  cardId: string;
  tenantId: string;
  newStatus: "blocked_admin" | "blocked_tamper" | "blocked_fraud" | "active";
  changedBy: string;
  timestamp: number;
}

// ── Constants ──────────────────────────────────────────────────────────

/** Initial backoff delay for SSE reconnection (ms) */
export const INITIAL_BACKOFF_MS = 1000;

/** Maximum backoff delay for SSE reconnection (ms) */
export const MAX_BACKOFF_MS = 60_000;

/** Maximum reconnection attempts before giving up */
export const MAX_RECONNECT_ATTEMPTS = 1;

/** Periodic pull interval while SSE is disconnected (ms) */
export const PERIODIC_PULL_INTERVAL_MS = 30_000;

/** Maximum retries for IndexedDB write failures */
const MAX_IDB_WRITE_RETRIES = 1;

// ── Module-level state (singleton) ─────────────────────────────────────

let _queryClient: QueryClient | null = null;
let _config: RealTimeSyncConfig | null = null;
let _eventSource: EventSource | null = null;
let _connected = false;
let _reconnectAttempts = 0;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _periodicPullTimer: ReturnType<typeof setInterval> | null = null;
let _eventHandlers: Map<SyncEvent["type"], Set<(event: SyncEvent) => void>> = new Map();
let _cardsNeedingResync: Set<string> = new Set();

// ── QueryClient Management ─────────────────────────────────────────────

/**
 * Set the QueryClient reference for cache invalidation.
 * Call this once during app initialization (e.g., in main.tsx or root provider).
 */
export function setQueryClient(client: QueryClient): void {
  _queryClient = client;
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
 * Emit a SyncEvent to all registered handlers for that event type.
 */
function emitEvent(event: SyncEvent): void {
  const handlers = _eventHandlers.get(event.type);
  if (handlers) {
    for (const handler of handlers) {
      try {
        handler(event);
      } catch {
        // Don't let one handler failure break others
      }
    }
  }
}

/**
 * Invalidate TanStack Query caches for card-related queries.
 */
function invalidateCardCaches(cardId: string, tenantId: string): void {
  if (!_queryClient) return;

  _queryClient.invalidateQueries({ queryKey: ["card", cardId] });
  _queryClient.invalidateQueries({ queryKey: ["cards", tenantId] });
  _queryClient.invalidateQueries({ queryKey: ["station-cards", tenantId] });
}

// ── Card Status Change Handler ─────────────────────────────────────────

/**
 * Handle a card_status_change event from SSE.
 * Updates IndexedDB and invalidates TanStack Query caches.
 * Retries once on IndexedDB write failure, then marks for re-sync.
 *
 * @see Requirements 5.2, 5.3, 5.4, 5.5
 */
async function handleCardStatusChange(payload: Readonly<CardStatusChangePayload>): Promise<void> {
  const { cardId, tenantId, newStatus, changedBy, timestamp } = payload;

  const writeToDb = async (): Promise<void> => {
    const existingCard = await localDb.cards.get([tenantId, cardId]);

    if (existingCard) {
      // Card exists - update status
      await localDb.cards.update([tenantId, cardId], {
        status: newStatus,
      });
    } else {
      // Card not in local cache - create a minimal record with block status
      await localDb.cards.put({
        tenantId,
        cardId,
        userId: null,
        status: newStatus,
        balance: 0,
        counter: 0,
        keyVersion: 1,
        createdAt: timestamp,
        lastActivityAt: timestamp,
        expiresAt: null,
        notes: `Blocked by admin: ${changedBy}`,
      });
    }
  };

  // Attempt write with 1 retry on failure
  for (let attempt = 0; attempt <= MAX_IDB_WRITE_RETRIES; attempt++) {
    try {
      await writeToDb();
      // Success - invalidate caches and return
      invalidateCardCaches(cardId, tenantId);
      // Remove from re-sync set if it was there
      _cardsNeedingResync.delete(`${tenantId}:${cardId}`);
      return;
    } catch {
      if (attempt >= MAX_IDB_WRITE_RETRIES) {
        // All retries exhausted - mark for re-sync on next pull
        _cardsNeedingResync.add(`${tenantId}:${cardId}`);
        // eslint-disable-next-line no-console
        console.warn(
          `[RealTimeSync] IndexedDB write failed for card ${cardId} after ${MAX_IDB_WRITE_RETRIES + 1} attempts. Marked for re-sync.`,
        );
      }
    }
  }
}

// ── SSE Connection Management ──────────────────────────────────────────

/**
 * Parse an SSE message data string into a SyncEvent.
 */
function parseSseMessage(data: string): SyncEvent | null {
  try {
    const parsed = JSON.parse(data) as SyncEvent;
    if (!parsed.type || typeof parsed.timestamp !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Handle incoming SSE messages.
 */
function handleSseMessage(messageEvent: MessageEvent): void {
  const event = parseSseMessage(messageEvent.data as string);
  if (!event) return;

  // Ignore events from our own device
  if (_config?.deviceId === event.sourceDeviceId) return;

  // Handle card_status_change specifically
  if (event.type === "card_status_change") {
    const payload = event.payload as unknown as CardStatusChangePayload;
    handleCardStatusChange(payload).catch(() => {
      // Error already handled inside handleCardStatusChange
    });
  }

  // Emit to all registered handlers
  emitEvent(event);
}

/**
 * Start the periodic pull fallback (30s interval).
 * Used while SSE is disconnected.
 */
function startPeriodicPull(): void {
  stopPeriodicPull();

  if (!_config) return;

  const tenantId = _config.tenantId;
  _periodicPullTimer = setInterval(async () => {
    try {
      await syncPull(tenantId);
    } catch {
      // Non-critical - periodic pull failure is expected when offline
    }
  }, PERIODIC_PULL_INTERVAL_MS);
}

/**
 * Stop the periodic pull fallback.
 */
function stopPeriodicPull(): void {
  if (_periodicPullTimer !== null) {
    clearInterval(_periodicPullTimer);
    _periodicPullTimer = null;
  }
}

/**
 * Attempt to establish the SSE connection.
 */
function establishSseConnection(): void {
  if (!_config) return;

  // Clean up any existing connection
  if (_eventSource) {
    _eventSource.close();
    _eventSource = null;
  }

  try {
    // EventSource API doesn't support custom headers, so we pass the
    // auth token as a query parameter (server accepts ?token= fallback).
    const token = getAccessToken();
    const sseUrl = new URL(_config.sseUrl);
    if (token) {
      sseUrl.searchParams.set("token", token);
    }

    _eventSource = new EventSource(sseUrl.toString());

    _eventSource.onopen = () => {
      _connected = true;
      _reconnectAttempts = 0;

      // Stop periodic pull - SSE is active
      stopPeriodicPull();

      // Perform catch-up pull to get any missed updates during disconnection
      if (_config) {
        syncPull(_config.tenantId).catch(() => {
          // Non-critical - catch-up pull failure will be retried on next periodic pull
        });
      }
    };

    _eventSource.onmessage = handleSseMessage;

    _eventSource.onerror = () => {
      _connected = false;

      // Close the broken connection
      if (_eventSource) {
        _eventSource.close();
        _eventSource = null;
      }

      addSyncLog("warn", "SSE koneksi terputus, beralih ke periodic pull");

      // Start periodic pull fallback while disconnected
      startPeriodicPull();

      // Attempt reconnection with exponential backoff
      scheduleReconnect();
    };
  } catch {
    _connected = false;
    // Start periodic pull fallback
    startPeriodicPull();
    // Schedule reconnection
    scheduleReconnect();
  }
}

/**
 * Schedule a reconnection attempt with exponential backoff.
 */
function scheduleReconnect(): void {
  // Clear any existing reconnect timer
  if (_reconnectTimer !== null) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }

  // Check if we've exhausted reconnection attempts
  if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    // Stay in periodic pull mode - don't attempt further reconnections
    addSyncLog(
      "error",
      "SSE reconnect gagal",
      `${MAX_RECONNECT_ATTEMPTS} percobaan habis, menggunakan periodic pull`,
    );
    return;
  }

  const backoff = calculateBackoff(_reconnectAttempts);
  _reconnectAttempts++;

  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    establishSseConnection();
  }, backoff);
}

// ── Public API (RealTimeSyncManager interface) ─────────────────────────

/**
 * Initialize real-time sync connection.
 * Establishes SSE connection for receiving real-time updates.
 *
 * @see Requirement 8.2
 */
export function connect(config: RealTimeSyncConfig): void {
  // Disconnect any existing connection first
  if (_config) {
    disconnect();
  }

  _config = config;
  _reconnectAttempts = 0;

  // Establish SSE connection
  establishSseConnection();
}

/**
 * Disconnect and cleanup all resources.
 */
export function disconnect(): void {
  // Close SSE connection
  if (_eventSource) {
    _eventSource.close();
    _eventSource = null;
  }

  // Clear timers
  if (_reconnectTimer !== null) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }

  stopPeriodicPull();

  // Reset state
  _connected = false;
  _reconnectAttempts = 0;
  _config = null;
  _cardsNeedingResync.clear();
}

/**
 * Perform a full data pull on login.
 * Uses cursor-based pagination via the existing syncPull function.
 * Retries with exponential backoff on failure (max 5 attempts).
 *
 * @see Requirements 8.1, 8.3
 */
export async function fullSyncOnLogin(tenantId: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
    try {
      await syncPull(tenantId);
      return; // Success
    } catch (error: unknown) {
      lastError = error;

      // Don't retry on auth errors
      if (error instanceof Error && error.name === "SyncPullAuthError") {
        throw error;
      }

      // Wait with exponential backoff before retrying
      if (attempt < MAX_RECONNECT_ATTEMPTS - 1) {
        const backoff = calculateBackoff(attempt);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  addSyncLog("error", "Full sync saat login gagal", `${MAX_RECONNECT_ATTEMPTS} percobaan gagal`);

  throw new RealTimeSyncError(
    `Full sync on login failed after ${MAX_RECONNECT_ATTEMPTS} attempts`,
    lastError,
  );
}

/**
 * Subscribe to specific SSE event types.
 * Returns an unsubscribe function.
 *
 * @param type - The event type to listen for
 * @param handler - Callback invoked when an event of this type is received
 * @returns Unsubscribe function
 */
export function onEvent(type: SyncEvent["type"], handler: (event: SyncEvent) => void): () => void {
  if (!_eventHandlers.has(type)) {
    _eventHandlers.set(type, new Set());
  }

  const handlers = _eventHandlers.get(type)!;
  handlers.add(handler);

  // Return unsubscribe function
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) {
      _eventHandlers.delete(type);
    }
  };
}

/**
 * Check if the SSE connection is currently active.
 */
export function isConnected(): boolean {
  return _connected;
}

/**
 * Get the set of cards that need re-sync due to failed IndexedDB writes.
 * Useful for diagnostics and manual re-sync triggers.
 */
export function getCardsNeedingResync(): ReadonlySet<string> {
  return _cardsNeedingResync;
}

// ── Error Classes ──────────────────────────────────────────────────────

/** Error thrown when full sync on login exhausts all retry attempts. */
export class RealTimeSyncError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RealTimeSyncError";
  }
}
