import { getDb } from "#/db";
import { tenants, accounts } from "#/db/schema";
import { eq, sql, like, or, desc, count } from "drizzle-orm";
import {
  validateSlug,
  validateName,
  validateTimezone,
  validateAdminUsername,
  type ValidationError,
} from "./tenantSync";
import { hashPassword } from "./auth";

// Import types and constants from the shared types file
import type {
  TenantStatus,
  TenantListItem,
  TenantListResponse,
  TenantDetail,
  TenantAccountInfo,
  CreateTenantRequest,
  CreateTenantSuccess,
  CreateTenantConflict,
  CreateTenantValidationError,
  CreateTenantResult,
  UpdateTenantStatusResult,
  StatusUpdateError,
} from "./superadminTenants.types";
import { VALID_TRANSITIONS, isValidTransition } from "./superadminTenants.types";

// Re-export all types and pure constants from the shared types file
export type {
  TenantStatus,
  TenantListItem,
  TenantListResponse,
  TenantDetail,
  TenantAccountInfo,
  CreateTenantRequest,
  CreateTenantSuccess,
  CreateTenantConflict,
  CreateTenantValidationError,
  CreateTenantResult,
  UpdateTenantStatusResult,
  StatusUpdateError,
};
export { VALID_TRANSITIONS, isValidTransition };

// ─── List Tenants ────────────────────────────────────────────────────────────

