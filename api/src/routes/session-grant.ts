import { Hono } from "hono";
import { issueSessionGrant } from "#/application/auth/sessionGrant.usecase";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

export const sessionGrantRoute = new Hono<{ Bindings: Env }>();

function decodeField(token: string, field: string): string {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return payload[field] ?? (field === "role" ? "terminal" : "anonymous");
  } catch {
    return field === "role" ? "terminal" : "anonymous";
  }
}

sessionGrantRoute.get("/", (c) => {
  const url = new URL(c.req.url);
  const tenantId = url.searchParams.get("tenantId");
  const deviceId = url.searchParams.get("deviceId") ?? "unknown";

  if (!tenantId) {
    return c.json({ error: "tenantId required" }, 400);
  }

  const authHeader = c.req.header("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const accountId = token ? decodeField(token, "accountId") : "anonymous";
  const role = url.searchParams.get("role") ?? (token ? decodeField(token, "role") : "terminal");

  const masterKey = Buffer.from(c.env.SESSION_MASTER_KEY, "utf8").slice(0, 32);
  const grant = issueSessionGrant(masterKey, tenantId, accountId, deviceId, role);

  return c.json(grant);
});
