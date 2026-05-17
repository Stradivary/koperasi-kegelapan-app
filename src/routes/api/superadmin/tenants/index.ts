import { createFileRoute } from "@tanstack/react-router";
import { requireSuperadmin, isAuthError } from "#/server/superadminAuth";
import { listTenants, createTenant } from "#/server/superadminTenants";

export const Route = createFileRoute("/api/superadmin/tenants/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Authorization check
        const authResult = await requireSuperadmin(request);
        if (isAuthError(authResult)) return authResult;

        const url = new URL(request.url);
        const pageParam = url.searchParams.get("page");
        const pageSizeParam = url.searchParams.get("pageSize");
        const search = url.searchParams.get("search") ?? undefined;

        const page = pageParam ? Number(pageParam) : undefined;
        const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

        try {
          const result = await listTenants({ page, pageSize, search });
          return jsonOk(result);
        } catch {
          return errJson(500, "Internal server error");
        }
      },

      POST: async ({ request }) => {
        // Authorization check
        const authResult = await requireSuperadmin(request);
        if (isAuthError(authResult)) return authResult;

        // Parse request body
        const body = await request.json().catch(() => null);

        try {
          const result = await createTenant(body);
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

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

function errJson(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
