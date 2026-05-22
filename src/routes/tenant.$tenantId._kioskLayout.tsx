import { useEffect } from "react";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { OfflineIndicator } from "../components/block/OfflineIndicator";
import { KioskLayout } from "../components/layout/KioskLayout";
import { useReconciliation } from "../hooks/useReconciliation";
import { TenantRoutePending, useTenantContext } from "../hooks/useTenantContext";

type KioskView = "terminal" | "kiosk" | "scout" | "gate";

export const Route = createFileRoute("/tenant/$tenantId/_kioskLayout")({
  component: KioskLayoutRoute,
});

function KioskLayoutRoute() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId, [
    "admin",
    "gate",
    "kiosk",
    "scout",
    "terminal",
  ]);
  const pathname = useLocation({ select: (location) => location.pathname });
  const { status, pendingCount, sync, checkPending } = useReconciliation(
    tenantId,
    tenantContext?.terminalId ?? 0,
  );

  useEffect(() => {
    if (!tenantContext) return;
    checkPending();
  }, [checkPending, tenantContext]);

  if (loading || !tenantContext) return <TenantRoutePending />;

  const currentMode = getKioskView(pathname);

  const trailing =
    currentMode === "terminal" ? (
      <OfflineIndicator pendingCount={pendingCount} onSync={sync} syncStatus={status} />
    ) : undefined;

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
      trailing={trailing}
    >
      <Outlet />
    </KioskLayout>
  );
}

function getKioskView(pathname: string): KioskView {
  if (pathname.endsWith("/terminal")) return "terminal";
  if (pathname.endsWith("/scout")) return "scout";
  if (pathname.endsWith("/gate")) return "gate";
  return "kiosk";
}

function getKioskTitle(view: KioskView): string {
  if (view === "terminal") return "Terminal";
  if (view === "scout") return "Cek Saldo";
  if (view === "gate") return "Gerbang Masuk";
  return "Mesin Kasir";
}

function getKioskSubtitle(view: KioskView): string | undefined {
  if (view === "gate") return "Check-in";
  return undefined;
}
