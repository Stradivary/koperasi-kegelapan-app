import { createFileRoute } from "@tanstack/react-router";
import { TransactionsSection } from "../components/section/TransactionsSection";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";
import { AdminLayout } from "../components/layout/AdminLayout";
import { useSyncEngine } from "../hooks/useSyncEngine";

export const Route = createFileRoute("/tenant/$tenantId/transactions")({
  component: TransactionsPage,
});

function TransactionsPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);
  const { syncStatus, lastSyncedAt, pendingCount, triggerSync } = useSyncEngine(
    tenantContext?.tenantId ?? null,
    !!tenantContext,
  );

  if (loading || !tenantContext) return <TenantRoutePending />;

  return (
    <AdminLayout
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      role={tenantContext.role}
      activeSection="transactions"
      onSectionChange={() => {}}
      syncStatus={syncStatus}
      lastSyncedAt={lastSyncedAt}
      pendingCount={pendingCount}
      onTriggerSync={triggerSync}
    >
      <TransactionsSection tenantId={tenantId} />
    </AdminLayout>
  );
}
