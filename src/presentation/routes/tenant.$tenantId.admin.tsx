import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/tenant/$tenantId/admin")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/tenant/$tenantId/cards", params: { tenantId: params.tenantId } });
  },
  component: () => null,
});
