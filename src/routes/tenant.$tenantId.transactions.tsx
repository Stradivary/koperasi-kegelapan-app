import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TransactionsSection } from "../components/section/TransactionsSection";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";
import { AdminLayout, type AdminView } from "../components/layout/AdminLayout";
import { useSyncEngineContext } from "../hooks/SyncEngineContext";
import { useAdminTenantSync } from "../hooks/useAdminTenantSync";

export const Route = createFileRoute("/tenant/$tenantId/transactions")({
  component: TransactionsPage,
});

function TransactionsPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);
  const syncEngine = useSyncEngineContext();
  const { onSyncToServer, isSyncingToServer } = useAdminTenantSync(tenantId);
  const navigate = useNavigate();

  if (loading || !tenantContext) return <TenantRoutePending />;

  function handleSectionChange(section: AdminView) {
    if (section === "transactions") return;
    if (section === "cards") {
      navigate({ to: `/tenant/${tenantId}/cards` });
    } else if (section === "members") {
      navigate({ to: `/tenant/${tenantId}/members` });
    } else if (section === "scout") {
      navigate({ to: `/tenant/${tenantId}/scout` });
    } else if (section === "settings") {
      navigate({ to: `/tenant/${tenantId}/settings` });
    }
  }

  return (
    <AdminLayout
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      role={tenantContext.role}
      activeSection="transactions"
      onSectionChange={handleSectionChange}
      syncStatus={syncEngine?.syncStatus ?? "idle"}
      lastSyncedAt={syncEngine?.lastSyncedAt ?? null}
      pendingCount={syncEngine?.pendingCount ?? 0}
      onTriggerSync={syncEngine?.triggerSync ?? (() => {})}
      onSyncToServer={onSyncToServer}
      isSyncingToServer={isSyncingToServer}
    >
      <TransactionsSection tenantId={tenantId} />
    </AdminLayout>
  );
}
