import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CardSection } from "../components/section/CardSection";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";
import { AdminLayout, type AdminView } from "../components/layout/AdminLayout";
import { useSyncEngineContext } from "../hooks/SyncEngineContext";

export const Route = createFileRoute("/tenant/$tenantId/cards")({
  component: CardsPage,
});

function CardsPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);
  const syncEngine = useSyncEngineContext();
  const navigate = useNavigate();

  if (loading || !tenantContext) return <TenantRoutePending />;

  function handleSectionChange(section: AdminView) {
    if (section === "cards") return;
    if (section === "members") {
      navigate({ to: `/tenant/${tenantId}/members` });
    } else if (section === "transactions") {
      navigate({ to: `/tenant/${tenantId}/transactions` });
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
      activeSection="cards"
      onSectionChange={handleSectionChange}
      syncStatus={syncEngine?.syncStatus ?? "idle"}
      lastSyncedAt={syncEngine?.lastSyncedAt ?? null}
      pendingCount={syncEngine?.pendingCount ?? 0}
      onTriggerSync={syncEngine?.triggerSync ?? (() => {})}
    >
      <CardSection
        tenantId={tenantId}
        accountId={tenantContext.accountId}
        deviceId={tenantContext.deviceId}
        terminalId={tenantContext.terminalId}
      />
    </AdminLayout>
  );
}
