/**
 * Sync Engine orchestrator hook.
 *
 * Manages bidirectional sync lifecycle with debouncing, queuing,
 * and reactive status exposure. Coordinates syncPush and syncPull
 * in a push-first strategy.
 *
 * @see Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 14.1, 14.2, 14.4, 14.5
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { syncPush } from "#/lib/syncPush";
import { syncPushEntities, getPendingEntityCount } from "#/lib/syncPushEntities";
import { syncPull } from "#/lib/syncPull";
import { isDeviceBlocked } from "#/lib/deviceBlock";
import { getSyncableEntries } from "#/lib/transactionLogService";
import { addSyncLog } from "#/lib/syncLogStore";

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Extract a meaningful detail string from an Error's cause field.
 */
function extractCauseDetail(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (cause === null || cause === undefined) return "null/undefined cause";
  if (typeof cause === "string") return cause;
  if (typeof cause === "object") {
    try {
      const stringified = JSON.stringify(cause);
      return stringified.slice(0, 200);
    } catch {
      return "[unparseable cause object]";
    }
  }
  return String(cause);
}

/**
 * Extract a meaningful detail string from an unknown error value.
 * Handles Error objects, plain objects (e.g. `{}`), strings, and other types.
 */
function extractErrorDetail(err: unknown): string {
  if (err instanceof Error) {
    const parts = [err.message];
    if (err.cause) {
      const causeDetail = extractCauseDetail(err.cause);
      parts.push(`cause: ${causeDetail}`);
    }
    if (err.stack) {
      // Extract first meaningful stack line (skip the error message line)
      const stackLines = err.stack.split("\n").slice(1, 3);
      const trimmed = stackLines.map((l) => l.trim()).join(" → ");
      if (trimmed) parts.push(trimmed);
    }
    return parts.join(" | ");
  }
  if (err === null || err === undefined) return "Unknown error (null/undefined)";
  if (typeof err === "string") return err || "Empty error string";
  if (typeof err === "object") {
    // Handle empty objects like `{}`
    const keys = Object.keys(err);
    if (keys.length === 0) return "Empty error object ({})";
    try {
      const stringified = JSON.stringify(err);
      return stringified.slice(0, 300);
    } catch {
      return `[Object with keys: ${keys.join(", ")}]`;
    }
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "[unparseable value]";
  }
}

// ── Types ──────────────────────────────────────────────────────────────

export type SyncEngineStatus = "idle" | "pushing" | "pulling" | "error" | "offline";

export interface SyncEngineState {
  /** Current sync status */
  syncStatus: SyncEngineStatus;
  /** Timestamp of last successful sync completion (epoch ms), or null if never synced */
  lastSyncedAt: number | null;
  /** Number of pending Outbox entries awaiting push */
  pendingCount: number;
  /** Whether the last push phase succeeded (true even if pull subsequently failed) */
  lastPushSucceeded: boolean;
}

