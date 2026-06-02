import { createFileRoute } from "@tanstack/react-router";
import { SettingsSection } from "#/presentation/components/section/SettingsSection";
import { TenantRoutePending, useTenantContext } from "#/presentation/hooks/useTenantContext";

export const Route = createFileRoute("/tenant/$tenantId/_adminLayout/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return <SettingsSection tenantId={tenantId} />;
}
