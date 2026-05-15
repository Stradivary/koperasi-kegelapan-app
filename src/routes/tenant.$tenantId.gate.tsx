import { createFileRoute } from "@tanstack/react-router";
import { GateSection } from "../components/section/GateSection";

export const Route = createFileRoute("/tenant/$tenantId/gate")({
  component: GatePage,
});

function GatePage() {
  const { tenantId } = Route.useParams();
  const { tenantContext } = Route.useRouteContext();
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
