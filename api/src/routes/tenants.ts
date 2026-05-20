import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, like, or, asc, sql } from "drizzle-orm";
import { tenants, accounts } from "../../../src/db/schema";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

const SLUG_MIN_LENGTH = 3;
const SLUG_MAX_LENGTH = 50;

// ─── Validation helpers ───────────────────────────────────────────────────────

interface ValidationError {
  field: string;
  message: string;
}

function validateSlug(slug: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof slug !== "string") {
    errors.push({ field: "slug", message: "slug is required and must be a string" });
    return errors;
  }
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    errors.push({
      field: "slug",
      message: `slug must be between ${SLUG_MIN_LENGTH} and ${SLUG_MAX_LENGTH} characters`,
    });
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length >= SLUG_MIN_LENGTH) {
    errors.push({
      field: "slug",
      message: "slug must start and end with a lowercase letter or digit",
    });
  } else if (slug.length < SLUG_MIN_LENGTH && slug.length > 0 && !/^[a-z0-9]+$/.test(slug)) {
    errors.push({
      field: "slug",
      message: "slug must contain only lowercase letters, digits, and hyphens",
    });
  }
  if (/[^a-z0-9-]/.test(slug)) {
    errors.push({
      field: "slug",
      message: "slug must contain only lowercase letters, digits, and hyphens",
    });
  }
  if (/--/.test(slug)) {
    errors.push({ field: "slug", message: "slug must not contain consecutive hyphens" });
  }
  return errors;
}

function validateName(name: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof name !== "string") {
    errors.push({ field: "name", message: "name is required and must be a string" });
    return errors;
  }
  if (name.length < 2 || name.length > 100) {
    errors.push({ field: "name", message: "name must be between 2 and 100 characters" });
  }
  if (!/\S/.test(name)) {
    errors.push({
      field: "name",
      message: "name must contain at least one non-whitespace character",
    });
  }
  return errors;
}

function validateTimezone(timezone: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof timezone !== "string") {
    errors.push({ field: "timezone", message: "timezone is required and must be a string" });
    return errors;
  }
  if (timezone.length === 0) {
    errors.push({ field: "timezone", message: "timezone is required" });
    return errors;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    errors.push({ field: "timezone", message: "timezone must be a valid IANA timezone string" });
  }
  return errors;
}

function validateAdminUsername(adminUsername: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof adminUsername !== "string") {
    errors.push({
      field: "adminUsername",
      message: "adminUsername is required and must be a string",
    });
    return errors;
  }
  if (adminUsername.length < 3 || adminUsername.length > 50) {
    errors.push({
      field: "adminUsername",
      message: "adminUsername must be between 3 and 50 characters",
    });
  }
  if (/\s/.test(adminUsername)) {
    errors.push({ field: "adminUsername", message: "adminUsername must not contain spaces" });
  }
  if (!/^[a-z0-9_-]+$/.test(adminUsername) && adminUsername.length > 0) {
    errors.push({
      field: "adminUsername",
      message:
        "adminUsername must contain only lowercase letters, digits, underscores, and hyphens",
    });
  }
  return errors;
}

function validateAdminPasswordHash(adminPasswordHash: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof adminPasswordHash !== "string") {
    errors.push({
      field: "adminPasswordHash",
      message: "adminPasswordHash is required and must be a string",
    });
    return errors;
  }
  const parts = adminPasswordHash.split(":");
  if (parts.length !== 3) {
    errors.push({
      field: "adminPasswordHash",
      message: "adminPasswordHash must be in format iterations:saltHex:hashHex",
    });
    return errors;
  }
  const [iterationsStr, saltHex, hashHex] = parts;
  const iterations = Number(iterationsStr);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    errors.push({
      field: "adminPasswordHash",
      message: "adminPasswordHash iterations must be a positive integer",
    });
  }
  if (!/^[0-9a-f]{32}$/.test(saltHex)) {
    errors.push({
      field: "adminPasswordHash",
      message: "adminPasswordHash saltHex must be a 32-character hexadecimal string",
    });
  }
  if (!/^[0-9a-f]{64}$/.test(hashHex)) {
    errors.push({
      field: "adminPasswordHash",
      message: "adminPasswordHash hashHex must be a 64-character hexadecimal string",
    });
  }
  return errors;
}

function validateSyncRequest(body: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (body === null || body === undefined || typeof body !== "object") {
    errors.push({ field: "body", message: "request body is required and must be an object" });
    return errors;
  }
  const req = body as Record<string, unknown>;
  errors.push(...validateSlug(req.slug));
  errors.push(...validateName(req.name));
  errors.push(...validateTimezone(req.timezone));
  errors.push(...validateAdminUsername(req.adminUsername));
  errors.push(...validateAdminPasswordHash(req.adminPasswordHash));
  return errors;
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
        // Re-check to determine which constraint was violated
        const recheckSlug = await db
          .select({
            tenantId: tenants.tenantId,
            slug: tenants.slug,
            name: tenants.name,
          })
          .from(tenants)
          .where(eq(sql`lower(${tenants.slug})`, req.slug.toLowerCase()))
          .get();

        const recheckAdmin = await db
          .select({
            accountId: accounts.accountId,
            tenantId: accounts.tenantId,
          })
          .from(accounts)
          .where(
            and(
              eq(sql`lower(${accounts.username})`, req.adminUsername.toLowerCase()),
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
            existingSlug: req.slug,
          },
          409,
        );
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
