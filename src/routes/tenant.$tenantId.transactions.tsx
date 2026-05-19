import { createFileRoute } from "@tanstack/react-router";
import { TransactionsSection } from "../components/section/TransactionsSection";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";
import { AdminLayout } from "../components/layout/AdminLayout";
import { useSyncEngineContext } from "../hooks/SyncEngineContext";

export const Route = createFileRoute("/tenant/$tenantId/transactions")({
  component: TransactionsPage,
});

function TransactionsPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);
  const syncEngine = useSyncEngineContext();

  if (loading || !tenantContext) return <TenantRoutePending />;

  return (
    <AdminLayout
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      role={tenantContext.role}
      activeSection="transactions"
      onSectionChange={() => {}}
      syncStatus={syncEngine?.syncStatus ?? "idle"}
      lastSyncedAt={syncEngine?.lastSyncedAt ?? null}
      pendingCount={syncEngine?.pendingCount ?? 0}
      onTriggerSync={syncEngine?.triggerSync ?? (() => {})}
    >
      <TransactionsSection tenantId={tenantId} />
    </AdminLayout>
  );
}
