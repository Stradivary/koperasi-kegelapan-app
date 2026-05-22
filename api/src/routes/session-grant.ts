import { Hono } from "hono";
import { createHmac } from "node:crypto";
import { roleToOps } from "../../../src/lib/roleOps";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

const SESSION_KEY_LIFETIME_SECONDS = 24 * 60 * 60;

export interface GrantPayload {
  keyVersion: number;
  sessionKey: string;
  expiresAt: number;
  allowedOps: string[];
  tenantId: string;
  accountId: string;
  deviceId: string;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function deriveTenantKey(masterKey: Buffer, tenantId: string, keyVersion: number): Buffer {
  return createHmac("sha256", masterKey).update(`${tenantId}:${keyVersion}`).digest();
}

function issueSessionGrant(
  masterKey: Buffer,
  tenantId: string,
  accountId: string,
  deviceId: string,
  role: string,
  keyVersion = 1,
): GrantPayload & { signature: string } {
  const tenantKey = deriveTenantKey(masterKey, tenantId, keyVersion);
  const sessionKey = createHmac("sha256", tenantKey).update("session-key").digest();
  const expiresAt = nowSeconds() + SESSION_KEY_LIFETIME_SECONDS;

  const allowedOps = roleToOps(role);

  const payload: GrantPayload = {
    keyVersion,
    sessionKey: sessionKey.toString("base64"),
    expiresAt,
    allowedOps,
    tenantId,
    accountId,
    deviceId,
  };

  const signature = createHmac("sha256", tenantKey)
    .update(JSON.stringify({ keyVersion, expiresAt, allowedOps, accountId, deviceId }))
    .digest("base64url");

  return { ...payload, signature };
}

function decodeField(token: string, field: string): string {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return payload[field] ?? (field === "role" ? "terminal" : "anonymous");
  } catch {
    return field === "role" ? "terminal" : "anonymous";
  }
}

export const sessionGrantRoute = new Hono<{ Bindings: Env }>();

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
