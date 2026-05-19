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
import { syncPush } from "../lib/syncPush";
import { syncPull } from "../lib/syncPull";
import { isDeviceBlocked } from "../lib/deviceBlock";
import { getSyncableEntries } from "../lib/transactionLogService";

// ── Types ──────────────────────────────────────────────────────────────

export type SyncEngineStatus = "idle" | "pushing" | "pulling" | "error" | "offline";

export interface SyncEngineState {
  /** Current sync status */
  syncStatus: SyncEngineStatus;
  /** Timestamp of last successful sync completion (epoch ms), or null if never synced */
  lastSyncedAt: number | null;
  /** Number of pending Outbox entries awaiting push */
  pendingCount: number;
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

/** Maximum consecutive error retries before giving up */
const MAX_ERROR_RETRIES = 5;

/** Initial retry backoff in milliseconds */
const INITIAL_RETRY_BACKOFF_MS = 1000;

/** Maximum retry backoff in milliseconds */
const MAX_RETRY_BACKOFF_MS = 60_000;

// ── Hook ───────────────────────────────────────────────────────────────

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
      const entries = await getSyncableEntries(tenantIdRef.current);
      if (mountedRef.current) {
        setPendingCount(entries.length);
      }
    } catch {
      // Non-critical — don't break the hook if IndexedDB read fails
    }
  }, []);

  // ── Internal: execute a sync cycle ─────────────────────────────────
  const executeSyncCycle = useCallback(async () => {
    const tid = tenantIdRef.current;
    if (!tid || !enabledRef.current) return;

    // Pre-checks
    if (isDeviceBlocked()) {
      if (mountedRef.current) setSyncStatus("offline");
      return;
    }

    if (!navigator.onLine) {
      if (mountedRef.current) setSyncStatus("offline");
      return;
    }

    // Mark as syncing
    isSyncingRef.current = true;
    queuedSyncRef.current = false;

    try {
      // Phase 1: Push
      if (mountedRef.current) setSyncStatus("pushing");

      await syncPush(tid);

      // Phase 2: Pull (always run after push; required if pullNeeded)
      if (mountedRef.current) setSyncStatus("pulling");

      await syncPull(tid);

      // Success
      const now = Date.now();
      if (mountedRef.current) {
        setLastSyncedAt(now);
        setSyncStatus("idle");
        errorRetryCountRef.current = 0;
      }
    } catch {
      if (mountedRef.current) {
        setSyncStatus("error");
        errorRetryCountRef.current += 1;

        // Schedule retry with exponential backoff if under max retries
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
        }
        // If max retries exhausted, remain in "error" status (Req 11.6)
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
        // Clear any pending timers — no point syncing while offline
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

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Set initial offline status if not online
    if (!navigator.onLine) {
      setSyncStatus("offline");
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [enabled, tenantId, requestSync]);

  // ── Effect: initial pending count and status ───────────────────────
  useEffect(() => {
    if (!enabled || !tenantId) {
      setPendingCount(0);
      return;
    }

    refreshPendingCount();
  }, [enabled, tenantId, refreshPendingCount]);

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
    triggerSync,
    notifyMutation,
  };
}
