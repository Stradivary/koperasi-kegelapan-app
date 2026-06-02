import { createFileRoute } from "@tanstack/react-router";
import { KioskSection } from "#/presentation/components/section/KioskSection";
import { TenantRoutePending, useTenantContext } from "#/presentation/hooks/useTenantContext";

export const Route = createFileRoute("/tenant/$tenantId/_kioskLayout/kiosk")({
  component: KioskPage,
});

function KioskPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId, ["admin", "kiosk"]);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return (
    <KioskSection
      tenantId={tenantId}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={tenantContext.terminalId}
    />
  );
}