export interface UseSyncEngineReturn extends SyncEngineState {
  /** Manually trigger a sync cycle (bypasses debounce) */
  triggerSync: () => void;
  /** Notify the engine that a local mutation was written to the Outbox */
  notifyMutation: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────

/** Debounce delay in milliseconds after last Outbox write before triggering sync */
export const DEBOUNCE_MS = 5000;

/** Periodic pull interval in milliseconds (fetch new data from other devices) */
export const PERIODIC_PULL_INTERVAL_MS = 30_000;

/** Maximum consecutive error retries before giving up */
const MAX_ERROR_RETRIES = 5;

/** Initial retry backoff in milliseconds */
const INITIAL_RETRY_BACKOFF_MS = 1000;

/** Maximum retry backoff in milliseconds */
const MAX_RETRY_BACKOFF_MS = 60_000;

// ── Helpers ────────────────────────────────────────────────────────────

interface SyncErrorContext {
  mountedRef: { current: boolean };
  setSyncStatus: (s: SyncEngineStatus) => void;
  setLastPushSucceeded: (v: boolean) => void;
  errorRetryCountRef: { current: number };
  retryTimerRef: { current: ReturnType<typeof setTimeout> | null };
  enabledRef: { current: boolean };
  executeSyncCycle: () => Promise<void>;
}

/**
 * Handle the catch block of executeSyncCycle: log the error, update status,
 * and schedule a retry with exponential backoff if under the retry limit.
 */
function handleSyncError(
  err: unknown,
  pushSucceeded: boolean,
  tid: string,
  ctx: SyncErrorContext,
): void {
  const {
    mountedRef,
    setSyncStatus,
    setLastPushSucceeded,
    errorRetryCountRef,
    retryTimerRef,
    enabledRef,
    executeSyncCycle,
  } = ctx;

  if (!mountedRef.current) return;

  const errorDetail = extractErrorDetail(err);
  if (pushSucceeded) {
    addSyncLog("error", "Pull sync gagal (push berhasil)", `tenantId=${tid} | ${errorDetail}`);
  } else {
    setLastPushSucceeded(false);
    addSyncLog("error", "Push sync gagal", `tenantId=${tid} | ${errorDetail}`);
  }
  setSyncStatus("error");
  errorRetryCountRef.current += 1;

  if (errorRetryCountRef.current < MAX_ERROR_RETRIES) {
    const backoff = Math.min(
      INITIAL_RETRY_BACKOFF_MS * Math.pow(2, errorRetryCountRef.current - 1),
      MAX_RETRY_BACKOFF_MS,
    );
    retryTimerRef.current = setTimeout(() => {
      if (mountedRef.current && enabledRef.current) {
        executeSyncCycle();
      }
    }, backoff);
  } else {
    addSyncLog(
      "error",
      "Sync gagal setelah semua retry habis",
      `${MAX_ERROR_RETRIES} percobaan gagal berturut-turut`,
    );
  }
}

// ── Hook ───────────────────────────────────────────────────────────────

/**
 * Best-effort entity push: logs failures but does not throw.
 * Entity push failure should not prevent transaction push/pull.
 */
async function pushEntitiesBestEffort(tid: string): Promise<void> {
  try {
    await syncPushEntities(tid);
  } catch (entityErr) {
    // Log but don't abort - entity push is best-effort
    console.warn(
      "[SyncEngine] Entity push failed, continuing with transactions:",
      entityErr instanceof Error ? entityErr.message : entityErr,
    );
    const errorDetail = extractErrorDetail(entityErr);
    addSyncLog(
      "warn",
      "Entity push gagal, melanjutkan dengan transaksi",
      `tenantId=${tid} | ${errorDetail}`,
    );
  }
}

/**
 * Sync engine orchestrator hook.
 *
 * @param tenantId - The active tenant ID to sync for. Pass null/undefined to disable.
 * @param enabled - Whether the sync engine should be active (e.g., user is authenticated).
 */
export function useSyncEngine(
  tenantId: string | null | undefined,
  enabled: boolean = true,
): UseSyncEngineReturn {
  // ── Reactive state ─────────────────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastPushSucceeded, setLastPushSucceeded] = useState<boolean>(false);

  // ── Refs for non-reactive mutable state ────────────────────────────
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef<boolean>(false);
  const queuedSyncRef = useRef<boolean>(false);
  const errorRetryCountRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tenantIdRef = useRef<string | null | undefined>(tenantId);
  const enabledRef = useRef<boolean>(enabled);
  const mountedRef = useRef<boolean>(true);

  // Keep refs in sync with props
  tenantIdRef.current = tenantId;
  enabledRef.current = enabled;

  // ── Internal: update pending count ─────────────────────────────────
  const refreshPendingCount = useCallback(async () => {
    if (!tenantIdRef.current) {
      setPendingCount(0);
      return;
    }
    try {
      const [txEntries, entityCount] = await Promise.all([
        getSyncableEntries(tenantIdRef.current),
        getPendingEntityCount(tenantIdRef.current),
      ]);
      if (mountedRef.current) {
        setPendingCount(txEntries.length + entityCount);
      }
    } catch {
      // Non-critical - don't break the hook if IndexedDB read fails
    }
  }, []);

  // ── Internal: execute a sync cycle ─────────────────────────────────
  const executeSyncCycle = useCallback(async () => {
    const tid = tenantIdRef.current;
    if (!tid || !enabledRef.current) return;

    // Pre-checks: device blocked or offline
    if (isDeviceBlocked() || !navigator.onLine) {
      if (mountedRef.current) setSyncStatus("offline");
      return;
    }

    // Mark as syncing
    isSyncingRef.current = true;
    queuedSyncRef.current = false;

    // Track push/pull success separately for accurate UI status (Req 2.6, 3.4)
    let pushSucceeded = false;

    try {
      // Phase 1: Push entities (members + cards) - best-effort, non-blocking
      if (mountedRef.current) setSyncStatus("pushing");
      await pushEntitiesBestEffort(tid);

      // Phase 2: Push transactions
      await syncPush(tid);
      pushSucceeded = true;
      if (mountedRef.current) setLastPushSucceeded(true);

      // Phase 3: Pull (always run after push; required if pullNeeded)
      if (mountedRef.current) setSyncStatus("pulling");

      await syncPull(tid);

      // Success: BOTH push AND pull (local DB update) completed successfully
      const now = Date.now();
      if (mountedRef.current) {
        setLastSyncedAt(now);
        setSyncStatus("idle");
        errorRetryCountRef.current = 0;
      }
    } catch (err) {
      if (mountedRef.current) {
        handleSyncError(err, pushSucceeded, tid, {
          mountedRef,
          setSyncStatus,
          setLastPushSucceeded,
          errorRetryCountRef,
          retryTimerRef,
          enabledRef,
          executeSyncCycle,
        });
      }
    } finally {
      isSyncingRef.current = false;

      // Refresh pending count after sync
      await refreshPendingCount();

      // If a sync was queued while we were running, execute it now (Req 14.4)
      if (queuedSyncRef.current && mountedRef.current && enabledRef.current) {
        queuedSyncRef.current = false;
        // Small delay to avoid tight loops
        setTimeout(() => {
          if (mountedRef.current && enabledRef.current) {
            executeSyncCycle();
          }
        }, 100);
      }
    }
  }, [refreshPendingCount]);

  // ── Internal: request a sync (respects in-progress state) ──────────
  const requestSync = useCallback(() => {
    if (!enabledRef.current || !tenantIdRef.current) return;

    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Clear any pending retry timer
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    // Reset error retry count on explicit trigger
    errorRetryCountRef.current = 0;

    if (isSyncingRef.current) {
      // Queue the sync request (Req 14.4)
      queuedSyncRef.current = true;
    } else {
      executeSyncCycle();
    }
  }, [executeSyncCycle]);

  // ── Public: trigger sync immediately (bypasses debounce) ───────────
  const triggerSync = useCallback(() => {
    requestSync();
  }, [requestSync]);

  // ── Public: notify that a mutation was written to Outbox ───────────
  const notifyMutation = useCallback(() => {
    // Refresh pending count immediately
    refreshPendingCount();

    if (!enabledRef.current || !tenantIdRef.current) return;

    if (isSyncingRef.current) {
      // Restart debounce timer so new mutation is included in next cycle (Req 14.5)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        if (mountedRef.current && enabledRef.current) {
          // Queue a sync after current completes
          queuedSyncRef.current = true;
        }
      }, DEBOUNCE_MS);
      return;
    }

