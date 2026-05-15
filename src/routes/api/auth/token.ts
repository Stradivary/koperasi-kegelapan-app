import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "#/db";
import { accounts, tenants } from "#/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyPassword } from "#/server/auth";

export const Route = createFileRoute("/api/auth/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = await request.json().catch(() => null);
        if (!json?.username || !json?.password)
          return errJson(400, "username and password required");

        const db = await getDb();
        const account = await db
          .select()
          .from(accounts)
          .where(and(eq(accounts.username, json.username), eq(accounts.status, "active")))
          .get();

        if (!account || !verifyPassword(json.password, account.passwordHash)) {
          return errJson(401, "Invalid credentials");
        }

        const tenant = await db
          .select()
          .from(tenants)
          .where(eq(tenants.tenantId, account.tenantId))
          .get();

        if (!tenant || tenant.status !== "active") return errJson(401, "Tenant inactive");

        return jsonOk({
          accountId: account.accountId,
          tenantId: account.tenantId,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          role: account.role,
        });
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
