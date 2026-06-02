import { createFileRoute } from "@tanstack/react-router";
import { CardSection } from "#/presentation/components/section/CardSection";
import { TenantRoutePending, useTenantContext } from "#/presentation/hooks/useTenantContext";

export const Route = createFileRoute("/tenant/$tenantId/_adminLayout/cards")({
  component: CardsPage,
});

function CardsPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return (
    <CardSection
      tenantId={tenantId}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={tenantContext.terminalId}
    />
  );
}
