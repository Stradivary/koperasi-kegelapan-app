import { createFileRoute } from "@tanstack/react-router";
import { GateSection } from "#/presentation/components/section/GateSection";
import { TenantRoutePending, useTenantContext } from "#/presentation/hooks/useTenantContext";

export const Route = createFileRoute("/tenant/$tenantId/_kioskLayout/gate")({
  component: GatePage,
});

function GatePage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return (
    <GateSection
      tenantId={tenantId}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={tenantContext.terminalId}
    />
  );
}
