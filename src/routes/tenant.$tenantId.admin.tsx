import { createFileRoute } from "@tanstack/react-router";
import { AdminSection } from "../components/section/AdminSection";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";
import type { AdminView } from "../components/layout/AdminLayout";

const VALID_VIEWS: AdminView[] = ["cards", "members", "transactions", "scout"];

export const Route = createFileRoute("/tenant/$tenantId/admin")({
  component: AdminPage,
  validateSearch: (search: Record<string, unknown>): { view?: AdminView } => {
    const v = search.view as string | undefined;
    if (v && VALID_VIEWS.includes(v as AdminView)) {
      return { view: v as AdminView };
    }
    return {};
  },
});

function AdminPage() {
  const { tenantId } = Route.useParams();
  const { view } = Route.useSearch();
  const { tenantContext, loading } = useTenantContext(tenantId);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return (
    <AdminSection
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={tenantContext.terminalId}
      role={tenantContext.role}
      initialView={view}
    />
  );
}
