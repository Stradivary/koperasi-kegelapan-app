import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MemberSection } from "../components/section/MemberSection";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";
import { AdminLayout, type AdminView } from "../components/layout/AdminLayout";
import { useSyncEngineContext } from "../hooks/SyncEngineContext";

export const Route = createFileRoute("/tenant/$tenantId/members")({
  component: MembersPage,
});

function MembersPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);
  const syncEngine = useSyncEngineContext();
  const navigate = useNavigate();

  if (loading || !tenantContext) return <TenantRoutePending />;

  function handleSectionChange(section: AdminView) {
    if (section === "members") return;
    if (section === "cards") {
      navigate({ to: `/tenant/${tenantId}/cards` });
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
      activeSection="members"
      onSectionChange={handleSectionChange}
      syncStatus={syncEngine?.syncStatus ?? "idle"}
      lastSyncedAt={syncEngine?.lastSyncedAt ?? null}
      pendingCount={syncEngine?.pendingCount ?? 0}
      onTriggerSync={syncEngine?.triggerSync ?? (() => {})}
    >
      <MemberSection tenantId={tenantId} />
    </AdminLayout>
  );
}
