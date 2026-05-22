import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { AdminLayout, type AdminView } from "../components/layout/AdminLayout";
import { useSyncEngineContext } from "../hooks/SyncEngineContext";
import { useAdminTenantSync } from "../hooks/useAdminTenantSync";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";

const ADMIN_PATHS: Record<Exclude<AdminView, "scout">, string> = {
  cards: "cards",
  members: "members",
  transactions: "transactions",
  settings: "settings",
};

export const Route = createFileRoute("/tenant/$tenantId/_adminLayout")({
  component: AdminLayoutRoute,
});

function AdminLayoutRoute() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);
  const syncEngine = useSyncEngineContext();
  const { onSyncToServer, isSyncingToServer } = useAdminTenantSync(tenantId);
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });

  if (loading || !tenantContext) return <TenantRoutePending />;

  const activeSection = getAdminView(pathname);

  function handleSectionChange(section: AdminView) {
    if (section === activeSection) return;
    if (section === "scout") {
      navigate({ to: `/tenant/${tenantId}/scout` });
      return;
    }

    navigate({ to: `/tenant/${tenantId}/${ADMIN_PATHS[section]}` });
  }

  return (
    <AdminLayout
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      role={tenantContext.role}
      activeSection={activeSection}
      onSectionChange={handleSectionChange}
      syncStatus={syncEngine?.syncStatus ?? "idle"}
      lastSyncedAt={syncEngine?.lastSyncedAt ?? null}
      pendingCount={syncEngine?.pendingCount ?? 0}
      onTriggerSync={syncEngine?.triggerSync ?? (() => {})}
      onSyncToServer={onSyncToServer}
      isSyncingToServer={isSyncingToServer}
    >
      <Outlet />
    </AdminLayout>
  );
}

function getAdminView(pathname: string): AdminView {
  if (pathname.endsWith("/members")) return "members";
  if (pathname.endsWith("/transactions")) return "transactions";
  if (pathname.endsWith("/settings")) return "settings";
  return "cards";
}
