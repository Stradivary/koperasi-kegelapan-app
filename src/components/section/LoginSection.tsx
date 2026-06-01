import { useState, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BRAND } from "#/lib/utils/brand";
import { API_BASE_URL } from "#/lib/api";
import { DeviceRoleSelectionPanel } from "../block/loginSection/DeviceRoleSelectionPanel";
import { DeviceSetupAuthPanel } from "../block/loginSection/DeviceSetupAuthPanel";
import { LoginFormPanel } from "../block/loginSection/LoginFormPanel";
import { ServerBrowsePanel } from "../block/loginSection/ServerBrowsePanel";
import { ScoutBrowsePanel } from "../block/loginSection/ScoutBrowsePanel";
import { LocalSetupSection } from "./LocalSetupSection";
import { useServerTenantSearch, type TenantSearchResult } from "#/hooks/useServerTenantSearch";
import { LoadingState } from "../block/LoadingState";
import { useOnlineStatus } from "#/hooks/useOnlineStatus";
import { useLoginFlow } from "#/hooks/useLoginFlow";
import { useLoginAuth } from "#/hooks/useLoginAuth";

export function LoginSection() {
  const navigate = useNavigate();

  // ── Hook-owned state & logic ───────────────────────────────────────────────
  const flow = useLoginFlow();

  // ── UI-only local state ────────────────────────────────────────────────────
  const [tenantSlug, setTenantSlug] = useState("");
  const [selectedServerTenant, setSelectedServerTenant] = useState<TenantSearchResult | null>(null);
  const [slugNotFoundError, setSlugNotFoundError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const {
    query: serverTenantQuery,
    setQuery: setServerTenantQuery,
    results: serverTenantResults,
    loading: serverTenantLoading,
    error: serverTenantError,
  } = useServerTenantSearch();

  const {
    query: scoutTenantQuery,
    setQuery: setScoutTenantQuery,
    results: scoutTenantResults,
    loading: scoutTenantLoading,
    error: scoutTenantError,
  } = useServerTenantSearch();

  const { isOnline } = useOnlineStatus();

  const auth = useLoginAuth({
    username: flow.username,
    password: flow.password,
    tenantSlug,
    selectedServerTenant,
    onLoginSuccess: flow.redirectToRole,
    onDeviceSetupAuthSuccess: flow.advanceToPickRole,
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  if (flow.mode === "detecting") {
    return <LoadingState variant="page" />;
  }

  if (flow.mode === "setup") {
    return (
      <LocalSetupSection
        onComplete={(tenantId, role) => {
          flow.redirectToRole(tenantId, role);
        }}
        onBack={() => {
          flow.enterLogin();
        }}
      />
    );
  }

  if (flow.mode === "server-browse") {
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
          flow.setUsername("");
          flow.setPassword("");
          flow.enterLogin();
          // Focus password after render
          setTimeout(() => passwordRef.current?.focus(), 100);
        }}
        onBack={() => {
          flow.enterLogin();
        }}
      />
    );
  }

  if (flow.mode === "scout-browse") {
    return (
      <ScoutBrowsePanel
        query={scoutTenantQuery}
        results={scoutTenantResults}
        loading={scoutTenantLoading}
        error={scoutTenantError}
        slugError={slugNotFoundError}
        isOnline={isOnline}
        localTenants={flow.localTenants}
        onQueryChange={setScoutTenantQuery}
        onSelectServer={(tenant) => {
          flow.handleScoutSelectTenant(tenant.tenantId, tenant.slug, tenant.name);
        }}
        onSelectLocal={(tenant) => {
          flow.handleScoutSelectTenant(tenant.tenantId, tenant.slug, tenant.name);
        }}
        onEnterSlug={async (slug) => {
          // 1. Try local store first (works offline too)
          const localMatch = flow.localTenants.find((t) => t.slug === slug);
          if (localMatch) {
            flow.handleScoutSelectTenant(localMatch.tenantId, localMatch.slug, localMatch.name);
            return;
          }
          // 2. Online: resolve via server search (exact slug match)
          if (isOnline) {
            try {
              const res = await fetch(
                `${API_BASE_URL}/api/tenants/search?q=${encodeURIComponent(slug)}&limit=10`,
              );
              if (res.ok) {
                const data = await res.json();
                const serverMatch = (
                  data.tenants as { tenantId: string; slug: string; name: string }[]
                ).find((t) => t.slug === slug);
                if (serverMatch) {
                  flow.handleScoutSelectTenant(
                    serverMatch.tenantId,
                    serverMatch.slug,
                    serverMatch.name,
                  );
                  return;
                }
              }
            } catch {
              // Network error — fall through to error state
            }
          }
          // 3. Cannot resolve — show error
          setSlugNotFoundError(slug);
        }}
        onBack={() => {
          setSlugNotFoundError(null);
          flow.enterLogin();
        }}
      />
    );
  }

  if (flow.mode === "device-setup") {
    if (flow.setupStep === "pick-role") {
      return (
        <DeviceRoleSelectionPanel
          onSelectRole={flow.handlePickDeviceRole}
          backLabel={flow.deviceSetupLaunchContext?.returnLabel}
          onBack={() => {
            if (flow.deviceSetupLaunchContext) {
              flow.exitDeviceSetup();
              return;
            }
            // Go back to auth step - enterDeviceSetup resets setupStep to "auth"
            flow.enterDeviceSetup();
          }}
        />
      );
    }

    // setupStep === 'auth'
    return (
      <DeviceSetupAuthPanel
        username={flow.username}
        password={flow.password}
        error={auth.error}
        loading={auth.loading}
        onUsernameChange={flow.setUsername}
        onPasswordChange={flow.setPassword}
        onSubmit={auth.handleDeviceSetupAuth}
        cancelLabel={flow.deviceSetupLaunchContext?.returnLabel}
        onCancel={flow.exitDeviceSetup}
      />
    );
  }

  // mode === "login" (default)
  return (
    <LoginFormPanel
      username={flow.username}
      password={flow.password}
      tenantSlug={tenantSlug}
      error={auth.error}
      loading={auth.loading}
      selectedServerTenant={selectedServerTenant}
      appName={BRAND.APP_NAME}
      byline={BRAND.BYLINE}
      passwordRef={passwordRef}
      onUsernameChange={flow.setUsername}
      onPasswordChange={flow.setPassword}
      onTenantSlugChange={(value) => {
        setTenantSlug(value.toLowerCase().replaceAll(/[^a-z0-9-]/g, ""));
        setSelectedServerTenant(null);
      }}
      onSubmit={auth.handleUnifiedLogin}
      onOpenServerBrowse={() => {
        flow.enterServerBrowse();
      }}
      onStartSetup={() => {
        flow.enterSetup();
      }}
      onStartDeviceSetup={flow.enterDeviceSetup}
      onViewRegisteredTenants={() => navigate({ to: "/devices" })}
      onOpenScoutBrowse={flow.enterScoutBrowse}
    />
  );
}
