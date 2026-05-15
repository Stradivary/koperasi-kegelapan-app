import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { tenantContextStore } from "../lib/indexeddb";

export const Route = createFileRoute("/tenant/$tenantId")({
  beforeLoad: async ({ params }) => {
    const ctx = await tenantContextStore.get(params.tenantId);
    if (!ctx) {
      throw redirect({ to: "/", search: { redirect: `/tenant/${params.tenantId}` } });
    }
    return { tenantContext: ctx };
  },
  component: TenantLayout,
});

function TenantLayout() {
  return <Outlet />;
}
