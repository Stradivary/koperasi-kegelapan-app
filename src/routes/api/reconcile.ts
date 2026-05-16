import { createFileRoute } from "@tanstack/react-router";
import { processReconciliation } from "#/server/reconcile";

export const Route = createFileRoute("/api/reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        if (!body) return errJson(400, "malformed_payload");

        const { terminalId, events } = body;
        if (terminalId == null || !Array.isArray(events)) {
          return errJson(400, "malformed_payload");
        }

        try {
          const result = await processReconciliation({ terminalId, events });
          return jsonOk(result);
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
