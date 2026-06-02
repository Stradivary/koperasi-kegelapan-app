import { getDb } from "#/infrastructure/persistence/drizzle";
import { tenants, accounts } from "#/infrastructure/persistence/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { SLUG_MIN_LENGTH, SLUG_MAX_LENGTH } from "#/core/validation/slugValidation";

export interface SyncRequest {
  slug: string;
  name: string;
  timezone: string;
  adminUsername: string;
  adminPasswordHash: string;
  /** If previously synced, the server-assigned tenant ID to identify self */
  serverTenantId?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface SyncSuccessResponse {
  tenantId: string;
  slug: string;
  name: string;
  synced: true;
}

export interface SyncConflictResponse {
  error: "conflict";
  conflictType: "slug_and_admin" | "slug_only" | "admin_only";
  existingTenantName: string;
  existingSlug: string;
}

/**
 * Validate a tenant slug.
 * Rules: 3-50 chars, lowercase alphanumeric + hyphens only,
 * no consecutive hyphens, must start/end with letter or digit.
 */
export function validateSlug(slug: unknown): ValidationError[] {
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

/**
 * Validate a tenant name.
 * Rules: 2-100 chars, at least one non-whitespace character.
 */
export function validateName(name: unknown): ValidationError[] {
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

/**
 * Validate a timezone string.
 * Rules: must be a valid IANA timezone (validated via Intl.DateTimeFormat).
 */
export function validateTimezone(timezone: unknown): ValidationError[] {
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

/**
 * Validate an admin username.
 * Rules: 3-50 chars, lowercase letters/digits/underscores/hyphens, no spaces.
 */
export function validateAdminUsername(adminUsername: unknown): ValidationError[] {
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

/**
 * Validate an admin password hash.
 * Rules: format `iterations:saltHex:hashHex` where iterations is a positive integer,
 * saltHex is a 32-character hexadecimal string, and hashHex is a 64-character hexadecimal string.
 */
export function validateAdminPasswordHash(adminPasswordHash: unknown): ValidationError[] {
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

/**
 * Validate an entire SyncRequest body.
 * Returns an array of all validation errors across all fields.
 * An empty array means the request is valid.
 */
export function validateSyncRequest(body: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (body === null || body === undefined || typeof body !== "object") {
    errors.push({ field: "body", message: "request body is required and must be an object" });
    return errors;
  }

  const req = body as Record<string, unknown>;

  errors.push(
    ...validateSlug(req.slug),
    ...validateName(req.name),
    ...validateTimezone(req.timezone),
    ...validateAdminUsername(req.adminUsername),
    ...validateAdminPasswordHash(req.adminPasswordHash),
  );

  return errors;
}

/**
 * Build a conflict response from pre-fetched conflict data.
 * Shared by both tenant sync and superadmin tenant creation flows.
 */
export function buildConflictResult(
  existingBySlug: { slug: string; name: string } | undefined,
  existingByAdmin: { tenantId: string } | undefined,
  conflictTenant?: { slug: string; name: string } | undefined,
): SyncConflictResponse {
  if (existingBySlug !== undefined && existingByAdmin !== undefined) {
    return {
      error: "conflict",
      conflictType: "slug_and_admin",
      existingTenantName: existingBySlug.name,
      existingSlug: existingBySlug.slug,
    };
  }
  if (existingBySlug !== undefined) {
    return {
      error: "conflict",
      conflictType: "slug_only",
      existingTenantName: existingBySlug.name,
      existingSlug: existingBySlug.slug,
    };
  }
  return {
    error: "conflict",
    conflictType: "admin_only",
    existingTenantName: conflictTenant?.name ?? "Unknown",
    existingSlug: conflictTenant?.slug ?? "",
  };
}

/**
 * Re-check slug and admin username after a UNIQUE constraint violation.
 * Returns a SyncConflictResponse, or null if neither constraint can be confirmed.
 */
async function handleRaceConflict(
  db: ReturnType<typeof getDb>,
  slug: string,
  adminUsername: string,
): Promise<SyncConflictResponse | null> {
  const recheckSlug = await db
    .select({ tenantId: tenants.tenantId, slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .where(eq(sql`lower(${tenants.slug})`, slug.toLowerCase()))
    .get();

  const recheckAdmin = await db
    .select({ accountId: accounts.accountId, tenantId: accounts.tenantId })
    .from(accounts)
    .where(
      and(
        eq(sql`lower(${accounts.username})`, adminUsername.toLowerCase()),
        eq(accounts.role, "admin"),
      ),
    )
    .get();

  if (!recheckSlug && !recheckAdmin) return null;

  let conflictTenant: { slug: string; name: string } | undefined;
  if (!recheckSlug && recheckAdmin) {
    conflictTenant = await db
      .select({ slug: tenants.slug, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.tenantId, recheckAdmin.tenantId))
      .get();
  }

  return buildConflictResult(recheckSlug, recheckAdmin, conflictTenant);
}

/**
 * Process a tenant sync request with conflict detection.
 *
 * Checks slug and admin username uniqueness (case-insensitive),
 * returns conflict details if either exists, or creates tenant + admin
 * account in a single transaction if no conflict.
 *
 * Handles race conditions by catching unique constraint violations
 * and returning them as 409 conflicts.
 */
export async function processTenantSync(
  request: SyncRequest,
): Promise<SyncSuccessResponse | SyncConflictResponse> {
  const db = getDb();

  // Step 1: Check slug uniqueness (case-insensitive)
  const existingBySlug = await db
    .select({
      tenantId: tenants.tenantId,
      slug: tenants.slug,
      name: tenants.name,
    })
    .from(tenants)
    .where(eq(sql`lower(${tenants.slug})`, request.slug.toLowerCase()))
    .get();

  // Step 2: Check admin username uniqueness (case-insensitive, role = "admin")
  const existingByAdmin = await db
    .select({
      accountId: accounts.accountId,
      tenantId: accounts.tenantId,
      username: accounts.username,
    })
    .from(accounts)
    .where(
      and(
        eq(sql`lower(${accounts.username})`, request.adminUsername.toLowerCase()),
        eq(accounts.role, "admin"),
      ),
    )
    .get();

  // Step 3: Determine conflict type
  const hasSlugConflict = existingBySlug !== undefined;
  const hasAdminConflict = existingByAdmin !== undefined;

  if (hasSlugConflict || hasAdminConflict) {
    let conflictTenant: { tenantId: string; slug: string; name: string } | undefined;
    if (!hasSlugConflict && hasAdminConflict) {
      conflictTenant = await db
        .select({ tenantId: tenants.tenantId, slug: tenants.slug, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.tenantId, existingByAdmin.tenantId))
        .get();
    }
    return buildConflictResult(existingBySlug, existingByAdmin, conflictTenant);
  }

  // Step 4: No conflict - create tenant + admin account atomically via D1 batch
  const tenantId = crypto.randomUUID();
  const accountId = crypto.randomUUID();

  try {
    await db.batch([
      db.insert(tenants).values({
        tenantId,
        slug: request.slug,
        name: request.name,
        timezone: request.timezone,
        status: "active",
      }),
      db.insert(accounts).values({
        accountId,
        tenantId,
        username: request.adminUsername,
        passwordHash: request.adminPasswordHash,
        role: "admin",
        status: "active",
      }),
    ]);
  } catch (e: unknown) {
    // Handle race condition: unique constraint violation means another request
    // created the same slug/admin between our check and insert
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || msg.includes("unique") || msg.includes("duplicate")) {
      const conflictResult = await handleRaceConflict(db, request.slug, request.adminUsername);
      if (conflictResult) return conflictResult;

      // Fallback: constraint violation but can't determine which - treat as slug conflict
      return {
        error: "conflict" as const,
        conflictType: "slug_and_admin" as const,
        existingTenantName: "Unknown",
        existingSlug: request.slug,
      };
    }

    // Non-constraint error - rethrow
    throw e;
  }

  return {
    tenantId,
    slug: request.slug,
    name: request.name,
    synced: true,
  };
}
