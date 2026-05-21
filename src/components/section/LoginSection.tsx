import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { tenantContextStore, localTenantConfigStore } from "../../lib/indexeddb";
import { localLogin, cacheServerCredentials } from "../../lib/localTenant";
import { getDeviceFingerprint } from "../../lib/getOrCreateDeviceId";
import { localDb } from "../../db/local-db";
import { BRAND } from "../../lib/brand";
import {
  API_BASE_URL,
  setCurrentDeviceId,
  setAccessToken,
  restoreAuthState,
  getAccessToken,
} from "../../lib/api";
import { issueAndCacheLocalSessionGrant } from "../../lib/localSessionGrant";
import { DeviceRoleSelectionPanel } from "../block/loginSection/DeviceRoleSelectionPanel";
import { DeviceSetupAuthPanel } from "../block/loginSection/DeviceSetupAuthPanel";
import { LoginFormPanel } from "../block/loginSection/LoginFormPanel";
import { ServerBrowsePanel } from "../block/loginSection/ServerBrowsePanel";
import { LocalSetupSection } from "./LocalSetupSection";
import { useServerTenantSearch, type TenantSearchResult } from "../../hooks/useServerTenantSearch";
import { LoadingState } from "../block/LoadingState";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";

type LoginMode = "detecting" | "login" | "setup" | "device-setup" | "server-browse";
type DeviceSetupStep = "auth" | "pick-role";

const NO_AUTH_ROLES = ["gate", "terminal", "scout"] as const;
const AUTH_TIMEOUT_MS = 10_000;

