/**
 * SyncEngineContext provides the sync engine's notifyMutation callback
 * to all authenticated tenant views, enabling Outbox writes to trigger
 * the sync debounce timer.
 *
 * Also wires the PeerSyncCoordinator to the sync engine so that
 * notifyCheckin() can trigger immediate sync pushes (bypass 5s debounce).
 *
 * Initializes the RealTimeSyncManager for SSE-based real-time updates
 * (full sync on login, SSE connection, card_status_change propagation).
 *
 * @see Requirements 11.4, 14.1, 14.2, 9.1, 9.2, 8.1, 8.2, 5.2, 5.4
 */

import { createContext, useContext, useEffect } from "react";
import { useSyncEngine, type UseSyncEngineReturn } from "./useSyncEngine";
import { registerTriggerSync, setActiveTenantId } from "#/infrastructure/sync/peerSyncCoordinator";

// ── Context ────────────────────────────────────────────────────────────

const SyncEngineContext = createContext<UseSyncEngineReturn | null>(null);

// ── Provider ───────────────────────────────────────────────────────────

interface SyncEngineProviderProps {
  tenantId: string | null | undefined;
  enabled?: boolean;
  children: React.ReactNode;
}

/**
 * Wraps child components with a sync engine instance.
 * Initialize once at the tenant layout level so all authenticated views
 * share the same sync engine lifecycle.
 *
 * Wires PeerSyncCoordinator's triggerSync callback and active tenant ID
 * so that notifyCheckin() can bypass the 5s debounce and push immediately.
 *
 * Also manages the RealTimeSyncManager lifecycle:
 * - Full data pull on login (Req 8.1)
 * - SSE connection for real-time updates (Req 8.2)
 * - card_status_change event handling (Req 5.2, 5.4)
 * - Disconnect on logout/unmount
 */
export function SyncEngineProvider({
  tenantId,
  enabled = true,
  children,
}: Readonly<SyncEngineProviderProps>) {
  const syncEngine = useSyncEngine(tenantId, enabled);

  // Wire PeerSyncCoordinator to the sync engine's triggerSync (Req 9.1, 9.2)
  useEffect(() => {
    if (enabled && tenantId) {
      setActiveTenantId(tenantId);
      registerTriggerSync(syncEngine.triggerSync);
    }

    return () => {
      // Cleanup on unmount or when tenant/enabled changes
      setActiveTenantId(null);
      registerTriggerSync(null);
    };
  }, [tenantId, enabled, syncEngine.triggerSync]);

  return <SyncEngineContext.Provider value={syncEngine}>{children}</SyncEngineContext.Provider>;
}

// ── Consumer hook ──────────────────────────────────────────────────────

/**
 * Access the sync engine from any child component within the tenant layout.
 * Returns null if used outside a SyncEngineProvider (e.g., unauthenticated views).
 */
export function useSyncEngineContext(): UseSyncEngineReturn | null {
  return useContext(SyncEngineContext);
}
