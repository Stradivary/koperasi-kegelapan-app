import { createFileRoute } from "@tanstack/react-router";
import { KioskSection } from "../components/section/KioskSection";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";

export const Route = createFileRoute("/tenant/$tenantId/kiosk")({
  component: KioskPage,
});

function KioskPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId, ["admin", "kiosk"]);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return (
    <KioskSection
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={tenantContext.terminalId}
    />
  );
}
