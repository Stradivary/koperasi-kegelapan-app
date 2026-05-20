/**
 * Hook that provides "Sync to Server" functionality for admin layout routes.
 * Returns onSyncToServer callback and isSyncingToServer state only when
 * the tenant is local-only (mode !== "synced").
 *
 * After a successful tenant sync, the server returns an access token
 * which is automatically stored for subsequent API calls.
 */

import { useCallback, useEffect, useState } from "react";
import {
  localTenantConfigStore,
  localAccountStore,
  type LocalTenantConfig,
} from "../lib/indexeddb";
import { useTenantSync } from "./useTenantSync";

export interface UseAdminTenantSyncReturn {
  /** Callback to trigger sync — undefined if tenant is already synced */
  onSyncToServer: (() => void) | undefined;
  /** Whether the sync is currently in progress */
  isSyncingToServer: boolean;
}

export function useAdminTenantSync(tenantId: string): UseAdminTenantSyncReturn {
  const [localConfig, setLocalConfig] = useState<LocalTenantConfig | null>(null);
  const { status, syncToServer } = useTenantSync();

  useEffect(() => {
    localTenantConfigStore.get(tenantId).then((cfg) => {
      setLocalConfig(cfg ?? null);
    });
  }, [tenantId]);

  const handleSyncToServer = useCallback(async () => {
    if (!localConfig) return;

    // Get admin account's password hash for the sync request
    const accounts = await localAccountStore.getByTenant(tenantId);
    const admin = accounts.find((a) => a.role === "admin");
    if (!admin) {
      console.warn("[AdminTenantSync] No admin account found for tenant", tenantId);
      return;
    }

    await syncToServer(localConfig, admin.passwordHash);

    // Refresh config after sync
    const updated = await localTenantConfigStore.get(tenantId);
    setLocalConfig(updated ?? null);
  }, [localConfig, tenantId, syncToServer]);

  // Only show the button if tenant is local-only (not yet synced to server)
  const isLocalOnly = localConfig?.mode === "local";

  return {
    onSyncToServer: isLocalOnly ? handleSyncToServer : undefined,
    isSyncingToServer: status === "syncing",
  };
}
