import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { accounts, tenants } from "../../../src/db/schema";
import { registerDevice } from "../../../src/server/deviceRegistry";
import { createSession } from "../../../src/server/authSession";

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

authRoutes.post("/token", async (c) => {
  const json = await c.req.json().catch(() => null);
  if (!json?.username || !json?.password) {
    return c.json({ error: "username and password required" }, 400);
  }

  const db = drizzle(c.env.DB);

  const account = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.username, json.username), eq(accounts.status, "active")))
    .get();

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
    ...(deviceId && { deviceId }),
    ...(sessionId && { sessionId }),
    ...(refreshToken && { refreshToken }),
    ...(expiresAt && { expiresAt }),
  });
});
