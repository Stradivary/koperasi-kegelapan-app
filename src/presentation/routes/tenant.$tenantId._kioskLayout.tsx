import { KioskLayout } from "#/presentation/components/layout/KioskLayout";
import { useReconciliation } from "#/presentation/hooks/useReconciliation";
import { TenantRoutePending, useTenantContext } from "#/presentation/hooks/useTenantContext";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

type KioskView = "terminal" | "scout" | "gate";

export const Route = createFileRoute("/tenant/$tenantId/_kioskLayout")({
  component: KioskLayoutRoute,
});

function KioskLayoutRoute() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId, [
    "admin",
    "gate",
    "scout",
    "terminal",
  ]);
  const pathname = useLocation({ select: (location) => location.pathname });
  const { checkPending } = useReconciliation(tenantId, tenantContext?.terminalId ?? 0);

  useEffect(() => {
    if (!tenantContext) return;
    checkPending();
  }, [checkPending, tenantContext]);

  if (loading || !tenantContext) return <TenantRoutePending />;

  const currentMode = getKioskView(pathname);

  return (
    <KioskLayout
      title={getKioskTitle(currentMode)}
      subtitle={getKioskSubtitle(currentMode)}
      tenantName={tenantContext.tenantName}
      tenantId={tenantId}
      currentMode={currentMode}
      canAccessStation={
        tenantContext.canAccessStation ??
        (tenantContext.role === "admin" || tenantContext.role === "station")
      }
      deviceRole={tenantContext.role}
    >
      <Outlet />
    </KioskLayout>
  );
}

function getKioskView(pathname: string): KioskView {
  if (pathname.endsWith("/terminal")) return "terminal";
  if (pathname.endsWith("/scout")) return "scout";
  if (pathname.endsWith("/gate")) return "gate";
  return "scout";
}

function getKioskTitle(view: KioskView): string {
  if (view === "terminal") return "Terminal";
  if (view === "scout") return "Cek Saldo";
  if (view === "gate") return "Gerbang Masuk";
  return "Cek Saldo";
}

function getKioskSubtitle(view: KioskView): string | undefined {
  if (view === "gate") return "Check-in";
  return undefined;
}