export function LoginSection() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoginMode>("detecting");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Device setup state
  const [setupStep, setSetupStep] = useState<DeviceSetupStep>("auth");
  const [pendingContext, setPendingContext] = useState<{
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    accountId: string;
  } | null>(null);

  // Server browse state (for "Hubungkan ke Server" flow)
  const [selectedServerTenant, setSelectedServerTenant] = useState<TenantSearchResult | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const {
    query: serverTenantQuery,
    setQuery: setServerTenantQuery,
    results: serverTenantResults,
    loading: serverTenantLoading,
    error: serverTenantError,
  } = useServerTenantSearch();
  const { isOnline } = useOnlineStatus();

  useEffect(() => {
    async function detectMode() {
      // Auto-boot: if this device already has an active session, redirect back
      const contexts = await tenantContextStore.getAll();
      if (contexts.length > 0) {
        // Prefer no-auth roles (dedicated devices), then fall back to most recent context
        const noAuthCtx = contexts.find((c) =>
          (NO_AUTH_ROLES as readonly string[]).includes(c.role),
        );
        const activeCtx =
          noAuthCtx ?? contexts.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
        if (activeCtx) {
          // Restore deviceId and access token from IndexedDB
          if (activeCtx.deviceId) {
            await restoreAuthState(activeCtx.deviceId);
          }
          const roleRoutes: Record<string, string> = {
            terminal: `/tenant/${activeCtx.tenantId}/terminal`,
            gate: `/tenant/${activeCtx.tenantId}/gate`,
            kiosk: `/tenant/${activeCtx.tenantId}/kiosk`,
            scout: `/tenant/${activeCtx.tenantId}/scout`,
            station: `/tenant/${activeCtx.tenantId}/station`,
            admin: `/tenant/${activeCtx.tenantId}/admin`,
          };
          navigate({ to: roleRoutes[activeCtx.role] ?? "/", replace: true });
          return;
        }
      }

      setMode("login");
    }
    detectMode();
  }, [navigate]);

  function redirectToRole(tenantId: string, role: string) {
    const roleRoutes: Record<string, string> = {
      terminal: `/tenant/${tenantId}/terminal`,
      gate: `/tenant/${tenantId}/gate`,
      kiosk: `/tenant/${tenantId}/kiosk`,
      scout: `/tenant/${tenantId}/scout`,
      station: `/tenant/${tenantId}/station`,
      admin: `/tenant/${tenantId}/admin`,
    };
    navigate({ to: roleRoutes[role] ?? "/" });
  }

  function enterDeviceSetup() {
    setError(null);
    setUsername("");
    setPassword("");
    setSetupStep("auth");
    setPendingContext(null);
    setMode("device-setup");
  }

  /**
   * Unified login handler: local-first → server fallback → cache credentials.
   * Works with optional tenantSlug for scoped server login.
   */
  async function handleUnifiedLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Try local login first (works offline)
      const effectiveSlug = selectedServerTenant?.slug ?? (tenantSlug || undefined);
      const localResult = await localLogin(username, password, effectiveSlug);
      if (localResult) {
        const fingerprintId = await getDeviceFingerprint();
        await tenantContextStore.put({
          tenantId: localResult.tenantId,
          tenantSlug: localResult.tenantSlug,
          tenantName: localResult.tenantName,
          deviceId: fingerprintId,
          accountId: localResult.accountId,
          role: localResult.role,
          terminalId: 0,
          updatedAt: Date.now(),
        });
        setCurrentDeviceId(fingerprintId);

        // Restore access token from IndexedDB/localStorage so sync works
        // (token was saved during the original server login)
        await restoreAuthState(fingerprintId);

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

        // Pre-generate and cache session grant so it's available immediately
        // when the role page loads (avoids race with useSessionGrant hook)
        issueAndCacheLocalSessionGrant(
          localResult.tenantId,
          localResult.accountId,
          fingerprintId,
          localResult.role,
        ).catch(() => {
          // Non-critical — useSessionGrant will handle fallback
        });

        redirectToRole(localResult.tenantId, localResult.role);
        return;
      }

      // 2. If offline and local login failed, show appropriate error
      if (!navigator.onLine) {
        setError("Username atau password salah (offline — hanya akun lokal yang tersedia)");
        return;
      }

      // 3. Try server login as fallback (online only)
      const fingerprintHash = await getDeviceFingerprint();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

      const body: Record<string, unknown> = {
        username,
        password,
        deviceFingerprint: {
          hash: fingerprintHash,
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        },
      };

      // Scope to tenant slug if provided (from server browse or manual input)
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

      if (res.ok) {
        const data = await res.json();

        // Validate that the server response matches the selected tenant
        if (effectiveSlug && data.tenantSlug !== effectiveSlug) {
          setError("Akun ini bukan milik koperasi yang dipilih");
          return;
        }

        const deviceId = fingerprintHash;

        // Store tenant context
        await tenantContextStore.put({
          tenantId: data.tenantId,
          tenantSlug: data.tenantSlug,
          tenantName: data.tenantName,
          deviceId,
          accountId: data.accountId,
          role: data.role,
          terminalId: 0,
          updatedAt: Date.now(),
        });

        // Ensure LocalTenantConfig exists for sync/offline operations
        const existingConfig = await localTenantConfigStore.get(data.tenantId);
        if (!existingConfig) {
          await localTenantConfigStore.put({
            tenantId: data.tenantId,
            slug: data.tenantSlug,
            name: data.tenantName,
            timezone: "Asia/Jakarta",
            mode: "synced",
            createdAt: Date.now(),
            syncedAt: Date.now(),
            serverTenantId: data.tenantId,
          });
        }

        // Store device registration info in Dexie for sync engine use
        if (data.deviceId) {
          await localDb.deviceInfo.put({
            deviceId: data.deviceId,
            tenantId: data.tenantId,
            fingerprintHash,
            registeredAt: Date.now(),
          });
        }

        setCurrentDeviceId(deviceId);

        if (data.accessToken) {
          setAccessToken(data.accessToken);
        }

        // Cache credentials locally for offline replay (fire-and-forget)
        cacheServerCredentials({
          tenantId: data.tenantId,
          tenantSlug: data.tenantSlug,
          tenantName: data.tenantName,
          accountId: data.accountId,
          role: data.role,
          username,
          password,
        }).catch(() => {
          // Non-critical — offline replay won't work but login still succeeds
        });

        redirectToRole(data.tenantId, data.role);
        return;
      }

      // Handle error responses
      const errorBody = await res.json().catch(() => ({ error: "" }));
      const errorMsg = (errorBody?.error ?? "").toLowerCase();

      if (res.status === 401 && errorMsg.includes("inactive")) {
        setError("Tenant tidak lagi aktif");
      } else if (res.status === 404) {
        setError("Koperasi tidak ditemukan");
      } else {
        setError("Username atau password salah");
      }
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

  async function handleDeviceSetupAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Early offline check: device setup requires internet for initial activation
      // Try local login first to see if cached credentials exist
      const localResult = await localLogin(username, password);

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
      setPendingContext({
        tenantId: result.tenantId,
        tenantSlug: result.tenantSlug,
        tenantName: result.tenantName,
        accountId: result.accountId,
      });
      setSetupStep("pick-role");
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePickDeviceRole(role: "gate" | "terminal" | "scout") {
    if (!pendingContext) return;
    const fingerprintId = await getDeviceFingerprint();
    await tenantContextStore.put({
      ...pendingContext,
      deviceId: fingerprintId,
      role,
      terminalId: 0,
      updatedAt: Date.now(),
    });
    setCurrentDeviceId(fingerprintId);

    // Pre-generate and cache session grant for the device role
    issueAndCacheLocalSessionGrant(
      pendingContext.tenantId,
      pendingContext.accountId,
      fingerprintId,
      role,
    ).catch(() => {
      // Non-critical — useSessionGrant will handle fallback
    });

    redirectToRole(pendingContext.tenantId, role);
  }

  if (mode === "detecting") {
    return <LoadingState variant="page" />;
  }

  if (mode === "setup") {
    return (
      <LocalSetupSection
        onComplete={(tenantId, role) => {
          redirectToRole(tenantId, role);
        }}
        onBack={() => {
          setMode("login");
          setError(null);
        }}
      />
    );
  }

  if (mode === "server-browse") {
    return (
      <ServerBrowsePanel
        query={serverTenantQuery}
        results={serverTenantResults}
        loading={serverTenantLoading}
        error={serverTenantError}
        isOnline={isOnline}
        onQueryChange={setServerTenantQuery}
        onSelect={(tenant) => {
          setSelectedServerTenant(tenant);
          setTenantSlug(tenant.slug);
          setUsername("");
          setPassword("");
          setError(null);
          setMode("login");
          // Focus password after render
          setTimeout(() => passwordRef.current?.focus(), 100);
        }}
        onBack={() => {
          setMode("login");
          setError(null);
        }}
      />
    );
  }

  if (mode === "device-setup") {
    if (setupStep === "pick-role") {
      return (
        <DeviceRoleSelectionPanel
          onSelectRole={handlePickDeviceRole}
          onBack={() => {
            setSetupStep("auth");
            setPendingContext(null);
          }}
        />
      );
    }

    // setupStep === 'auth'
    return (
      <DeviceSetupAuthPanel
        username={username}
        password={password}
        error={error}
        loading={loading}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onSubmit={handleDeviceSetupAuth}
        onCancel={() => setMode("login")}
      />
    );
  }

  return (
    <LoginFormPanel
      username={username}
      password={password}
      tenantSlug={tenantSlug}
      error={error}
      loading={loading}
      selectedServerTenant={selectedServerTenant}
      appName={BRAND.APP_NAME}
      byline={BRAND.BYLINE}
      passwordRef={passwordRef}
      onUsernameChange={setUsername}
      onPasswordChange={setPassword}
      onTenantSlugChange={(value) => {
        setTenantSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
        setSelectedServerTenant(null);
      }}
      onSubmit={handleUnifiedLogin}
      onOpenServerBrowse={() => {
        setMode("server-browse");
        setError(null);
      }}
      onStartSetup={() => {
        setMode("setup");
        setError(null);
      }}
      onStartDeviceSetup={enterDeviceSetup}
      onViewRegisteredTenants={() => navigate({ to: "/devices" })}
    />
  );
}
