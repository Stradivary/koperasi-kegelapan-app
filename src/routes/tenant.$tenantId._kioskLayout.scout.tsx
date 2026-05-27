import { createFileRoute } from "@tanstack/react-router";
import { ScoutSection } from "#/components/section/ScoutSection";
import { TenantRoutePending, useTenantContext } from "#/hooks/useTenantContext";

export const Route = createFileRoute("/tenant/$tenantId/_kioskLayout/scout")({
  component: ScoutPage,
});

function ScoutPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return (
    <ScoutSection
      tenantId={tenantId}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={tenantContext.terminalId}
    />
  );
}
