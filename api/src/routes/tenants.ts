import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, like, or, asc, sql } from "drizzle-orm";
import { tenants, accounts } from "#/infrastructure/persistence/drizzle/schema";
import { validateSyncRequest } from "#/application/tenant/tenantSync.usecase";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

// ─── Types ────────────────────────────────────────────────────────────────────

type DrizzleDb = ReturnType<typeof drizzle>;

interface ExistingBySlug {
  tenantId: string;
  slug: string;
  name: string;
}

interface ExistingByAdmin {
  accountId: string;
  tenantId: string;
  username: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a conflict JSON response for pre-insert slug/admin conflicts.
 * Returns a Response when a conflict is detected, or null when there is none.
 */
async function handleConflictResponse(
  c: { json: (body: unknown, status?: number) => Response },
  existingBySlug: ExistingBySlug | undefined,
  existingByAdmin: ExistingByAdmin | undefined,
  db: DrizzleDb,
): Promise<Response | null> {
  const hasSlugConflict = existingBySlug !== undefined;
  const hasAdminConflict = existingByAdmin !== undefined;

  if (hasSlugConflict && hasAdminConflict) {
    return c.json(
      {
        error: "conflict",
        conflictType: "slug_and_admin",
        existingTenantName: existingBySlug.name,
        existingSlug: existingBySlug.slug,
      },
      409,
    );
  }

  if (hasSlugConflict) {
    return c.json(
      {
        error: "conflict",
        conflictType: "slug_only",
        existingTenantName: existingBySlug.name,
        existingSlug: existingBySlug.slug,
      },
      409,
    );
  }

  if (hasAdminConflict) {
    const conflictTenant = await db
      .select({
        tenantId: tenants.tenantId,
        slug: tenants.slug,
        name: tenants.name,
      })
      .from(tenants)
      .where(eq(tenants.tenantId, existingByAdmin.tenantId))
      .get();

    return c.json(
      {
        error: "conflict",
        conflictType: "admin_only",
        existingTenantName: conflictTenant?.name ?? "Unknown",
        existingSlug: conflictTenant?.slug ?? "",
      },
      409,
    );
  }

  return null;
}

/**
 * Handle a race-condition unique-constraint error after a failed batch insert.
 * Re-queries the DB to determine which constraint was violated and returns the
 * appropriate 409 conflict response.
 */
async function handleRaceConditionConflict(
  c: { json: (body: unknown, status?: number) => Response },
  db: DrizzleDb,
  slug: string,
  adminUsername: string,
): Promise<Response> {
  const recheckSlug = await db
    .select({
      tenantId: tenants.tenantId,
      slug: tenants.slug,
      name: tenants.name,
    })
    .from(tenants)
    .where(eq(sql`lower(${tenants.slug})`, slug.toLowerCase()))
    .get();

  const recheckAdmin = await db
    .select({
      accountId: accounts.accountId,
      tenantId: accounts.tenantId,
    })
    .from(accounts)
    .where(
      and(
        eq(sql`lower(${accounts.username})`, adminUsername.toLowerCase()),
        eq(accounts.role, "admin"),
      ),
    )
    .get();

  if (recheckSlug && recheckAdmin) {
    return c.json(
      {
        error: "conflict",
        conflictType: "slug_and_admin",
        existingTenantName: recheckSlug.name,
        existingSlug: recheckSlug.slug,
      },
      409,
    );
  }

  if (recheckSlug) {
    return c.json(
      {
        error: "conflict",
        conflictType: "slug_only",
        existingTenantName: recheckSlug.name,
        existingSlug: recheckSlug.slug,
      },
      409,
    );
  }

  if (recheckAdmin) {
    const conflictTenant = await db
      .select({
        slug: tenants.slug,
        name: tenants.name,
      })
      .from(tenants)
      .where(eq(tenants.tenantId, recheckAdmin.tenantId))
      .get();

    return c.json(
      {
        error: "conflict",
        conflictType: "admin_only",
        existingTenantName: conflictTenant?.name ?? "Unknown",
        existingSlug: conflictTenant?.slug ?? "",
      },
      409,
    );
  }

  // Fallback
  return c.json(
    {
      error: "conflict",
      conflictType: "slug_and_admin",
      existingTenantName: "Unknown",
      existingSlug: slug,
    },
    409,
  );
}

// ─── Hono routes ──────────────────────────────────────────────────────────────

export const tenantsRoutes = new Hono<{ Bindings: Env }>();

// GET /api/tenants/search?q=...&limit=...
tenantsRoutes.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const limitParam = c.req.query("limit");

