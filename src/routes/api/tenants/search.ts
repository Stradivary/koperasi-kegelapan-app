import { createFileRoute } from "@tanstack/react-router";
import { searchServerTenants } from "#/server/tenantSearch";

export const Route = createFileRoute("/api/tenants/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q") ?? "";
        const limitParam = url.searchParams.get("limit");

        // Validate query length
        if (q.length < 2) {
          return errJson(400, "Query must be at least 2 characters");
        }
        if (q.length > 100) {
          return errJson(400, "Query must be at most 100 characters");
        }

        // Validate limit parameter
        let limit = 10;
        if (limitParam !== null) {
          const parsed = Number(limitParam);
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
            return errJson(400, "Limit must be a valid integer between 1 and 50");
          }
          limit = parsed;
        }

        try {
          const results = await searchServerTenants(q, limit);
          return jsonOk({ tenants: results, total: results.length });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return errJson(500, msg);
        }
      },
    },
  },
});

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
}
function errJson(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
