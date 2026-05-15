import { createFileRoute, redirect } from "@tanstack/react-router";
import { StationSection } from "../components/section/StationSection";
import type { TenantContext } from "../lib/indexeddb";

export const Route = createFileRoute("/tenant/$tenantId/station")({
  beforeLoad: ({ context }) => {
    const { tenantContext } = context as { tenantContext: TenantContext };
    if (!["admin", "station"].includes(tenantContext.role)) {
      const roleRoutes: Record<string, string> = {
        gate: `/tenant/${tenantContext.tenantId}/gate`,
        terminal: `/tenant/${tenantContext.tenantId}/terminal`,
        scout: `/tenant/${tenantContext.tenantId}/scout`,
        kiosk: `/tenant/${tenantContext.tenantId}/kiosk`,
      };
      throw redirect({ to: roleRoutes[tenantContext.role] ?? "/" });
    }
  },
  component: StationPage,
});

function StationPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext } = Route.useRouteContext();
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
