import { useState, useEffect } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SyncEngineProvider } from "../hooks/SyncEngineContext";
import { tenantContextStore } from "#/infrastructure/persistence/dexie/indexeddb";

export const Route = createFileRoute("/tenant/$tenantId")({
  component: TenantLayout,
});

function TenantLayout() {
  const { tenantId } = Route.useParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if tenant context exists (authenticated) without triggering navigation
  useEffect(() => {
    let active = true;
    tenantContextStore.get(tenantId).then((ctx) => {
      if (active) {
        setIsAuthenticated(!!ctx);
      }
    });
    return () => {
      active = false;
    };
  }, [tenantId]);

  return (
    <SyncEngineProvider tenantId={tenantId} enabled={isAuthenticated}>
      <Outlet />
    </SyncEngineProvider>
  );
}
