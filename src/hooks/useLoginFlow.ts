import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { LocalTenantConfig } from "#/lib/indexeddb";
import { getIndexedDb } from "#/lib/indexeddb.lazy";
import { getDeviceFingerprint } from "#/lib/getOrCreateDeviceId";
import { setCurrentDeviceId, restoreAuthState } from "#/lib/api";
import { issueAndCacheLocalSessionGrant } from "#/lib/localSessionGrant";
import { consumeDeviceSetupLaunchContext, type DeviceSetupLaunchContext } from "#/lib/utils";
import { hydrateQueryCache } from "#/hooks/useHydrateCache";
import type { PendingDeviceContext } from "#/hooks/useLoginAuth";

// ── Re-export PendingDeviceContext so consumers can import from one place ─────
export type { PendingDeviceContext } from "#/hooks/useLoginAuth";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LoginMode =
  | "detecting"
  | "login"
  | "setup"
  | "device-setup"
  | "server-browse"
  | "scout-browse";

export type DeviceSetupStep = "auth" | "pick-role";

const NO_AUTH_ROLES = ["gate", "terminal", "scout"] as const;

const ROLE_ROUTES: Record<string, string> = {
  terminal: "/tenant/:tenantId/terminal",
  gate: "/tenant/:tenantId/gate",
  kiosk: "/tenant/:tenantId/kiosk",
  scout: "/tenant/:tenantId/scout",
  station: "/tenant/:tenantId/station",
  admin: "/tenant/:tenantId/admin",
  superadmin: "/superadmin",
};

function getRoleRoute(tenantId: string, role: string): string {
  if (role === "superadmin") return "/superadmin";
  const template = ROLE_ROUTES[role];
  if (!template) return "/";
  return template.replace(":tenantId", tenantId);
}

export interface UseLoginFlowReturn {
  mode: LoginMode;
  setupStep: DeviceSetupStep;
  pendingContext: PendingDeviceContext | null;
  deviceSetupLaunchContext: DeviceSetupLaunchContext | null;
  localTenants: LocalTenantConfig[];
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  redirectToRole: (tenantId: string, role: string) => void;
  enterDeviceSetup: () => void;
  exitDeviceSetup: () => void;
  enterServerBrowse: () => void;
  enterSetup: () => void;
  enterLogin: () => void;
  enterScoutBrowse: () => Promise<void>;
  handleScoutSelectTenant: (
    tenantId: string,
    tenantSlug: string,
    tenantName: string,
  ) => Promise<void>;
  handlePickDeviceRole: (role: "gate" | "terminal" | "scout") => Promise<void>;
  advanceToPickRole: (context: PendingDeviceContext) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLoginFlow(): UseLoginFlowReturn {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<LoginMode>("detecting");
  const [setupStep, setSetupStep] = useState<DeviceSetupStep>("auth");
  const [pendingContext, setPendingContext] = useState<PendingDeviceContext | null>(null);
  const [deviceSetupLaunchContext, setDeviceSetupLaunchContext] =
    useState<DeviceSetupLaunchContext | null>(null);
  const [localTenants, setLocalTenants] = useState<LocalTenantConfig[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // ── Mount detection ────────────────────────────────────────────────────────

  useEffect(() => {
    async function detectMode() {
      // 1. Check for device setup launch context in session storage
      const launchContext = consumeDeviceSetupLaunchContext();
      if (launchContext) {
        setUsername("");
        setPassword("");
        setPendingContext(null);
        setSetupStep("auth");
        setDeviceSetupLaunchContext(launchContext);
        setMode("device-setup");
        return;
      }

      // 2. Auto-boot: if this device already has an active session, redirect back
      const { tenantContextStore } = await getIndexedDb();
      const contexts = await tenantContextStore.getAll();
      if (contexts.length > 0) {
        // Prefer no-auth roles (dedicated devices), then fall back to most recent context
        const noAuthCtx = contexts.find((c) =>
          (NO_AUTH_ROLES as readonly string[]).includes(c.role),
        );
        const activeCtx =
          noAuthCtx ?? contexts.toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
        if (activeCtx) {
          // Restore deviceId and access token from IndexedDB
          if (activeCtx.deviceId) {
            await restoreAuthState(activeCtx.deviceId);
          }
          // Hydrate React Query cache before navigating
          await hydrateQueryCache(queryClient, activeCtx.tenantId).catch(() => {});
          navigate({ to: getRoleRoute(activeCtx.tenantId, activeCtx.role), replace: true });
          return;
        }
      }

      setMode("login");
    }
    void detectMode();
  }, [navigate, queryClient]);

  // ── redirectToRole ─────────────────────────────────────────────────────────

  function redirectToRole(tenantId: string, role: string) {
    // Hydrate React Query cache from IndexedDB before navigating
    // so the destination page has data immediately available
    hydrateQueryCache(queryClient, tenantId).catch(() => {
      // Non-critical — the destination page will hydrate via useHydrateCache
    });
    navigate({ to: getRoleRoute(tenantId, role) });
  }

  // ── enterDeviceSetup ───────────────────────────────────────────────────────

  function enterDeviceSetup() {
    setUsername("");
    setPassword("");
    setSetupStep("auth");
    setPendingContext(null);
    setDeviceSetupLaunchContext(null);
    setMode("device-setup");
  }

  // ── exitDeviceSetup ────────────────────────────────────────────────────────

  function exitDeviceSetup() {
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

  // ── enterServerBrowse ──────────────────────────────────────────────────────

  function enterServerBrowse() {
    setMode("server-browse");
  }

  // ── enterSetup ─────────────────────────────────────────────────────────────

  function enterSetup() {
    setMode("setup");
  }

  // ── enterLogin ─────────────────────────────────────────────────────────────

  function enterLogin() {
    setMode("login");
  }

  // ── enterScoutBrowse ───────────────────────────────────────────────────────

  async function enterScoutBrowse() {
    setMode("scout-browse");
    // Load local tenants for the list
    try {
      const { localTenantConfigStore } = await getIndexedDb();
      const configs = await localTenantConfigStore.getAll();
      setLocalTenants(configs);
    } catch {
      setLocalTenants([]);
    }
  }

  // ── handleScoutSelectTenant ────────────────────────────────────────────────

  async function handleScoutSelectTenant(tenantId: string, tenantSlug: string, tenantName: string) {
    const { tenantContextStore } = await getIndexedDb();
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

  // ── handlePickDeviceRole ───────────────────────────────────────────────────

  async function handlePickDeviceRole(role: "gate" | "terminal" | "scout") {
    if (!pendingContext) return;
    const { tenantContextStore } = await getIndexedDb();
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

  // ── advanceToPickRole ──────────────────────────────────────────────────────

  function advanceToPickRole(context: PendingDeviceContext) {
    setPendingContext(context);
    setSetupStep("pick-role");
  }

  return {
    mode,
    setupStep,
    pendingContext,
    deviceSetupLaunchContext,
    localTenants,
    username,
    setUsername,
    password,
    setPassword,
    redirectToRole,
    enterDeviceSetup,
    exitDeviceSetup,
    enterServerBrowse,
    enterSetup,
    enterLogin,
    enterScoutBrowse,
    handleScoutSelectTenant,
    handlePickDeviceRole,
    advanceToPickRole,
  };
}
