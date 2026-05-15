import { createFileRoute, redirect } from "@tanstack/react-router";
import { KioskSection } from "../components/section/KioskSection";
import type { TenantContext } from "../lib/indexeddb";

export const Route = createFileRoute("/tenant/$tenantId/kiosk")({
  beforeLoad: ({ context }) => {
    const { tenantContext } = context as { tenantContext: TenantContext };
    if (!["admin", "kiosk"].includes(tenantContext.role)) {
      const roleRoutes: Record<string, string> = {
        station: `/tenant/${tenantContext.tenantId}/station`,
        gate: `/tenant/${tenantContext.tenantId}/gate`,
        terminal: `/tenant/${tenantContext.tenantId}/terminal`,
        scout: `/tenant/${tenantContext.tenantId}/scout`,
      };
      throw redirect({ to: roleRoutes[tenantContext.role] ?? "/" });
    }
  },
  component: KioskPage,
});

function KioskPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext } = Route.useRouteContext();
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
