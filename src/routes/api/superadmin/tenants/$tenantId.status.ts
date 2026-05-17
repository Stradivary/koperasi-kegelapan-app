import { createFileRoute } from "@tanstack/react-router";
import { requireSuperadmin, isAuthError } from "#/server/superadminAuth";
import { updateTenantStatus, type TenantStatus } from "#/server/superadminTenants";

const VALID_STATUSES: TenantStatus[] = ["active", "suspended", "archived"];

export const Route = createFileRoute("/api/superadmin/tenants/$tenantId/status")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        // 1. Authorization guard
        const auth = await requireSuperadmin(request);
        if (isAuthError(auth)) return auth;

        // 2. Extract tenantId from route params
        const { tenantId } = params;

        // 3. Parse request body for target status
        const body = await request.json().catch(() => null);
        if (!body || typeof body.status !== "string") {
          return errJson(400, "Request body must include a valid 'status' field");
        }

        const targetStatus = body.status as string;
        if (!VALID_STATUSES.includes(targetStatus as TenantStatus)) {
          return errJson(400, `Invalid status value. Must be one of: ${VALID_STATUSES.join(", ")}`);
        }

        // 4. Call updateTenantStatus from server logic
        try {
          const result = await updateTenantStatus(tenantId, targetStatus as TenantStatus);

          // 5. Return appropriate response
          return new Response(JSON.stringify(result.data), {
            status: result.status,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return errJson(500, msg);
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
