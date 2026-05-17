import { createFileRoute } from "@tanstack/react-router";
import { requireSuperadmin, isAuthError } from "#/server/superadminAuth";
import { getTenantDetail } from "#/server/superadminTenants";

export const Route = createFileRoute("/api/superadmin/tenants/$tenantId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // Authorization check
        const authResult = await requireSuperadmin(request);
        if (isAuthError(authResult)) return authResult;

        const tenantId = params.tenantId;

        if (!tenantId) {
          return errJson(400, "tenantId is required");
        }

        try {
          const result = await getTenantDetail(tenantId);
          return new Response(JSON.stringify(result.data), {
            status: result.status,
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          return errJson(500, "Internal server error");
        }
      },
    },
  },
});

function errJson(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
