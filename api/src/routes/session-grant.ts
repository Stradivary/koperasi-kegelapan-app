import { Hono } from "hono";
import { issueSessionGrant } from "../../../src/server/sessionGrant";
import type { JwtPayload } from "../lib/jwt";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

export const sessionGrantRoute = new Hono<{ Bindings: Env }>();

sessionGrantRoute.get("/", (c) => {
  const url = new URL(c.req.url);
  const tenantId = url.searchParams.get("tenantId");
  const role = url.searchParams.get("role");

  if (!tenantId) {
    return c.json({ error: "tenantId required" }, 400);
  }

  // Scout role: allow unauthenticated access with anonymous account
  if (role === "scout") {
    const deviceId = url.searchParams.get("deviceId") ?? "unknown";
    const accountId = "scout-anonymous";

    const masterKey = Buffer.from(c.env.SESSION_MASTER_KEY, "utf8").subarray(0, 32);
    const grant = issueSessionGrant(masterKey, tenantId, accountId, deviceId, role);

    return c.json(grant);
  }

  // All other roles: require authentication
  const auth = c.get("auth") as JwtPayload | undefined;

  if (!auth) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const deviceId = url.searchParams.get("deviceId") ?? auth.deviceId ?? "unknown";

  // Enforce tenant isolation: only allow requesting grants for your own tenant
  if (tenantId !== auth.tenantId) {
    return c.json({ error: "Forbidden: tenant mismatch" }, 403);
  }

  // Use the role from the verified token (not from query params)
  const authenticatedRole = auth.role;
  const accountId = auth.accountId;

  const masterKey = Buffer.from(c.env.SESSION_MASTER_KEY, "utf8").subarray(0, 32);
  const grant = issueSessionGrant(masterKey, tenantId, accountId, deviceId, authenticatedRole);

  return c.json(grant);
});
