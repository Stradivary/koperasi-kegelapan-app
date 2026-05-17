import { useCallback, useRef, useState } from "react";
import { localTenantConfigStore, type LocalTenantConfig } from "../lib/indexeddb";

export type SyncStatus = "idle" | "syncing" | "success" | "conflict" | "error";

export interface SyncConflict {
  conflictType: "slug_and_admin" | "slug_only" | "admin_only";
  existingTenantName: string;
  existingSlug: string;
}

export interface UseTenantSyncReturn {
  status: SyncStatus;
  conflict: SyncConflict | null;
  error: string | null;
  syncToServer: (config: LocalTenantConfig, adminPassword: string) => Promise<void>;
  reset: () => void;
}

export function useTenantSync(): UseTenantSyncReturn {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [conflict, setConflict] = useState<SyncConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<SyncStatus>("idle");

  const syncToServer = useCallback(
    async (config: LocalTenantConfig, adminPassword: string): Promise<void> => {
      // Ignore duplicate calls while syncing
      if (statusRef.current === "syncing") return;

      statusRef.current = "syncing";
      setStatus("syncing");
      setConflict(null);
      setError(null);

      try {
        const res = await fetch("/api/tenants/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: config.slug,
            name: config.name,
            timezone: config.timezone,
            adminUsername: config.slug + "-admin",
            adminPasswordHash: adminPassword,
          }),
        });

        if (res.status === 201) {
          const data = await res.json();

          // Update LocalTenantConfig in IndexedDB
          const updatedConfig: LocalTenantConfig = {
            ...config,
            mode: "synced",
            syncedAt: Date.now(),
            serverTenantId: data.tenantId,
          };
          await localTenantConfigStore.put(updatedConfig);

          statusRef.current = "success";
          setStatus("success");
        } else if (res.status === 409) {
          const data = await res.json();
          const syncConflict: SyncConflict = {
            conflictType: data.conflictType,
            existingTenantName: data.existingTenantName,
            existingSlug: data.existingSlug,
          };
          statusRef.current = "conflict";
          setStatus("conflict");
          setConflict(syncConflict);
        } else {
          statusRef.current = "error";
          setStatus("error");
          setError("Gagal menyinkronkan tenant ke server. Silakan coba lagi.");
        }
      } catch {
        statusRef.current = "error";
        setStatus("error");
        setError("Tidak dapat terhubung ke server. Periksa koneksi internet Anda.");
      }
    },
    [],
  );

  const reset = useCallback(() => {
    statusRef.current = "idle";
    setStatus("idle");
    setConflict(null);
    setError(null);
  }, []);

  return { status, conflict, error, syncToServer, reset };
}
