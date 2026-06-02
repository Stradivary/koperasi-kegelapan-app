import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { TenantContext } from "#/infrastructure/persistence/dexie/indexeddb";
import { getTenantContextStore } from "#/infrastructure/persistence/dexie/indexeddb.lazy";
import { getDeviceFingerprint } from "#/infrastructure/device/getOrCreateDeviceId";
import { restoreAuthState } from "#/infrastructure/api/apiClient";
import { LoadingState } from "#/presentation/components/block/LoadingState";

function getRoleRoute(tenantId: string, role: string): string {
  const roleRoutes: Record<string, string> = {
    admin: `/tenant/${tenantId}/admin`,
    gate: `/tenant/${tenantId}/gate`,
    kiosk: `/tenant/${tenantId}/kiosk`,
    scout: `/tenant/${tenantId}/scout`,
    station: `/tenant/${tenantId}/station`,
    terminal: `/tenant/${tenantId}/terminal`,
  };

  return roleRoutes[role] ?? "/";
}

export function useTenantContext(tenantId: string, allowedRoles?: readonly string[]) {
  const navigate = useNavigate();
  const [tenantContext, setTenantContext] = useState<TenantContext | null>(null);
  const [loading, setLoading] = useState(true);
  const allowedRolesKey = useMemo(() => allowedRoles?.join(",") ?? "", [allowedRoles]);

  useEffect(() => {
    let active = true;

    async function loadTenantContext() {
      const tenantContextStore = await getTenantContextStore();
      const context = await tenantContextStore.get(tenantId);

      if (!active) return;

      if (!context) {
        setTenantContext(null);
        setLoading(false);
        navigate({ to: "/", search: { redirect: `/tenant/${tenantId}` }, replace: true });
        return;
      }

      // Validate device fingerprint - reject if context was copied from another device
      const runtimeFp = await getDeviceFingerprint();
      if (!active) return;
      if (context.deviceId !== runtimeFp) {
        await tenantContextStore.delete(tenantId);
        setTenantContext(null);
        setLoading(false);
        navigate({ to: "/", search: { redirect: `/tenant/${tenantId}` }, replace: true });
        return;
      }

      if (allowedRoles && !allowedRoles.includes(context.role)) {
        setTenantContext(null);
        setLoading(false);
        navigate({ to: getRoleRoute(context.tenantId, context.role), replace: true });
        return;
      }

      // Ensure the API client has the deviceId and access token for requests
      if (context.deviceId) {
        await restoreAuthState(context.deviceId);
      }

      setTenantContext(context);
      setLoading(false);
    }

    void loadTenantContext();

    return () => {
      active = false;
    };
  }, [allowedRoles, allowedRolesKey, navigate, tenantId]);

  return { tenantContext, loading };
}

export function TenantRoutePending() {
  return <LoadingState variant="page" />;
}
