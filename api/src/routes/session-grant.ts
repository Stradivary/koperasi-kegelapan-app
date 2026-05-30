import { Hono } from "hono";
import { issueSessionGrant } from "../../../src/server/sessionGrant";
import type { JwtPayload } from "../lib/jwt";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

export const sessionGrantRoute = new Hono<{ Bindings: Env }>();

sessionGrantRoute.get("/", (c) => {
  // Auth is guaranteed by the verifyToken middleware (applied in index.ts)
  const auth = c.get("auth") as JwtPayload;

  const url = new URL(c.req.url);
  const tenantId = url.searchParams.get("tenantId");
  const deviceId = url.searchParams.get("deviceId") ?? auth.deviceId ?? "unknown";

  if (!tenantId) {
    return c.json({ error: "tenantId required" }, 400);
  }

  // Enforce tenant isolation: only allow requesting grants for your own tenant
  if (tenantId !== auth.tenantId) {
    return c.json({ error: "Forbidden: tenant mismatch" }, 403);
  }

  // Use the role from the verified token (not from query params)
  const role = auth.role;
  const accountId = auth.accountId;

  const masterKey = Buffer.from(c.env.SESSION_MASTER_KEY, "utf8").subarray(0, 32);
  const grant = issueSessionGrant(masterKey, tenantId, accountId, deviceId, role);

  return c.json(grant);
});
