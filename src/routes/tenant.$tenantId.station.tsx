import { createFileRoute } from "@tanstack/react-router";
import { StationSection } from "../components/section/StationSection";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";

export const Route = createFileRoute("/tenant/$tenantId/station")({
  component: StationPage,
});

function StationPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId, ["admin", "station"]);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return (
    <StationSection
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={tenantContext.terminalId}
      role={tenantContext.role}
    />
  );
}
