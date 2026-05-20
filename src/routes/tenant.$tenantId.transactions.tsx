import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TransactionsSection } from "../components/section/TransactionsSection";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";
import { AdminLayout, type AdminView } from "../components/layout/AdminLayout";
import { useSyncEngineContext } from "../hooks/SyncEngineContext";

export const Route = createFileRoute("/tenant/$tenantId/transactions")({
  component: TransactionsPage,
});

function TransactionsPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);
  const syncEngine = useSyncEngineContext();
  const navigate = useNavigate();

  if (loading || !tenantContext) return <TenantRoutePending />;

  function handleSectionChange(section: AdminView) {
    // Navigate back to admin route with the selected tab
    navigate({ to: `/tenant/${tenantId}/admin`, search: { view: section } });
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
    >
      <TransactionsSection tenantId={tenantId} />
    </AdminLayout>
  );
}
