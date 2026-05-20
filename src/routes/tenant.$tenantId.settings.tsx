import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SettingsSection } from "../components/section/SettingsSection";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";
import { AdminLayout, type AdminView } from "../components/layout/AdminLayout";
import { useSyncEngineContext } from "../hooks/SyncEngineContext";

export const Route = createFileRoute("/tenant/$tenantId/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);
  const syncEngine = useSyncEngineContext();
  const navigate = useNavigate();

  if (loading || !tenantContext) return <TenantRoutePending />;

  function handleSectionChange(section: AdminView) {
    if (section === "settings") return;
    if (section === "cards") {
      navigate({ to: `/tenant/${tenantId}/cards` });
    } else if (section === "members") {
      navigate({ to: `/tenant/${tenantId}/members` });
    } else if (section === "transactions") {
      navigate({ to: `/tenant/${tenantId}/transactions` });
    } else if (section === "scout") {
      navigate({ to: `/tenant/${tenantId}/scout` });
    }
  }

  return (
    <AdminLayout
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      role={tenantContext.role}
      activeSection="settings"
      onSectionChange={handleSectionChange}
      syncStatus={syncEngine?.syncStatus ?? "idle"}
      lastSyncedAt={syncEngine?.lastSyncedAt ?? null}
      pendingCount={syncEngine?.pendingCount ?? 0}
      onTriggerSync={syncEngine?.triggerSync ?? (() => {})}
    >
      <SettingsSection tenantId={tenantId} />
    </AdminLayout>
  );
}
