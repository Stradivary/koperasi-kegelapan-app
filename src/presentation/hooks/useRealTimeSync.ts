/**
 * useRealTimeSync — manages the RealTimeSyncManager lifecycle within
 * the authenticated tenant layout.
 *
 * Responsibilities:
 * - Perform full data pull on login (fullSyncOnLogin)
 * - Establish SSE connection after full sync completes
 * - Register card_status_change event handler for admin block propagation
 * - Disconnect on logout / unmount
 *
 * @see Requirements 8.1, 8.2, 5.2, 5.4
 */

import { useEffect, useRef } from "react";
import {
  connect,
  disconnect,
  fullSyncOnLogin,
  onEvent,
  isConnected,
} from "#/infrastructure/api/realTimeSync";
import { API_BASE_URL, getCurrentDeviceId } from "#/infrastructure/api/apiClient";

// ── Types ──────────────────────────────────────────────────────────────

export interface UseRealTimeSyncOptions {
  /** The active tenant ID. Pass null/undefined to disable. */
  tenantId: string | null | undefined;
  /** Whether the user is authenticated and sync should be active. */
  enabled?: boolean;
}

// ── Hook ───────────────────────────────────────────────────────────────

/**
 * Hook that orchestrates the RealTimeSyncManager lifecycle.
 *
 * On mount (when enabled + tenantId is set):
 * 1. Calls fullSyncOnLogin(tenantId) to pull all data
 * 2. After full sync: calls connect() to establish SSE
 * 3. Registers a card_status_change event handler (handled internally by RealTimeSyncManager)
 *
 * On unmount or when disabled:
 * - Calls disconnect() to tear down SSE and cleanup
 *
 * @param options - Configuration for the hook
 */
export function useRealTimeSync({ tenantId, enabled = true }: UseRealTimeSyncOptions): void {
  const initializedRef = useRef(false);
  const mountedRef = useRef(true);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled || !tenantId) {
      // If previously connected, disconnect
      if (initializedRef.current) {
        disconnect();
        initializedRef.current = false;
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      return;
    }

    // Avoid re-initializing if already connected for this tenant
    if (initializedRef.current && isConnected()) {
      return;
    }

    let aborted = false;

    async function initRealTimeSync() {
      if (!tenantId) return;

      try {
        // Step 1: Full data pull on login (Requirement 8.1)
        await fullSyncOnLogin(tenantId);

        if (aborted || !mountedRef.current) return;

        // Step 2: Establish SSE connection after full sync (Requirement 8.2)
        const deviceId = getCurrentDeviceId() ?? "unknown";
        const sseUrl = `${API_BASE_URL}/api/sync/sse`;

        connect({
          tenantId,
          deviceId,
          sseUrl,
        });

        initializedRef.current = true;

        // Step 3: Register card_status_change event handler (Requirements 5.2, 5.4)
        // The RealTimeSyncManager already handles card_status_change internally
        // (updates IndexedDB + invalidates TanStack Query caches).
        // We register an additional handler here for any UI-level notifications
        // or logging that may be needed at the app layer.
        unsubscribeRef.current = onEvent("card_status_change", () => {
          // The internal handler in realTimeSync.ts already:
          // - Updates the card status in IndexedDB
          // - Invalidates TanStack Query caches
          // This handler is a hook point for future UI notifications (e.g., toast).
        });
      } catch {
        // fullSyncOnLogin failed after all retries — SSE won't be established.
        // The periodic pull fallback in RealTimeSyncManager won't activate
        // since connect() was never called. The standard sync engine (useSyncEngine)
        // will continue to handle push/pull cycles independently.
        // eslint-disable-next-line no-console
        console.warn("[useRealTimeSync] Full sync on login failed. SSE not established.");
      }
    }

    initRealTimeSync();

    return () => {
      aborted = true;
      mountedRef.current = false;

      // Disconnect on cleanup (logout / unmount)
      if (initializedRef.current) {
        disconnect();
        initializedRef.current = false;
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [tenantId, enabled]);
}
