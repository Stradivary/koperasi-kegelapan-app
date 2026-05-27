import { createFileRoute } from "@tanstack/react-router";
import { MemberSection } from "#/components/section/MemberSection";
import { TenantRoutePending, useTenantContext } from "#/hooks/useTenantContext";

export const Route = createFileRoute("/tenant/$tenantId/_adminLayout/members")({
  component: MembersPage,
});

function MembersPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return <MemberSection tenantId={tenantId} />;
}
