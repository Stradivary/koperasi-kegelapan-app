import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { accounts, tenants } from "#/db/schema";
import { registerDevice } from "#/server/deviceRegistry";
import { createSession } from "#/server/authSession";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

function verifyPassword(password: string, stored: string): boolean {
  // Format A: server-side hash "pbkdf2$saltHex$hashHex"
  if (stored.startsWith("pbkdf2$")) {
    const parts = stored.split("$");
    if (parts.length !== 3) return false;
    const [, salt, hash] = parts;
    const computed = pbkdf2Sync(password, salt, 310_000, 32, "sha256").toString("hex");
    try {
      return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computed, "hex"));
    } catch {
      return false;
    }
  }

  // Format B: client-side hash "iterations:saltHex:hashHex"
  const colonParts = stored.split(":");
  if (colonParts.length === 3) {
    const [iterStr, saltHex, hashHex] = colonParts;
    const iterations = parseInt(iterStr, 10);
    if (!Number.isInteger(iterations) || iterations <= 0) return false;
    const computed = pbkdf2Sync(
      password,
      Buffer.from(saltHex, "hex"),
      iterations,
      32,
      "sha256",
    ).toString("hex");
    try {
      return timingSafeEqual(Buffer.from(hashHex, "hex"), Buffer.from(computed, "hex"));
    } catch {
      return false;
    }
  }

  return false;
}

export const authRoutes = new Hono<{ Bindings: Env }>();

/**
 * Build a simple JWT-like access token (header.payload.signature).
 * The payload is base64-encoded JSON containing accountId, tenantId, role, and deviceId.
 * Note: This is NOT cryptographically signed — it relies on HTTPS transport security.
 * For production, replace with proper HMAC-signed JWT using SESSION_MASTER_KEY.
 */
function buildAccessToken(payload: {
  accountId: string;
  tenantId: string;
  role: string;
  deviceId?: string;
}): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = btoa(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
    }),
  );
  // Placeholder signature — upgrade to HMAC-SHA256 with SESSION_MASTER_KEY for production
  const sig = "unsigned";
  return `${header}.${body}.${sig}`;
}

authRoutes.post("/token", async (c) => {
  const json = await c.req.json().catch(() => null);
  if (!json?.username || !json?.password) {
    return c.json({ error: "username and password required" }, 400);
  }

  const db = drizzle(c.env.DB);

  // If tenantSlug is provided, scope the account lookup to that tenant
  let account;
  if (json.tenantSlug) {
    const tenant = await db.select().from(tenants).where(eq(tenants.slug, json.tenantSlug)).get();

    if (!tenant) {
      return c.json({ error: "Tenant not found" }, 404);
    }

    account = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.username, json.username),
          eq(accounts.status, "active"),
          eq(accounts.tenantId, tenant.tenantId),
        ),
      )
      .get();
  } else {
    account = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.username, json.username), eq(accounts.status, "active")))
      .get();
  }

  if (!account || !verifyPassword(json.password, account.passwordHash)) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const tenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.tenantId, account.tenantId))
    .get();

  if (!tenant || tenant.status !== "active") {
    return c.json({ error: "Tenant inactive" }, 401);
  }

  // Device fingerprint integration: register device and create auth session
  const deviceFingerprint = json.deviceFingerprint as
    | { hash: string; userAgent: string; platform: string }
    | undefined;

  let deviceId: string | undefined;
  let sessionId: string | undefined;
  let refreshToken: string | undefined;
  let expiresAt: number | undefined;

  if (deviceFingerprint?.hash) {
    // Register/upsert device in the Device Registry
    const device = await registerDevice(db, {
      tenantId: account.tenantId,
      accountId: account.accountId,
      fingerprintHash: deviceFingerprint.hash,
      userAgent: deviceFingerprint.userAgent || "unknown",
      platform: deviceFingerprint.platform || "unknown",
    });

    deviceId = device.deviceId;

    // Create an auth session bound to this device
    const session = await createSession(db, {
      tenantId: account.tenantId,
      accountId: account.accountId,
      deviceId: device.deviceId,
    });

    sessionId = session.sessionId;
    refreshToken = session.refreshToken;
    expiresAt = session.expiresAt;
  }

  return c.json({
    accountId: account.accountId,
    tenantId: account.tenantId,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    role: account.role,
    // Simple base64-encoded access token for API authentication
    // Format: header.payload.signature (JWT-like, payload is base64 JSON)
    accessToken: buildAccessToken({
      accountId: account.accountId,
      tenantId: account.tenantId,
      role: account.role,
      deviceId,
    }),
    ...(deviceId && { deviceId }),
    ...(sessionId && { sessionId }),
    ...(refreshToken && { refreshToken }),
    ...(expiresAt && { expiresAt }),
  });
});
