import { useState } from "react";
import { tenantContextStore, localTenantConfigStore } from "#/lib/indexeddb";
import { localLoginWithReason, cacheServerCredentials } from "#/lib/localTenant";
import { getDeviceFingerprint } from "#/lib/getOrCreateDeviceId";
import { localDb } from "#/db/local-db";
import {
  API_BASE_URL,
  setCurrentDeviceId,
  setAccessToken,
  restoreAuthState,
  getAccessToken,
} from "#/lib/api";
import { issueAndCacheLocalSessionGrant } from "#/lib/localSessionGrant";
import type { TenantSearchResult } from "#/hooks/useServerTenantSearch";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PendingDeviceContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  accountId: string;
}

export interface UseLoginAuthOptions {
  username: string;
  password: string;
  tenantSlug: string;
  selectedServerTenant: TenantSearchResult | null;
  onLoginSuccess: (tenantId: string, role: string) => void;
  onDeviceSetupAuthSuccess: (context: PendingDeviceContext) => void;
}

export interface UseLoginAuthReturn {
  loading: boolean;
  error: string | null;
  handleUnifiedLogin: (e: React.SubmitEvent<HTMLFormElement>) => Promise<void>;
  handleDeviceSetupAuth: (e: React.SubmitEvent<HTMLFormElement>) => Promise<void>;
}

// ── Module-level constants ────────────────────────────────────────────────────

const AUTH_TIMEOUT_MS = 10_000;

// ── Module-private helpers ────────────────────────────────────────────────────

interface LocalLoginResult {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  accountId: string;
  role: string;
}

/**
 * Attempts local login. Returns the result on success, or null if local login
 * failed for a reason other than wrong_tenant. Throws if wrong_tenant so the
 * caller can surface the error immediately.
 */
async function tryLocalLogin(
  username: string,
  password: string,
  effectiveSlug: string | undefined,
  fingerprintId: string,
): Promise<LocalLoginResult | null> {
  const localOutcome = await localLoginWithReason(username, password, effectiveSlug);
  if (!localOutcome.success && localOutcome.reason === "wrong_tenant") {
    throw new Error("wrong_tenant");
  }
  if (!localOutcome.success) return null;

  await tenantContextStore.put({
    tenantId: localOutcome.tenantId,
    tenantSlug: localOutcome.tenantSlug,
    tenantName: localOutcome.tenantName,
    deviceId: fingerprintId,
    accountId: localOutcome.accountId,
    role: localOutcome.role,
    canAccessStation: ["admin", "station"].includes(localOutcome.role),
    terminalId: 0,
    updatedAt: Date.now(),
  });
  setCurrentDeviceId(fingerprintId);
  await restoreAuthState(fingerprintId);

  return {
    tenantId: localOutcome.tenantId,
    tenantSlug: localOutcome.tenantSlug,
    tenantName: localOutcome.tenantName,
    accountId: localOutcome.accountId,
    role: localOutcome.role,
  };
}

/**
 * Attempts server login. Returns parsed response data on success, or throws
 * with an appropriate error message on failure.
 */
