import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { tenantContextStore, type TenantContext } from "../lib/indexeddb";
import { LoadingState } from "../components/block/LoadingState";

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
      const context = await tenantContextStore.get(tenantId);

      if (!active) return;

      if (!context) {
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
