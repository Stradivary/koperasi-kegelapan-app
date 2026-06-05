import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { accounts, tenants } from "#/infrastructure/persistence/drizzle/schema";
import { registerDevice } from "#/application/device/deviceRegistry.usecase";
import {
  createSession,
  refreshSession,
  AuthSessionError,
} from "#/application/auth/authSession.usecase";
import { signAccessToken } from "../lib/jwt";

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
 * Build and sign a JWT access token using HMAC-SHA256.
 * Token includes accountId, tenantId, role, deviceId, iat, and exp (1 hour).
 */
async function buildAccessToken(
  payload: {
    accountId: string;
    tenantId: string;
    role: string;
    deviceId?: string;
  },
  masterKey: string,
): Promise<string> {
  return signAccessToken(
    {
      accountId: payload.accountId,
      tenantId: payload.tenantId,
      role: payload.role,
      deviceId: payload.deviceId,
    },
    masterKey,
  );
}

authRoutes.post("/token", async (c) => {
  // ── Step 1: Parse request body ───────────────────────────────────────────
  const parsedBody = c.get("parsedBody" as never) as Record<string, unknown> | undefined;
  const json = parsedBody ?? (await c.req.json().catch(() => null));

  console.log("[auth/token] Step 1 - Body parsing:", {
    hadParsedBody: !!parsedBody,
    jsonIsNull: json === null,
    hasUsername: !!json?.username,
    hasPassword: !!json?.password,
    hasTenantSlug: !!json?.tenantSlug,
    tenantSlug: json?.tenantSlug ?? "(empty)",
    username: json?.username ?? "(empty)",
  });

  if (!json?.username || !json?.password) {
    return c.json({ error: "username and password required" }, 400);
  }

  const db = drizzle(c.env.DB);

  // ── Step 2: Tenant lookup ────────────────────────────────────────────────
  let account;
  let tenant;
  if (json.tenantSlug) {
    tenant = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, json.tenantSlug as string))
      .get();

    console.log("[auth/token] Step 2 - Tenant lookup:", {
      slug: json.tenantSlug,
      found: !!tenant,
      tenantId: tenant?.tenantId ?? "N/A",
      tenantStatus: tenant?.status ?? "N/A",
    });

    if (!tenant) {
      return c.json({ error: "Tenant not found" }, 404);
    }

    // ── Step 3: Account lookup (scoped to tenant) ────────────────────────
    account = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.username, json.username as string),
          eq(accounts.status, "active"),
          eq(accounts.tenantId, tenant.tenantId),
        ),
      )
      .get();

    console.log("[auth/token] Step 3 - Account lookup (tenant-scoped):", {
      username: json.username,
      tenantId: tenant.tenantId,
      found: !!account,
      accountId: account?.accountId ?? "N/A",
      role: account?.role ?? "N/A",
      status: account?.status ?? "N/A",
      hashPrefix: account?.passwordHash?.substring(0, 15) ?? "N/A",
    });
  } else {
    // No tenantSlug: search by username across all tenants.
    // If multiple accounts share the same username (different tenants),
    // prefer superadmin, otherwise return the first active match.
    const allMatches = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.username, json.username as string), eq(accounts.status, "active")))
      .all();

    // Prefer superadmin if present, otherwise take the first match
    account = allMatches.find((a) => a.role === "superadmin") ?? allMatches[0] ?? undefined;

    console.log("[auth/token] Step 3 - Account lookup (no slug):", {
      username: json.username,
      matchCount: allMatches.length,
      found: !!account,
      accountId: account?.accountId ?? "N/A",
      role: account?.role ?? "N/A",
    });
  }

  // ── Step 4: Password verification ─────────────────────────────────────
  let isPasswordValid = false;
  let passwordError: string | null = null;
  if (account) {
    try {
      isPasswordValid = await verifyPassword(json.password as string, account.passwordHash);
    } catch (e) {
      passwordError = e instanceof Error ? e.message : String(e);
    }
  }

  console.log("[auth/token] Step 4 - Password verification:", {
    accountExists: !!account,
    isPasswordValid,
    passwordError,
    hashFormat: account?.passwordHash?.startsWith("pbkdf2$")
      ? "A (pbkdf2$salt$hash)"
      : account?.passwordHash?.includes(":")
        ? "B (iter:salt:hash)"
        : "unknown",
    hashLength: account?.passwordHash?.length ?? 0,
  });

  if (!account || !isPasswordValid) {
    const debugInfo = {
      step: !account ? "account_not_found" : "password_mismatch",
      username: json.username,
      tenantSlug: json.tenantSlug ?? "(none)",
      accountFound: !!account,
      accountStatus: account?.status ?? "N/A",
      passwordError,
      hashFormat: account?.passwordHash?.startsWith("pbkdf2$")
        ? "A"
        : account?.passwordHash?.includes(":")
          ? "B"
          : "unknown",
      hashLength: account?.passwordHash?.length ?? 0,
      hashPrefix: account?.passwordHash?.substring(0, 20) ?? "N/A",
    };
    return c.json({ error: "Invalid credentials", debug: debugInfo }, 401);
  }

  if (!tenant) {
    tenant = await db.select().from(tenants).where(eq(tenants.tenantId, account.tenantId)).get();
  }

  // Superadmin accounts bypass the tenant active check — they must always be
  // able to log in regardless of their tenant's status (e.g. to reactivate it).
  if (account.role !== "superadmin" && tenant?.status !== "active") {
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
    tenantSlug: tenant?.slug,
    tenantName: tenant?.name,
    role: account.role,
    // HMAC-SHA256 signed access token (1 hour expiry)
    accessToken: await buildAccessToken(
      {
        accountId: account.accountId,
        tenantId: account.tenantId,
        role: account.role,
        deviceId,
      },
      c.env.SESSION_MASTER_KEY,
    ),
    ...(deviceId && { deviceId }),
    ...(sessionId && { sessionId }),
    ...(refreshToken && { refreshToken }),
    ...(expiresAt && { expiresAt }),
  });
});

// ─── POST /refresh - Rotate refresh token and issue new access token ─────────

authRoutes.post("/refresh", async (c) => {
  const json = await c.req.json().catch(() => null);
  if (!json?.sessionId || !json?.refreshToken) {
    return c.json({ error: "sessionId and refreshToken required" }, 400);
  }

  const db = drizzle(c.env.DB);

  try {
    const result = await refreshSession(db, json.sessionId, json.refreshToken);

    // Look up the session's account to build a new access token
    const { authSessions } = await import("#/infrastructure/persistence/drizzle/schema");
    const session = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.sessionId, result.sessionId))
      .get();

    if (!session) {
      return c.json({ error: "Session not found" }, 401);
    }

    const account = await db
      .select()
      .from(accounts)
      .where(eq(accounts.accountId, session.accountId))
      .get();

    if (!account || account.status !== "active") {
      return c.json({ error: "Account inactive" }, 401);
    }

    const accessToken = await buildAccessToken(
      {
        accountId: account.accountId,
        tenantId: session.tenantId,
        role: account.role,
        deviceId: session.deviceId,
      },
      c.env.SESSION_MASTER_KEY,
    );

    return c.json({
      accessToken,
      refreshToken: result.newRefreshToken,
      sessionId: result.sessionId,
      expiresAt: result.expiresAt,
    });
  } catch (e) {
    if (e instanceof AuthSessionError) {
      const status = e.code === "SESSION_NOT_FOUND" ? 404 : 401;
      return c.json({ error: e.message, code: e.code }, status);
    }
    console.error("[auth/refresh] unexpected error:", e);
    return c.json({ error: "Internal server error" }, 500);
  }
});
