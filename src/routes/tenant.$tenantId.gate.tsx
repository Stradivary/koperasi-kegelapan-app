import { createFileRoute } from "@tanstack/react-router";
import { GateSection } from "../components/section/GateSection";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";

export const Route = createFileRoute("/tenant/$tenantId/gate")({
  component: GatePage,
});

function GatePage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return (
    <GateSection
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={tenantContext.terminalId}
    />
  );
}