export async function listTenants(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<TenantListResponse> {
  const db = getDb();

  // Clamp pageSize to 1-100, default 20
  let pageSize = params.pageSize ?? 20;
  if (!Number.isInteger(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > 100) pageSize = 100;

  // Default page to 1
  let page = params.page ?? 1;
  if (!Number.isInteger(page) || page < 1) page = 1;

  const search = params.search?.trim() || undefined;

  // Build where condition for search
  const whereCondition = search
    ? or(
        like(sql`lower(${tenants.slug})`, `%${search.toLowerCase()}%`),
        like(sql`lower(${tenants.name})`, `%${search.toLowerCase()}%`),
      )
    : undefined;

  // Get total count
  const totalResult = await db.select({ value: count() }).from(tenants).where(whereCondition).get();

  const total = totalResult?.value ?? 0;

  // Get paginated tenants with account count
  const offset = (page - 1) * pageSize;

  // Use correlated subquery for account count to avoid N+1 queries
  const accountCountExpr = sql<number>`(
    SELECT count(*) FROM ${accounts} WHERE ${accounts.tenantId} = ${tenants.tenantId}
  )`.as("account_count");

  const tenantRows = await db
    .select({
      tenantId: tenants.tenantId,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      timezone: tenants.timezone,
      createdAt: tenants.createdAt,
      accountCount: accountCountExpr,
    })
    .from(tenants)
    .where(whereCondition)
    .orderBy(desc(tenants.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();

  const tenantList: TenantListItem[] = tenantRows.map((t) => ({
    tenantId: t.tenantId,
    slug: t.slug,
    name: t.name,
    status: t.status,
    timezone: t.timezone,
    accountCount: t.accountCount ?? 0,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
  }));

  return {
    tenants: tenantList,
    total,
    page,
    pageSize,
  };
}

// ─── Get Tenant Detail ───────────────────────────────────────────────────────

export async function getTenantDetail(
  tenantId: string,
): Promise<{ status: 200; data: TenantDetail } | { status: 404; data: { error: string } }> {
  const db = getDb();

  const tenant = await db
    .select({
      tenantId: tenants.tenantId,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      timezone: tenants.timezone,
      createdAt: tenants.createdAt,
      updatedAt: tenants.updatedAt,
    })
    .from(tenants)
    .where(eq(tenants.tenantId, tenantId))
    .get();

  if (!tenant) {
    return { status: 404, data: { error: "Tenant not found" } };
  }

  const tenantAccounts = await db
    .select({
      accountId: accounts.accountId,
      username: accounts.username,
      role: accounts.role,
      status: accounts.status,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(eq(accounts.tenantId, tenantId))
    .all();

  return {
    status: 200,
    data: {
      tenantId: tenant.tenantId,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      timezone: tenant.timezone,
      createdAt:
        tenant.createdAt instanceof Date
          ? tenant.createdAt.toISOString()
          : String(tenant.createdAt),
      updatedAt:
        tenant.updatedAt instanceof Date
          ? tenant.updatedAt.toISOString()
          : String(tenant.updatedAt),
      accounts: tenantAccounts.map((a) => ({
        accountId: a.accountId,
        username: a.username,
        role: a.role,
        status: a.status,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
      })),
    },
  };
}

// ─── Create Tenant ───────────────────────────────────────────────────────────

/**
 * Validate admin password.
 * Rules: 8-128 characters.
 */
function validateAdminPassword(password: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof password !== "string") {
    errors.push({
      field: "adminPassword",
      message: "adminPassword is required and must be a string",
    });
    return errors;
  }
  if (password.length < 8 || password.length > 128) {
    errors.push({
      field: "adminPassword",
      message: "adminPassword must be between 8 and 128 characters",
    });
  }
  return errors;
}

/**
 * Create a new tenant with an initial admin account.
 *
 * - Validates all fields using existing validators + password validation
 * - Normalizes slug to lowercase
 * - Checks slug uniqueness (case-insensitive) and admin username uniqueness
 * - Creates tenant + admin account atomically in a single D1 transaction
 * - Hashes admin password using existing hashPassword utility
 * - Returns 409 on conflict, 400 on validation failure, 201 on success
 */
export async function createTenant(body: unknown): Promise<CreateTenantResult> {
  // Validate body is an object
  if (body === null || body === undefined || typeof body !== "object") {
    return {
      status: 400,
      data: {
        error: "validation",
        errors: [{ field: "body", message: "request body is required and must be an object" }],
      },
    };
  }

  const req = body as Record<string, unknown>;

  // Validate all fields
  const validationErrors: ValidationError[] = [];

  // Normalize slug to lowercase before validation
  const rawSlug = typeof req.slug === "string" ? req.slug.toLowerCase() : req.slug;

  validationErrors.push(...validateSlug(rawSlug));
  validationErrors.push(...validateName(req.name));
  validationErrors.push(...validateTimezone(req.timezone));
  validationErrors.push(...validateAdminUsername(req.adminUsername));
  validationErrors.push(...validateAdminPassword(req.adminPassword));

  if (validationErrors.length > 0) {
    return {
      status: 400,
      data: { error: "validation", errors: validationErrors },
    };
  }

  // At this point all fields are valid strings
  const slug = (rawSlug as string).toLowerCase();
  const name = req.name as string;
  const timezone = req.timezone as string;
  const adminUsername = req.adminUsername as string;
  const adminPassword = req.adminPassword as string;

  const db = getDb();

  // Check slug uniqueness (case-insensitive)
  const existingBySlug = await db
    .select({
      tenantId: tenants.tenantId,
      slug: tenants.slug,
      name: tenants.name,
    })
    .from(tenants)
    .where(eq(sql`lower(${tenants.slug})`, slug))
    .get();

  // Check admin username uniqueness (case-insensitive)
  const existingByUsername = await db
    .select({
      accountId: accounts.accountId,
      tenantId: accounts.tenantId,
      username: accounts.username,
    })
    .from(accounts)
    .where(eq(sql`lower(${accounts.username})`, adminUsername.toLowerCase()))
    .get();

  // Determine conflict
  const hasSlugConflict = existingBySlug !== undefined;
  const hasUsernameConflict = existingByUsername !== undefined;

  if (hasSlugConflict && hasUsernameConflict) {
    return {
      status: 409,
      data: {
        error: "conflict",
        conflictType: "slug_and_admin",
        existingTenantName: existingBySlug.name,
        existingSlug: existingBySlug.slug,
      },
    };
  }

  if (hasSlugConflict) {
    return {
      status: 409,
      data: {
        error: "conflict",
        conflictType: "slug_only",
        existingTenantName: existingBySlug.name,
        existingSlug: existingBySlug.slug,
      },
    };
  }

  if (hasUsernameConflict) {
    // Look up the tenant that the existing account belongs to
    const conflictTenant = await db
      .select({
        slug: tenants.slug,
        name: tenants.name,
      })
      .from(tenants)
      .where(eq(tenants.tenantId, existingByUsername.tenantId))
      .get();

    return {
      status: 409,
      data: {
        error: "conflict",
        conflictType: "admin_only",
        existingTenantName: conflictTenant?.name ?? "Unknown",
        existingSlug: conflictTenant?.slug ?? "",
      },
    };
  }

  // Hash the admin password
  const passwordHash = hashPassword(adminPassword);

  // Generate IDs
  const tenantId = crypto.randomUUID();
  const adminAccountId = crypto.randomUUID();

  // Create tenant + admin account atomically in a single transaction
  try {
    await db.transaction(async (tx) => {
      await tx.insert(tenants).values({
        tenantId,
        slug,
        name,
        timezone,
        status: "active",
      });

      await tx.insert(accounts).values({
        accountId: adminAccountId,
        tenantId,
        username: adminUsername,
        passwordHash,
        role: "admin",
        status: "active",
      });
    });
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
        .where(eq(sql`lower(${tenants.slug})`, slug))
        .get();

      const recheckUsername = await db
        .select({
          accountId: accounts.accountId,
          tenantId: accounts.tenantId,
        })
        .from(accounts)
        .where(eq(sql`lower(${accounts.username})`, adminUsername.toLowerCase()))
        .get();

      if (recheckSlug && recheckUsername) {
        return {
          status: 409,
          data: {
            error: "conflict",
            conflictType: "slug_and_admin",
            existingTenantName: recheckSlug.name,
            existingSlug: recheckSlug.slug,
          },
        };
      }

      if (recheckSlug) {
        return {
          status: 409,
          data: {
            error: "conflict",
            conflictType: "slug_only",
            existingTenantName: recheckSlug.name,
            existingSlug: recheckSlug.slug,
          },
        };
      }

      if (recheckUsername) {
        const conflictTenant = await db
          .select({
            slug: tenants.slug,
            name: tenants.name,
          })
          .from(tenants)
          .where(eq(tenants.tenantId, recheckUsername.tenantId))
          .get();

        return {
          status: 409,
          data: {
            error: "conflict",
            conflictType: "admin_only",
            existingTenantName: conflictTenant?.name ?? "Unknown",
            existingSlug: conflictTenant?.slug ?? "",
          },
        };
      }

      // Fallback
      return {
        status: 409,
        data: {
          error: "conflict",
          conflictType: "slug_and_admin",
          existingTenantName: "Unknown",
          existingSlug: slug,
        },
      };
    }

    // Non-constraint error — rethrow
    throw e;
  }

  return {
    status: 201,
    data: {
      tenantId,
      slug,
      name,
      adminAccountId,
    },
  };
}

// ─── Tenant Status Update ────────────────────────────────────────────────────

/**
 * Update a tenant's status with transition validation.
 *
 * Valid transitions:
 * - active → suspended
 * - active → archived
 * - suspended → active
 * - suspended → archived
 *
 * All other transitions are invalid (archived is a terminal state).
 *
 * @returns 404 error if tenant not found, 422 error if invalid transition,
 *          or the updated tenant status info on success.
 */
export async function updateTenantStatus(
  tenantId: string,
  targetStatus: TenantStatus,
): Promise<
  | { status: 200; data: UpdateTenantStatusResult }
  | { status: 404; data: StatusUpdateError }
  | { status: 422; data: StatusUpdateError }
> {
  const db = getDb();

  // Step 1: Fetch the current tenant
  const tenant = await db
    .select({
      tenantId: tenants.tenantId,
      status: tenants.status,
    })
    .from(tenants)
    .where(eq(tenants.tenantId, tenantId))
    .get();

  if (!tenant) {
    return {
      status: 404,
      data: {
        error: "not_found",
        message: `Tenant with id '${tenantId}' not found`,
      },
    };
  }

  const currentStatus = tenant.status as TenantStatus;

  // Step 2: Validate the status transition
  if (!isValidTransition(currentStatus, targetStatus)) {
    const allowedTargets = VALID_TRANSITIONS[currentStatus];
    return {
      status: 422,
      data: {
        error: "invalid_transition",
        message: `Cannot transition from '${currentStatus}' to '${targetStatus}'. Allowed transitions from '${currentStatus}': ${
          allowedTargets.size > 0 ? Array.from(allowedTargets).join(", ") : "none"
        }`,
        currentStatus,
        requestedStatus: targetStatus,
      },
    };
  }

  // Step 3: Update the tenant status and updatedAt timestamp
  const now = new Date();

  await db
    .update(tenants)
    .set({
      status: targetStatus,
      updatedAt: now,
    })
    .where(eq(tenants.tenantId, tenantId));

  return {
    status: 200,
    data: {
      tenantId,
      status: targetStatus,
      updatedAt: now.toISOString(),
    },
  };
}
