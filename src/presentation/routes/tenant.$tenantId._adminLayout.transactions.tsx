import { createFileRoute } from "@tanstack/react-router";
import { TransactionsSection } from "#/presentation/components/section/TransactionsSection";
import { TenantRoutePending, useTenantContext } from "#/presentation/hooks/useTenantContext";

export const Route = createFileRoute("/tenant/$tenantId/_adminLayout/transactions")({
  component: TransactionsPage,
});

function TransactionsPage() {
  const { tenantId } = Route.useParams();
  const { tenantContext, loading } = useTenantContext(tenantId);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return <TransactionsSection tenantId={tenantId} accountId={tenantContext.accountId} />;
}
