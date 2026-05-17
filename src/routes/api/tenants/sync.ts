import { createFileRoute } from "@tanstack/react-router";
import { validateSyncRequest, processTenantSync } from "#/server/tenantSync";

export const Route = createFileRoute("/api/tenants/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Step 1: Parse request body as JSON
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return errJson(400, "Invalid JSON body");
        }

        // Step 2: Validate request body
        const errors = validateSyncRequest(body);
        if (errors.length > 0) {
          return new Response(JSON.stringify({ error: "validation_failed", errors }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Step 3: Process sync (conflict detection + creation)
        try {
          const result = await processTenantSync(body as Parameters<typeof processTenantSync>[0]);

          // Step 4: Check if result is a conflict response
          if ("error" in result && result.error === "conflict") {
            return new Response(JSON.stringify(result), {
              status: 409,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Step 5: Success — return 201
          return jsonCreated(result);
        } catch (e) {
          // Step 6: Handle unexpected errors (including race condition unique constraint violations)
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("UNIQUE") || msg.includes("unique") || msg.includes("duplicate")) {
            return errJson(409, "Conflict: tenant or admin already exists");
          }
          return errJson(500, "Internal server error");
        }
      },
    },
  },
});

function jsonCreated(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

function errJson(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
