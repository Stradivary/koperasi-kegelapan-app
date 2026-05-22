import { Hono } from "hono";
import { requireSuperadmin, isAuthError } from "#/server/superadminAuth";
import {
  listTenants,
  createTenant,
  getTenantDetail,
  updateTenantStatus,
  type TenantStatus,
} from "#/server/superadminTenants";
import {
  listAccounts,
  createAccount,
  changeAccountPassword,
  updateAccountStatus,
} from "#/server/superadminAccounts";
import { getDb } from "#/db";
import { devices } from "#/db/schema";
import { eq } from "drizzle-orm";
import {
  getDevicesByTenant,
  blockDevice,
  unblockDevice,
  revokeDeviceSessions,
} from "#/server/deviceRegistry";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

const VALID_STATUSES: TenantStatus[] = ["active", "suspended", "archived"];

export const superadminRoutes = new Hono<{ Bindings: Env }>();

// ─── GET /tenants ────────────────────────────────────────────────────────────

superadminRoutes.get("/tenants", async (c) => {
  const authResult = await requireSuperadmin(c.req.raw);
  if (isAuthError(authResult)) return authResult;

  const url = new URL(c.req.url);
  const pageParam = url.searchParams.get("page");
  const pageSizeParam = url.searchParams.get("pageSize");
  const search = url.searchParams.get("search") ?? undefined;

  const page = pageParam ? Number(pageParam) : undefined;
  const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

  try {
    const result = await listTenants({ page, pageSize, search });
    return c.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/superadmin/tenants] listTenants failed:", msg);
    return c.json({ error: `Internal server error: ${msg}` }, 500);
  }
});

// ─── POST /tenants ───────────────────────────────────────────────────────────

superadminRoutes.post("/tenants", async (c) => {
  const authResult = await requireSuperadmin(c.req.raw);
  if (isAuthError(authResult)) return authResult;

  const body = await c.req.json().catch(() => null);

  try {
    const result = await createTenant(body);
    return c.json(result.data, result.status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/superadmin/tenants] createTenant failed:", msg);
    return c.json({ error: `Internal server error: ${msg}` }, 500);
  }
});

// ─── GET /tenants/:tenantId ──────────────────────────────────────────────────

superadminRoutes.get("/tenants/:tenantId", async (c) => {
  const authResult = await requireSuperadmin(c.req.raw);
  if (isAuthError(authResult)) return authResult;

  const tenantId = c.req.param("tenantId");

  if (!tenantId) {
    return c.json({ error: "tenantId is required" }, 400);
  }

  try {
    const result = await getTenantDetail(tenantId);
    return c.json(result.data, result.status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[GET /api/superadmin/tenants/${tenantId}] getTenantDetail failed:`, msg);
    return c.json({ error: `Internal server error: ${msg}` }, 500);
  }
});

// ─── PATCH /tenants/:tenantId/status ─────────────────────────────────────────

superadminRoutes.patch("/tenants/:tenantId/status", async (c) => {
  const auth = await requireSuperadmin(c.req.raw);
  if (isAuthError(auth)) return auth;

  const tenantId = c.req.param("tenantId");

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.status !== "string") {
    return c.json({ error: "Request body must include a valid 'status' field" }, 400);
  }

  const targetStatus = body.status as string;
  if (!VALID_STATUSES.includes(targetStatus as TenantStatus)) {
    return c.json(
      { error: `Invalid status value. Must be one of: ${VALID_STATUSES.join(", ")}` },
      400,
    );
  }

  try {
    const result = await updateTenantStatus(tenantId, targetStatus as TenantStatus);
    return c.json(result.data, result.status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: `Internal server error: ${msg}` }, 500);
  }
});

// ─── GET /devices?tenantId=X ─────────────────────────────────────────────────

superadminRoutes.get("/devices", async (c) => {
  const authResult = await requireSuperadmin(c.req.raw);
  if (isAuthError(authResult)) return authResult;

  const url = new URL(c.req.url);
  const tenantId = url.searchParams.get("tenantId");

  if (!tenantId) {
    return c.json({ error: "tenantId query parameter is required" }, 400);
  }

  try {
    const db = getDb();
    const deviceList = await getDevicesByTenant(db, tenantId);
    return c.json({ devices: deviceList });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/superadmin/devices] getDevicesByTenant failed:", msg);
    return c.json({ error: `Internal server error: ${msg}` }, 500);
  }
});

// ─── POST /devices/:deviceId/block ───────────────────────────────────────────

superadminRoutes.post("/devices/:deviceId/block", async (c) => {
  const authResult = await requireSuperadmin(c.req.raw);
  if (isAuthError(authResult)) return authResult;

  const deviceId = c.req.param("deviceId");

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.durationSeconds !== "number") {
    return c.json(
      { error: "Request body must include a valid 'durationSeconds' field (number)" },
      400,
    );
  }

  const durationSeconds = body.durationSeconds;

  // Validate duration range: 60 to 31,536,000 seconds (1 minute to 365 days)
  if (!Number.isInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 31_536_000) {
    return c.json(
      {
        error:
          "Invalid duration. Must be an integer between 60 and 31,536,000 seconds (1 minute to 365 days)",
      },
      400,
    );
  }

  try {
    const db = getDb();

    // Verify device exists
    const device = await db
      .select({ deviceId: devices.deviceId })
      .from(devices)
      .where(eq(devices.deviceId, deviceId))
      .get();

    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    // Execute block + session revocation atomically in a single transaction
    const now = Math.floor(Date.now() / 1000);
    const blockedUntil = now + durationSeconds;
    let sessionsRevoked = 0;

    await db.transaction(async (tx) => {
      await blockDevice(tx as unknown as typeof db, deviceId, durationSeconds);
      sessionsRevoked = await revokeDeviceSessions(tx as unknown as typeof db, deviceId);
    });

    return c.json({
      blocked: true,
      deviceId,
      blockedUntil,
      sessionsRevoked,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[POST /api/superadmin/devices/${deviceId}/block] failed:`, msg);
    return c.json({ error: `Internal server error: ${msg}` }, 500);
  }
});