    // Reset debounce timer (Req 14.1)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (mountedRef.current && enabledRef.current) {
        executeSyncCycle();
      }
    }, DEBOUNCE_MS);
  }, [executeSyncCycle, refreshPendingCount]);

  // ── Effect: visibility change listener (Req 14.2) ──────────────────
  useEffect(() => {
    if (!enabled || !tenantId) return;

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        // Trigger immediate sync on hidden→visible (Req 14.2)
        requestSync();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, tenantId, requestSync]);

  // ── Effect: online event listener (Req 11.4, 14.2) ─────────────────
  useEffect(() => {
    if (!enabled || !tenantId) return;

    function handleOnline() {
      // Trigger immediate sync when coming back online
      if (mountedRef.current) {
        setSyncStatus("idle"); // Clear offline status
        errorRetryCountRef.current = 0; // Reset retries
        requestSync();
      }
    }

    function handleOffline() {
      if (mountedRef.current) {
        setSyncStatus("offline");
        // Clear any pending timers - no point syncing while offline
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
      }
    }

    globalThis.addEventListener("online", handleOnline);
    globalThis.addEventListener("offline", handleOffline);

    // Set initial offline status if not online
    if (!navigator.onLine) {
      setSyncStatus("offline");
    }

    return () => {
      globalThis.removeEventListener("online", handleOnline);
      globalThis.removeEventListener("offline", handleOffline);
    };
  }, [enabled, tenantId, requestSync]);

  // ── Effect: periodic pull to fetch new data from other devices ───────
  useEffect(() => {
    if (!enabled || !tenantId) return;

    const intervalId = setInterval(() => {
      if (!mountedRef.current || !enabledRef.current || !tenantIdRef.current) return;
      // Only pull if we're idle (not already syncing) and online
      if (isSyncingRef.current || !navigator.onLine) return;

      // Trigger a full sync cycle (push + pull) to catch any new remote data
      executeSyncCycle();
    }, PERIODIC_PULL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, tenantId, executeSyncCycle]);

  // ── Effect: initial pending count and status ───────────────────────
  useEffect(() => {
    if (!enabled || !tenantId) {
      setPendingCount(0);
      return;
    }

    refreshPendingCount();

    // Trigger an initial sync on mount to pull any new data from other devices
    // (small delay to avoid racing with other initialization)
    const initialSyncTimer = setTimeout(() => {
      if (mountedRef.current && enabledRef.current && tenantIdRef.current && navigator.onLine) {
        executeSyncCycle();
      }
    }, 500);

    return () => {
      clearTimeout(initialSyncTimer);
    };
  }, [enabled, tenantId, refreshPendingCount, executeSyncCycle]);

  // ── Effect: cleanup on unmount ─────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  return {
    syncStatus,
    lastSyncedAt,
    pendingCount,
    lastPushSucceeded,
    triggerSync,
    notifyMutation,
  };
}
