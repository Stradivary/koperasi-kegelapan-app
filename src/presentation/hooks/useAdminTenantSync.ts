/**
 * Hook that provides "Sync to Server" functionality for admin layout routes.
 * Returns onSyncToServer callback and isSyncingToServer state only when
 * the tenant is local-only (mode !== "synced").
 *
 * For local-only tenants, orchestrates the full push sequence in strict order:
 *   tenant sync → push members → push cards → push transactions
 * Each step waits for server confirmation before proceeding.
 * If any step fails, the sequence halts and the error is surfaced.
 *
 * Already-synced tenants are unaffected and continue to use existing behavior.
 */

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LocalTenantConfig } from "#/infrastructure/persistence/dexie/indexeddb";
import { getIndexedDb } from "#/infrastructure/persistence/dexie/indexeddb.lazy";
import { useTenantSync, type SyncConflict } from "./useTenantSync";
import { syncPushMembers, syncPushCards } from "#/application/sync/syncPushEntities.usecase";
import { syncPush } from "#/application/sync/syncPush.usecase";
import { toast } from "sonner";

export type SyncStep =
  | "syncing-tenant"
  | "pushing-members"
  | "pushing-cards"
  | "pushing-transactions"
  | "complete";

export interface UseAdminTenantSyncReturn {
  /** Callback to trigger sync - undefined if tenant is already synced */
  onSyncToServer: (() => void) | undefined;
  /** Whether the sync is currently in progress */
  isSyncingToServer: boolean;
  /** Current step in the sync sequence (for progress tracking) */
  syncStep: SyncStep | null;
  /** Error message if any step in the sequence failed */
  syncError: string | null;
  /** Conflict data when server returns a 409 slug/admin conflict */
  syncConflict: SyncConflict | null;
  /** Retry the tenant sync with a new slug and/or admin username */
  retryWithChanges: (newSlug: string, newAdminUsername: string) => Promise<void>;
  /** Reset conflict/error state */
  resetSync: () => void;
}

export function useAdminTenantSync(tenantId: string): UseAdminTenantSyncReturn {
  const [localConfig, setLocalConfig] = useState<LocalTenantConfig | null>(null);
  const [syncStep, setSyncStep] = useState<SyncStep | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { status, conflict, syncToServer, retryWithChanges, reset } = useTenantSync();
  const queryClient = useQueryClient();

  useEffect(() => {
    getIndexedDb().then(({ localTenantConfigStore }) =>
      localTenantConfigStore.get(tenantId).then((cfg) => {
        setLocalConfig(cfg ?? null);
      }),
    );
  }, [tenantId]);

  const handleSyncToServer = useCallback(async () => {
    if (!localConfig) return;

    // Reset state
    setSyncStep(null);
    setSyncError(null);

    const { localAccountStore, localTenantConfigStore } = await getIndexedDb();
    // Get admin account's password hash for the sync request
    const accounts = await localAccountStore.getByTenant(tenantId);
    const admin = accounts.find((a) => a.role === "admin");
    if (!admin) {
      console.warn("[AdminTenantSync] No admin account found for tenant", tenantId);
      setSyncError("No admin account found for this tenant");
      return;
    }

    // Only local-only tenants get the full orchestrated sequence
    if (localConfig.mode === "local") {
      try {
        // Step 1: Sync tenant to server (register it)
        setSyncStep("syncing-tenant");
        const result = await syncToServer(localConfig, admin.passwordHash);

        // Verify we got an access token back - required for subsequent push calls
        if (!result.accessToken) {
          // syncToServer handles conflict/error states internally via useTenantSync
          // If no token returned, it means sync didn't succeed (conflict, error, etc.)
          setSyncStep(null);
          return;
        }

        // Step 2: Push members
        setSyncStep("pushing-members");
        await syncPushMembers(tenantId);

        // Step 3: Push cards
        setSyncStep("pushing-cards");
        await syncPushCards(tenantId);

        // Step 4: Push transactions
        setSyncStep("pushing-transactions");
        await syncPush(tenantId);

        // All steps completed successfully
        setSyncStep("complete");
        toast.success("Tenant berhasil disinkronkan ke server");

        // Invalidate queries so UI reflects server state
        queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
        queryClient.invalidateQueries({ queryKey: ["station-cards", tenantId] });
        queryClient.invalidateQueries({ queryKey: ["transactions", tenantId] });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error("[AdminTenantSync] Orchestrated sync failed:", errorMsg);
        setSyncError(errorMsg);
        toast.error("Gagal menyinkronkan ke server", {
          description: errorMsg.length > 100 ? errorMsg.slice(0, 100) + "..." : errorMsg,
        });
        // syncStep remains at the step that failed, providing context
        return;
      }
    } else {
      // Already-synced tenants use existing behavior (just sync tenant)
      await syncToServer(localConfig, admin.passwordHash);
    }

    // Refresh config after sync
    const updated = await localTenantConfigStore.get(tenantId);
    setLocalConfig(updated ?? null);
  }, [localConfig, tenantId, syncToServer]);

  // Only show the button if tenant is local-only (not yet synced to server)
  const isLocalOnly = localConfig?.mode === "local";

  return {
    onSyncToServer: isLocalOnly ? handleSyncToServer : undefined,
    isSyncingToServer: status === "syncing" || (syncStep !== null && syncStep !== "complete"),
    syncStep,
    syncError,
    syncConflict: conflict,
    retryWithChanges,
    resetSync: reset,
  };
}
