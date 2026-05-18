import { useCallback, useRef, useState } from "react";
import {
  localTenantConfigStore,
  localAccountStore,
  type LocalTenantConfig,
} from "../lib/indexeddb";
import { API_BASE_URL } from "../lib/api";

export type SyncStatus = "idle" | "syncing" | "success" | "conflict" | "error";

export interface SyncConflict {
  conflictType: "slug_and_admin" | "slug_only" | "admin_only";
  existingTenantName: string;
  existingSlug: string;
  /** Current slug being synced (for editing in conflict dialog) */
  currentSlug: string;
  /** Current admin username being synced (for editing in conflict dialog) */
  currentAdminUsername: string;
}

export interface UseTenantSyncReturn {
  status: SyncStatus;
  conflict: SyncConflict | null;
  error: string | null;
  syncToServer: (config: LocalTenantConfig, adminPassword: string) => Promise<void>;
  /** Retry sync with a new slug and/or admin username after conflict */
  retryWithChanges: (newSlug: string, newAdminUsername: string) => Promise<void>;
  reset: () => void;
}

export function useTenantSync(): UseTenantSyncReturn {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [conflict, setConflict] = useState<SyncConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<SyncStatus>("idle");

  // Keep last sync params for retry
  const lastConfigRef = useRef<LocalTenantConfig | null>(null);
  const lastPasswordRef = useRef<string>("");

  const performSync = useCallback(
    async (
      config: LocalTenantConfig,
      adminPasswordHash: string,
      slugOverride?: string,
      adminUsernameOverride?: string,
    ): Promise<void> => {
      // Ignore duplicate calls while syncing
      if (statusRef.current === "syncing") return;

      statusRef.current = "syncing";
      setStatus("syncing");
      setConflict(null);
      setError(null);

      // Store for potential retry
      lastConfigRef.current = config;
      lastPasswordRef.current = adminPasswordHash;

      try {
        // Resolve the actual admin username from IndexedDB instead of hardcoding
        const accounts = await localAccountStore.getByTenant(config.tenantId);
        const admin = accounts.find((a) => a.role === "admin");
        const adminUsername = adminUsernameOverride ?? admin?.username ?? config.slug + "-admin";
        const slug = slugOverride ?? config.slug;

        const res = await fetch(`${API_BASE_URL}/api/tenants/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            name: config.name,
            timezone: config.timezone,
            adminUsername,
            adminPasswordHash,
            // Send serverTenantId so the server can identify re-syncs from the same tenant
            serverTenantId: config.serverTenantId ?? undefined,
            localTenantId: config.tenantId,
          }),
        });

        if (res.status === 201 || res.status === 200) {
          const data = await res.json();

          // Update LocalTenantConfig in IndexedDB with new slug if changed
          const updatedConfig: LocalTenantConfig = {
            ...config,
            slug,
            mode: "synced",
            syncedAt: Date.now(),
            serverTenantId: data.tenantId ?? config.serverTenantId,
          };
          await localTenantConfigStore.put(updatedConfig);

          // Update admin username in IndexedDB if it was changed
          if (admin && admin.username !== adminUsername) {
            await localAccountStore.put({ ...admin, username: adminUsername });
          }

          statusRef.current = "success";
          setStatus("success");
        } else if (res.status === 409) {
          const data = await res.json();
          const syncConflict: SyncConflict = {
            conflictType: data.conflictType,
            existingTenantName: data.existingTenantName,
            existingSlug: data.existingSlug,
            currentSlug: slug,
            currentAdminUsername: adminUsername,
          };
          statusRef.current = "conflict";
          setStatus("conflict");
          setConflict(syncConflict);
        } else if (res.status === 400) {
          // Parse validation errors from server for actionable feedback
          const data = await res.json().catch(() => null);
          let msg = "Data tenant tidak valid.";
          if (data?.errors?.length > 0) {
            const fields = data.errors.map((e: { field: string; message: string }) => e.message);
            msg = fields.join("; ");
          }
          statusRef.current = "error";
          setStatus("error");
          setError(msg);
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

  const syncToServer = useCallback(
    async (config: LocalTenantConfig, adminPassword: string): Promise<void> => {
      await performSync(config, adminPassword);
    },
    [performSync],
  );

  const retryWithChanges = useCallback(
    async (newSlug: string, newAdminUsername: string): Promise<void> => {
      const config = lastConfigRef.current;
      const password = lastPasswordRef.current;
      if (!config) {
        setError("Tidak ada data sync sebelumnya untuk dicoba ulang.");
        return;
      }
      await performSync(config, password, newSlug, newAdminUsername);
    },
    [performSync],
  );

  const reset = useCallback(() => {
    statusRef.current = "idle";
    setStatus("idle");
    setConflict(null);
    setError(null);
  }, []);

  return { status, conflict, error, syncToServer, retryWithChanges, reset };
}
