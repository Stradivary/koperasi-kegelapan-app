import { Hono } from "hono";
import { requireSuperadmin, isAuthError } from "#/server/superadminAuth";
import {
  listTenants,
  createTenant,
  getTenantDetail,
  updateTenantStatus,
  type TenantStatus,
} from "#/server/superadminTenants";

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
    return c.json(result.data, result.status as 201 | 400 | 409);
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
    return c.json(result.data, result.status as 200 | 404);
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
    return c.json(result.data, result.status as 200 | 404 | 422);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: `Internal server error: ${msg}` }, 500);
  }
});