// ─── POST /devices/:deviceId/unblock ─────────────────────────────────────────

superadminRoutes.post("/devices/:deviceId/unblock", async (c) => {
  const authResult = await requireSuperadmin(c.req.raw);
  if (isAuthError(authResult)) return authResult;

  const deviceId = c.req.param("deviceId");

  try {
    const db = getDb();

    // Verify device exists
    const device = await db
      .select({ deviceId: devices.deviceId })
      .from(devices)
      .where(eq(devices.deviceId, deviceId))
      .get();

    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    await unblockDevice(db, deviceId);

    return c.json({ blocked: false, deviceId, blockedUntil: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[POST /api/superadmin/devices/${deviceId}/unblock] failed:`, msg);
    return c.json({ error: `Internal server error: ${msg}` }, 500);
  }
});

// ─── GET /accounts ───────────────────────────────────────────────────────────

superadminRoutes.get("/accounts", async (c) => {
  const authResult = await requireSuperadmin(c.req.raw);
  if (isAuthError(authResult)) return authResult;

  const url = new URL(c.req.url);
  const pageParam = url.searchParams.get("page");
  const pageSizeParam = url.searchParams.get("pageSize");
  const search = url.searchParams.get("search") ?? undefined;

  const page = pageParam ? Number(pageParam) : undefined;
  const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

  try {
    const result = await listAccounts({ page, pageSize, search });
    return c.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/superadmin/accounts] listAccounts failed:", msg);
    return c.json({ error: `Internal server error: ${msg}` }, 500);
  }
});

// ─── POST /accounts ──────────────────────────────────────────────────────────

superadminRoutes.post("/accounts", async (c) => {
  const authResult = await requireSuperadmin(c.req.raw);
  if (isAuthError(authResult)) return authResult;

  const body = await c.req.json().catch(() => null);

  try {
    const result = await createAccount(body);
    return c.json(result.data, result.status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/superadmin/accounts] createAccount failed:", msg);
    return c.json({ error: `Internal server error: ${msg}` }, 500);
  }
});

// ─── PATCH /accounts/:accountId/status ───────────────────────────────────────

superadminRoutes.patch("/accounts/:accountId/status", async (c) => {
  const authResult = await requireSuperadmin(c.req.raw);
  if (isAuthError(authResult)) return authResult;

  const accountId = c.req.param("accountId");
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body.status !== "string") {
    return c.json({ error: "Request body must include a valid 'status' field" }, 400);
  }

  try {
    const result = await updateAccountStatus({ accountId, status: body.status });
    return c.json(result.data, result.status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[PATCH /api/superadmin/accounts/${accountId}/status] failed:`, msg);
    return c.json({ error: `Internal server error: ${msg}` }, 500);
  }
});

// ─── POST /accounts/:accountId/change-password ───────────────────────────────

superadminRoutes.post("/accounts/:accountId/change-password", async (c) => {
  const authResult = await requireSuperadmin(c.req.raw);
  if (isAuthError(authResult)) return authResult;

  const accountId = c.req.param("accountId");
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body.newPassword !== "string") {
    return c.json({ error: "Request body must include 'newPassword'" }, 400);
  }

  try {
    const result = await changeAccountPassword({ accountId, newPassword: body.newPassword });
    return c.json(result.data, result.status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[POST /api/superadmin/accounts/${accountId}/change-password] failed:`, msg);
    return c.json({ error: `Internal server error: ${msg}` }, 500);
  }
});
