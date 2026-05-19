/**
 * SyncEngineContext provides the sync engine's notifyMutation callback
 * to all authenticated tenant views, enabling Outbox writes to trigger
 * the sync debounce timer.
 *
 * @see Requirements 11.4, 14.1, 14.2
 */

import { createContext, useContext } from "react";
import { useSyncEngine, type UseSyncEngineReturn } from "./useSyncEngine";

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
 */
export function SyncEngineProvider({
  tenantId,
  enabled = true,
  children,
}: SyncEngineProviderProps) {
  const syncEngine = useSyncEngine(tenantId, enabled);

  return (
    <SyncEngineContext.Provider value={syncEngine}>
      {children}
    </SyncEngineContext.Provider>
  );
}

// ── Consumer hook ──────────────────────────────────────────────────────

/**
 * Access the sync engine from any child component within the tenant layout.
 * Returns null if used outside a SyncEngineProvider (e.g., unauthenticated views).
 */
export function useSyncEngineContext(): UseSyncEngineReturn | null {
  return useContext(SyncEngineContext);
}
