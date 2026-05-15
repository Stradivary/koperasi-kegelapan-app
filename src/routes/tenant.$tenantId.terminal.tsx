import { createFileRoute } from "@tanstack/react-router";
import { TerminalSection } from "../components/section/TerminalSection";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";

export const Route = createFileRoute("/tenant/$tenantId/terminal")({
  component: TerminalPage,
});

function TerminalPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return (
    <TerminalSection
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={tenantContext.terminalId}
    />
  );
}