async function tryServerLogin(
  username: string,
  password: string,
  effectiveSlug: string | undefined,
  fingerprintHash: string,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  const body: Record<string, unknown> = {
    username,
    password,
    deviceFingerprint: {
      hash: fingerprintHash,
      userAgent: navigator.userAgent,
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      platform: navigator.platform,
    },
  };
  if (effectiveSlug) {
    body.tenantSlug = effectiveSlug;
  }

  const res = await fetch(`${API_BASE_URL}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: "" }));
    const errorMsg = (errorBody?.error ?? "").toLowerCase();
    if (res.status === 401 && errorMsg.includes("inactive")) {
      throw new Error("tenant_inactive");
    }
    if (res.status === 404) {
      throw new Error("tenant_not_found");
    }
    throw new Error("invalid_credentials");
  }

  return res.json() as Promise<Record<string, unknown>>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLoginAuth(options: UseLoginAuthOptions): UseLoginAuthReturn {
  const {
    username,
    password,
    tenantSlug,
    selectedServerTenant,
    onLoginSuccess,
    onDeviceSetupAuthSuccess,
  } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Unified login handler: local-first → server fallback → cache credentials.
   * Works with optional tenantSlug for scoped server login.
   */
  async function handleUnifiedLogin(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const effectiveSlug = selectedServerTenant?.slug ?? (tenantSlug || undefined);
      const fingerprintId = await getDeviceFingerprint();

      // 1. Try local login first (works offline)
      let localResult: LocalLoginResult | null = null;
      try {
        localResult = await tryLocalLogin(username, password, effectiveSlug, fingerprintId);
      } catch (err) {
        if (err instanceof Error && err.message === "wrong_tenant") {
          setError("Akun ini tidak terdaftar di koperasi yang dipilih");
          return;
        }
        throw err;
      }

      if (localResult) {
        // If online and no token yet, try to get a fresh one from server silently
        if (!getAccessToken() && navigator.onLine) {
          try {
            const serverFingerprintHash = await getDeviceFingerprint();
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
            const res = await fetch(`${API_BASE_URL}/api/auth/token`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                username,
                password,
                deviceFingerprint: {
                  hash: serverFingerprintHash,
                  userAgent: navigator.userAgent,
                  // eslint-disable-next-line @typescript-eslint/no-deprecated
                  platform: navigator.platform,
                },
                tenantSlug: effectiveSlug,
              }),
              signal: controller.signal,
            });
            clearTimeout(timeout);
            if (res.ok) {
              const data = await res.json();
              if (data.accessToken) {
                setAccessToken(data.accessToken);
              }
            }
          } catch {
            // Non-critical — sync will work next time user logs in via server
          }
        }

        issueAndCacheLocalSessionGrant(
          localResult.tenantId,
          localResult.accountId,
          fingerprintId,
          localResult.role,
        ).catch(() => {
          // Non-critical — useSessionGrant will handle fallback
        });

        onLoginSuccess(localResult.tenantId, localResult.role);
        return;
      }

      // 2. If offline and local login failed, show appropriate error
      if (!navigator.onLine) {
        setError("Username atau password salah (offline — hanya akun lokal yang tersedia)");
        return;
      }

      // 3. Try server login as fallback (online only)
      let data: Record<string, unknown>;
      try {
        data = await tryServerLogin(username, password, effectiveSlug, fingerprintId);
      } catch (err) {
        if (err instanceof Error) {
          if (err.message === "tenant_inactive") {
            setError("Tenant tidak lagi aktif");
          } else if (err.message === "tenant_not_found") {
            setError("Koperasi tidak ditemukan");
          } else {
            setError("Username atau password salah");
          }
        }
        return;
      }

      // Validate that the server response matches the selected tenant
      if (effectiveSlug && data.tenantSlug !== effectiveSlug) {
        setError("Akun ini bukan milik koperasi yang dipilih");
        return;
      }

      const deviceId = fingerprintId;

      await tenantContextStore.put({
        tenantId: data.tenantId as string,
        tenantSlug: data.tenantSlug as string,
        tenantName: data.tenantName as string,
        deviceId,
        accountId: data.accountId as string,
        role: data.role as string,
        canAccessStation: ["admin", "station"].includes(data.role as string),
        terminalId: 0,
        updatedAt: Date.now(),
      });

      const existingConfig = await localTenantConfigStore.get(data.tenantId as string);
      if (!existingConfig) {
        await localTenantConfigStore.put({
          tenantId: data.tenantId as string,
          slug: data.tenantSlug as string,
          name: data.tenantName as string,
          timezone: "Asia/Jakarta",
          mode: "synced",
          createdAt: Date.now(),
          syncedAt: Date.now(),
          serverTenantId: data.tenantId as string,
        });
      }

      if (data.deviceId) {
        await localDb.deviceInfo.put({
          deviceId: data.deviceId as string,
          tenantId: data.tenantId as string,
          fingerprintHash: fingerprintId,
          registeredAt: Date.now(),
        });
      }

      setCurrentDeviceId(deviceId);

      if (data.accessToken) {
        setAccessToken(data.accessToken as string);
      }

      cacheServerCredentials({
        tenantId: data.tenantId as string,
        tenantSlug: data.tenantSlug as string,
        tenantName: data.tenantName as string,
        accountId: data.accountId as string,
        role: data.role as string,
        username,
        password,
      }).catch(() => {
        // Non-critical — offline replay won't work but login still succeeds
      });

      onLoginSuccess(data.tenantId as string, data.role as string);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Tidak dapat terhubung ke server. Periksa koneksi Anda.");
      } else {
        setError("Gagal terhubung ke server. Periksa koneksi Anda.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDeviceSetupAuth(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Early offline check: device setup requires internet for initial activation
      // Try local login first to see if cached credentials exist
      const localOutcome = await localLoginWithReason(username, password);
      const localResult = localOutcome.success
        ? {
            tenantId: localOutcome.tenantId,
            tenantSlug: localOutcome.tenantSlug,
            tenantName: localOutcome.tenantName,
            accountId: localOutcome.accountId,
            role: localOutcome.role,
          }
        : null;

      if (navigator.onLine === false) {
        // Offline: if no cached credentials, show educative message and skip network
        if (!localResult) {
          setError(
            "Perangkat baru wajib terhubung internet untuk aktivasi awal. Hubungkan ke jaringan WiFi atau data seluler, lalu coba lagi.",
          );
          return;
        }
      }

      // Use local result if available
      let result = localResult;

      // If local fails and online, try server + cache
      if (!result && navigator.onLine) {
        const fingerprintHash = await getDeviceFingerprint();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

        try {
          const res = await fetch(`${API_BASE_URL}/api/auth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              password,
              deviceFingerprint: {
                hash: fingerprintHash,
                userAgent: navigator.userAgent,
                // eslint-disable-next-line @typescript-eslint/no-deprecated
                platform: navigator.platform,
              },
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (res.ok) {
            const data = await res.json();
            // Cache for offline use
            await cacheServerCredentials({
              tenantId: data.tenantId,
              tenantSlug: data.tenantSlug,
              tenantName: data.tenantName,
              accountId: data.accountId,
              role: data.role,
              username,
              password,
            });
            result = {
              tenantId: data.tenantId,
              tenantSlug: data.tenantSlug,
              tenantName: data.tenantName,
              accountId: data.accountId,
              role: data.role,
            };
          }
        } catch {
          clearTimeout(timeout);
        }
      }

      if (!result) {
        setError("Username atau password salah");
        return;
      }
      if (!["admin", "station"].includes(result.role)) {
        setError("Diperlukan akun admin atau station untuk mengkonfigurasi perangkat");
        return;
      }

      onDeviceSetupAuthSuccess({
        tenantId: result.tenantId,
        tenantSlug: result.tenantSlug,
        tenantName: result.tenantName,
        accountId: result.accountId,
      });
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    error,
    handleUnifiedLogin,
    handleDeviceSetupAuth,
  };
}