  if (q.length < 2) {
    return c.json({ error: "Query must be at least 2 characters" }, 400);
  }
  if (q.length > 100) {
    return c.json({ error: "Query must be at most 100 characters" }, 400);
  }

  let limit = 10;
  if (limitParam !== undefined) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      return c.json({ error: "Limit must be a valid integer between 1 and 50" }, 400);
    }
    limit = parsed;
  }

  try {
    const db = drizzle(c.env.DB);
    const pattern = `%${q}%`;

    const results = await db
      .select({
        tenantId: tenants.tenantId,
        slug: tenants.slug,
        name: tenants.name,
      })
      .from(tenants)
      .where(
        and(
          eq(tenants.status, "active"),
          or(like(tenants.name, pattern), like(tenants.slug, pattern)),
        ),
      )
      .orderBy(asc(tenants.name))
      .limit(limit);

    return c.json({ tenants: results, total: results.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

// POST /api/tenants/sync
tenantsRoutes.post("/sync", async (c) => {
  // Step 1: Parse request body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Step 2: Validate request body
  const errors = validateSyncRequest(body);
  if (errors.length > 0) {
    return c.json({ error: "validation_failed", errors }, 400);
  }

  const req = body as {
    slug: string;
    name: string;
    timezone: string;
    adminUsername: string;
    adminPasswordHash: string;
    serverTenantId?: string;
    localTenantId?: string;
  };

  try {
    const db = drizzle(c.env.DB);

    // Step 3: Check slug uniqueness (case-insensitive)
    const existingBySlug = await db
      .select({
        tenantId: tenants.tenantId,
        slug: tenants.slug,
        name: tenants.name,
      })
      .from(tenants)
      .where(eq(sql`lower(${tenants.slug})`, req.slug.toLowerCase()))
      .get();

    // Step 4: Check admin username uniqueness (case-insensitive, role = "admin")
    const existingByAdmin = await db
      .select({
        accountId: accounts.accountId,
        tenantId: accounts.tenantId,
        username: accounts.username,
      })
      .from(accounts)
      .where(
        and(
          eq(sql`lower(${accounts.username})`, req.adminUsername.toLowerCase()),
          eq(accounts.role, "admin"),
        ),
      )
      .get();

    // Step 5: Determine conflict type
    const conflictResponse = await handleConflictResponse(c, existingBySlug, existingByAdmin, db);
    if (conflictResponse) return conflictResponse;

    // Step 6: No conflict — create tenant + admin account atomically via D1 batch
    // Use the client's localTenantId if provided so local and server IDs match
    const tenantId = req.localTenantId ?? crypto.randomUUID();
    const accountId = crypto.randomUUID();

    try {
      await db.batch([
        db.insert(tenants).values({
          tenantId,
          slug: req.slug,
          name: req.name,
          timezone: req.timezone,
          status: "active",
        }),
        db.insert(accounts).values({
          accountId,
          tenantId,
          username: req.adminUsername,
          passwordHash: req.adminPasswordHash,
          role: "admin",
          status: "active",
        }),
      ]);
    } catch (e: unknown) {
      // Handle race condition: unique constraint violation
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("UNIQUE") || msg.includes("unique") || msg.includes("duplicate")) {
        return handleRaceConditionConflict(c, db, req.slug, req.adminUsername);
      }
      // Non-constraint error — rethrow
      throw e;
    }

    // Step 7: Success — return 201 with access token for immediate use
    const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
    const body = btoa(
      JSON.stringify({
        accountId,
        tenantId,
        role: "admin",
        iat: Math.floor(Date.now() / 1000),
      }),
    );
    const accessToken = `${header}.${body}.unsigned`;

    return c.json(
      {
        tenantId,
        accountId,
        slug: req.slug,
        name: req.name,
        synced: true,
        accessToken,
      },
      201,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || msg.includes("unique") || msg.includes("duplicate")) {
      return c.json({ error: "Conflict: tenant or admin already exists" }, 409);
    }
    console.error("[POST /api/tenants/sync] processTenantSync failed:", msg);
    return c.json({ error: `Internal server error: ${msg}` }, 500);
  }
});
