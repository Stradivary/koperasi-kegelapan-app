import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { accounts, tenants } from "#/infrastructure/persistence/drizzle/schema";
import { registerDevice } from "#/server/deviceRegistry";
import { createSession } from "#/server/authSession";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

/**
 * PBKDF2-SHA256 using Web Crypto API.
 * Uses 100,000 iterations max (Cloudflare Workers limit).
 */
async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
  keyLength: number,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations, hash: "SHA-256" },
    keyMaterial,
    keyLength * 8,
  );
  return new Uint8Array(derived);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Format A: server-side hash "pbkdf2$saltHex$hashHex"
  if (stored.startsWith("pbkdf2$")) {
    const parts = stored.split("$");
    if (parts.length !== 3) return false;
    const [, salt, hash] = parts;
    // Salt was stored as hex string and used as-is (UTF-8 encoded) in pbkdf2Sync
    const saltBytes = new TextEncoder().encode(salt);
    const computed = await pbkdf2(password, saltBytes, 100_000, 32);
    try {
      return constantTimeEqual(hexToBytes(hash), computed);
    } catch {
      return false;
    }
  }

  // Format B: client-side hash "iterations:saltHex:hashHex"
  const colonParts = stored.split(":");
  if (colonParts.length === 3) {
    const [iterStr, saltHex, hashHex] = colonParts;
    const iterations = Number.parseInt(iterStr, 10);
    if (!Number.isInteger(iterations) || iterations <= 0) return false;
    const safeIterations = Math.min(iterations, 100_000);
    const saltBytes = hexToBytes(saltHex);
    const computed = await pbkdf2(password, saltBytes, safeIterations, 32);
    try {
      return constantTimeEqual(hexToBytes(hashHex), computed);
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

  if (!account || !(await verifyPassword(json.password, account.passwordHash))) {
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
