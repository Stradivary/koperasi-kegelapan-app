import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  tenantContextStore,
  localTenantConfigStore,
  type LocalTenantConfig,
} from "#/infrastructure/persistence/dexie/indexeddb";
import {
  localLoginWithReason,
  cacheServerCredentials,
} from "#/infrastructure/persistence/dexie/tenantRepository";
import { getDeviceFingerprint } from "#/infrastructure/device/getOrCreateDeviceId";
import { localDb } from "#/infrastructure/persistence/dexie/localDb";
import { BRAND } from "#/presentation/lib/brand";
import {
  API_BASE_URL,
  setCurrentDeviceId,
  setAccessToken,
  restoreAuthState,
  getAccessToken,
} from "#/infrastructure/api/apiClient";
import { issueAndCacheLocalSessionGrant } from "#/infrastructure/persistence/dexie/sessionGrantRepository";
import {
  consumeDeviceSetupLaunchContext,
  type DeviceSetupLaunchContext,
} from "#/presentation/lib/utils";
import { DeviceRoleSelectionPanel } from "../block/loginSection/DeviceRoleSelectionPanel";
import { DeviceSetupAuthPanel } from "../block/loginSection/DeviceSetupAuthPanel";
import { LoginFormPanel } from "../block/loginSection/LoginFormPanel";
import { ServerBrowsePanel } from "../block/loginSection/ServerBrowsePanel";
import { ScoutBrowsePanel } from "../block/loginSection/ScoutBrowsePanel";
import { LocalSetupSection } from "./LocalSetupSection";
import { useServerTenantSearch, type TenantSearchResult } from "../../hooks/useServerTenantSearch";
import { LoadingState } from "../block/LoadingState";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";

type LoginMode =
  | "detecting"
  | "login"
  | "setup"
  | "device-setup"
  | "server-browse"
  | "scout-browse";
type DeviceSetupStep = "auth" | "pick-role";

const NO_AUTH_ROLES = ["gate", "terminal", "scout"] as const;
const AUTH_TIMEOUT_MS = 10_000;

// ── Extracted login helpers ───────────────────────────────────────────────────

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
  const [deviceSetupLaunchContext, setDeviceSetupLaunchContext] =
    useState<DeviceSetupLaunchContext | null>(null);

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

  // Scout browse state
  const {
    query: scoutTenantQuery,
    setQuery: setScoutTenantQuery,
    results: scoutTenantResults,
    loading: scoutTenantLoading,
    error: scoutTenantError,
  } = useServerTenantSearch();
  const [localTenants, setLocalTenants] = useState<LocalTenantConfig[]>([]);

  useEffect(() => {
    async function detectMode() {
      const launchContext = consumeDeviceSetupLaunchContext();
      if (launchContext) {
        setError(null);
        setUsername("");
        setPassword("");
        setPendingContext(null);
        setSetupStep("auth");
        setDeviceSetupLaunchContext(launchContext);
        setMode("device-setup");
        return;
      }

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
    setDeviceSetupLaunchContext(null);
    setMode("device-setup");
  }

  function exitDeviceSetup() {
    setError(null);
    setUsername("");
    setPassword("");
    setSetupStep("auth");
    setPendingContext(null);

    if (deviceSetupLaunchContext) {
      const { returnTo } = deviceSetupLaunchContext;
      setDeviceSetupLaunchContext(null);
      navigate({ to: returnTo });
      return;
    }

    setMode("login");
  }

  async function enterScoutBrowse() {
    setError(null);
    setScoutTenantQuery("");
    setMode("scout-browse");
    // Load local tenants for the list
    try {
      const configs = await localTenantConfigStore.getAll();
      setLocalTenants(configs);
    } catch {
      setLocalTenants([]);
    }
  }

  async function handleScoutSelectTenant(tenantId: string, tenantSlug: string, tenantName: string) {
    const fingerprintId = await getDeviceFingerprint();
    await tenantContextStore.put({
      tenantId,
      tenantSlug,
      tenantName,
      deviceId: fingerprintId,
      accountId: "scout-anonymous",
      role: "scout",
      terminalId: 0,
      updatedAt: Date.now(),
    });
    setCurrentDeviceId(fingerprintId);

    // Issue a local session grant for scout role (no password needed)
    issueAndCacheLocalSessionGrant(tenantId, "scout-anonymous", fingerprintId, "scout").catch(
      () => {
        // Non-critical — useSessionGrant will handle fallback
      },
    );

    navigate({ to: `/tenant/${tenantId}/scout` });
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

        redirectToRole(localResult.tenantId, localResult.role);
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

      redirectToRole(data.tenantId as string, data.role as string);
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

  if (mode === "scout-browse") {
    return (
      <ScoutBrowsePanel
        query={scoutTenantQuery}
        results={scoutTenantResults}
        loading={scoutTenantLoading}
        error={scoutTenantError}
        isOnline={isOnline}
        localTenants={localTenants}
        onQueryChange={setScoutTenantQuery}
        onSelectServer={(tenant) => {
          handleScoutSelectTenant(tenant.tenantId, tenant.slug, tenant.name);
        }}
        onSelectLocal={(tenant) => {
          handleScoutSelectTenant(tenant.tenantId, tenant.slug, tenant.name);
        }}
        onEnterSlug={(slug) => {
          // Use slug as temporary tenantId — the session grant and scout page
          // will work with this since local grants are derived from tenantId
          handleScoutSelectTenant(slug, slug, slug);
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
          backLabel={deviceSetupLaunchContext?.returnLabel}
          onBack={() => {
            if (deviceSetupLaunchContext) {
              exitDeviceSetup();
              return;
            }
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
        cancelLabel={deviceSetupLaunchContext?.returnLabel}
        onCancel={exitDeviceSetup}
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
        setTenantSlug(value.toLowerCase().replaceAll(/[^a-z0-9-]/g, ""));
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
      onOpenScoutBrowse={enterScoutBrowse}
    />
  );
}
