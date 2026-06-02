import { useState, useEffect } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SyncEngineProvider, useSyncEngineContext } from "#/presentation/hooks/SyncEngineContext";
import { useHydrateCache } from "#/presentation/hooks/useHydrateCache";
import { getTenantContextStore } from "#/presentation/hooks/useIndexedDbStores";

export const Route = createFileRoute("/tenant/$tenantId")({
  component: TenantLayout,
});

function TenantLayout() {
  const { tenantId } = Route.useParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if tenant context exists (authenticated) without triggering navigation
  useEffect(() => {
    let active = true;
    getTenantContextStore().then((tenantContextStore) =>
      tenantContextStore.get(tenantId).then((ctx) => {
        if (active) {
          setIsAuthenticated(!!ctx);
        }
      }),
    );
    return () => {
      active = false;
    };
  }, [tenantId]);

  return (
    <SyncEngineProvider tenantId={tenantId} enabled={isAuthenticated}>
      <TenantCacheHydrator tenantId={tenantId} enabled={isAuthenticated} />
      <Outlet />
    </SyncEngineProvider>
  );
}

/** Inner component that can access SyncEngineContext to react to sync completions */
function TenantCacheHydrator({ tenantId, enabled }: { tenantId: string; enabled: boolean }) {
  const syncEngine = useSyncEngineContext();
  useHydrateCache(enabled ? tenantId : null, syncEngine?.lastSyncedAt);
  return null;
}
