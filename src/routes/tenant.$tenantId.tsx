import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/tenant/$tenantId")({
  component: TenantLayout,
});

function TenantLayout() {
  return <Outlet />;
}
