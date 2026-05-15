import { createFileRoute } from "@tanstack/react-router";
import { issueSessionGrant } from "#/server/sessionGrant";

export const Route = createFileRoute("/api/session-grant")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        const tenantId = url.searchParams.get("tenantId");
        const deviceId = url.searchParams.get("deviceId") ?? "unknown";
        if (!tenantId) return errJson(400, "tenantId required");

        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        const accountId = token ? decodeField(token, "accountId") : "anonymous";
        const role = token ? decodeField(token, "role") : "terminal";

        return jsonOk(issueSessionGrant(tenantId, accountId, deviceId, role));
      },
    },
  },
});

function decodeField(token: string, field: string): string {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return payload[field] ?? (field === "role" ? "terminal" : "anonymous");
  } catch {
    return field === "role" ? "terminal" : "anonymous";
  }
}

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
}
function errJson(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
