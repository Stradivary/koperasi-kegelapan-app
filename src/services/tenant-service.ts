/**
 * Tenant Management Service
 * Requirements: 1.1, 1.2, 1.3, 1.4
 *
 * Provides CRUD operations for tenant records, encryption key provisioning,
 * configuration updates with KV cache invalidation, and paginated listing.
 */

import { eq, sql, count } from 'drizzle-orm'
import { tenants, encryptionKeys } from '#/db/schema.ts'
import { createTenantInputSchema } from '#/db/validations.ts'
import type { CreateTenantInput } from '#/db/validations.ts'
import { invalidateTenantCache } from '#/lib/tenant-cache-invalidation.ts'
import type { KVCache } from '#/lib/kv-cache.ts'
import type { db as DbType } from '#/db/index.ts'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TenantRecord {
  id: string
  slug: string
  name: string
  encryptionKeyId: string | null
  tariffRatePerHour: number
  maxBalance: number
  minBalanceForEntry: number
  branding: {
    primaryColor: string
    logoUrl: string | null
    displayName: string
  } | null
  status: 'active' | 'suspended' | 'deactivated'
  createdAt: Date
  updatedAt: Date
}

export interface UpdateTenantConfigInput {
  tariffRatePerHour?: number
  maxBalance?: number
  minBalanceForEntry?: number
  branding?: {
    primaryColor: string
    logoUrl: string | null
    displayName: string
  }
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate an AES-GCM 256-bit encryption key using Web Crypto API
 * and export the raw key material as a base64 string.
 */
export async function generateEncryptionKeyMaterial(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
  const rawKey = await crypto.subtle.exportKey('raw', key)
  const bytes = new Uint8Array(rawKey)
  // Convert to base64
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Create a new tenant with slug validation, default config, and initial encryption key.
 * Requirements: 1.1, 1.2
 *
 * @param input - Tenant creation input (validated with createTenantInputSchema)
 * @param database - Drizzle database instance
 * @returns The created tenant record
 * @throws Error if slug already exists or validation fails
 */
export async function createTenant(
  input: CreateTenantInput,
  database: typeof DbType,
): Promise<TenantRecord> {
  // 1. Validate input with Zod schema
  const parsed = createTenantInputSchema.parse(input)

  // 2. Check slug uniqueness
  const [existing] = await database
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, parsed.slug))
    .limit(1)

  if (existing) {
    throw new Error(`Tenant with slug "${parsed.slug}" already exists`)
  }

  // 3. Create tenant record with defaults
  const [tenant] = await database
    .insert(tenants)
    .values({
      slug: parsed.slug,
      name: parsed.name,
      tariffRatePerHour: parsed.tariffRatePerHour,
      maxBalance: parsed.maxBalance,
      minBalanceForEntry: parsed.minBalanceForEntry,
      branding: parsed.branding ?? null,
      status: 'active',
    })
    .returning()

  if (!tenant) {
    throw new Error('Failed to create tenant record')
  }

  // 4. Generate initial AES-GCM 256-bit encryption key
  const keyMaterial = await generateEncryptionKeyMaterial()

  const [encryptionKey] = await database
    .insert(encryptionKeys)
    .values({
      tenantId: tenant.id,
      keyMaterial,
      version: 1,
      status: 'active',
    })
    .returning()

  if (!encryptionKey) {
    throw new Error('Failed to create encryption key')
  }

  // 5. Update tenant's encryptionKeyId to reference the new key
  const [updatedTenant] = await database
    .update(tenants)
    .set({
      encryptionKeyId: encryptionKey.id,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenant.id))
    .returning()

  if (!updatedTenant) {
    throw new Error('Failed to update tenant with encryption key')
  }

  return updatedTenant as TenantRecord
}

/**
 * Update tenant configuration (tariff rate, branding, minBalanceForEntry).
 * Requirement: 1.4
 *
 * @param tenantId - UUID of the tenant to update
 * @param config - Partial config update
 * @param database - Drizzle database instance
 * @param kvCache - KV cache instance for invalidation (optional)
 * @returns The updated tenant record
 * @throws Error if tenant not found or validation fails
 */
export async function updateTenantConfig(
  tenantId: string,
  config: UpdateTenantConfigInput,
  database: typeof DbType,
  kvCache?: KVCache | null,
): Promise<TenantRecord> {
  // 1. Fetch existing tenant to validate constraints
  const [existing] = await database
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)

  if (!existing) {
    throw new Error(`Tenant with id "${tenantId}" not found`)
  }

  // 2. Validate input values
  const effectiveTariff = config.tariffRatePerHour ?? existing.tariffRatePerHour
  const effectiveMaxBalance = config.maxBalance ?? existing.maxBalance
  const effectiveMinBalance =
    config.minBalanceForEntry ?? existing.minBalanceForEntry

  if (config.tariffRatePerHour !== undefined) {
    if (
      !Number.isInteger(config.tariffRatePerHour) ||
      config.tariffRatePerHour <= 0
    ) {
      throw new Error('Tariff rate must be a positive integer')
    }
  }

  if (config.maxBalance !== undefined) {
    if (!Number.isInteger(config.maxBalance)) {
      throw new Error('Max balance must be an integer')
    }
    if (config.maxBalance < 100_000 || config.maxBalance > 100_000_000) {
      throw new Error('Max balance must be between 100,000 and 100,000,000')
    }
  }

  if (config.minBalanceForEntry !== undefined) {
    if (
      !Number.isInteger(config.minBalanceForEntry) ||
      config.minBalanceForEntry <= 0
    ) {
      throw new Error('Min balance for entry must be a positive integer')
    }
  }

  if (effectiveMinBalance < effectiveTariff) {
    throw new Error(
      'Minimum balance for entry must be >= tariff rate per hour',
    )
  }

  // 3. Build update set
  const updateSet: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (config.tariffRatePerHour !== undefined) {
    updateSet.tariffRatePerHour = config.tariffRatePerHour
  }
  if (config.maxBalance !== undefined) {
    updateSet.maxBalance = config.maxBalance
  }
  if (config.minBalanceForEntry !== undefined) {
    updateSet.minBalanceForEntry = config.minBalanceForEntry
  }
  if (config.branding !== undefined) {
    updateSet.branding = config.branding
  }

  // 4. Update tenant record
  const [updated] = await database
    .update(tenants)
    .set(updateSet)
    .where(eq(tenants.id, tenantId))
    .returning()

  if (!updated) {
    throw new Error('Failed to update tenant')
  }

  // 5. Invalidate KV cache
  if (kvCache) {
    await invalidateTenantCache(updated.slug, kvCache)
  }

  return updated as TenantRecord
}

/**
 * List tenants with pagination support.
 * Requirement: 1.1 (super_admin only — RBAC enforced in Task 12)
 *
 * @param page - Page number (1-based)
 * @param pageSize - Number of items per page
 * @param database - Drizzle database instance
 * @returns Paginated list of tenants with total count
 */
export async function listTenants(
  page: number,
  pageSize: number,
  database: typeof DbType,
): Promise<PaginatedResult<TenantRecord>> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)))
  const offset = (safePage - 1) * safePageSize

  const [data, totalResult] = await Promise.all([
    database
      .select()
      .from(tenants)
      .limit(safePageSize)
      .offset(offset)
      .orderBy(tenants.createdAt),
    database.select({ count: count() }).from(tenants),
  ])

  const total = totalResult[0]?.count ?? 0

  return {
    data: data as TenantRecord[],
    total,
    page: safePage,
    pageSize: safePageSize,
  }
}

/**
 * Get a tenant by slug.
 * Requirement: 1.3 — Used by the routing middleware.
 *
 * @param slug - Tenant slug
 * @param database - Drizzle database instance
 * @returns Tenant record or null if not found
 */
export async function getTenantBySlug(
  slug: string,
  database: typeof DbType,
): Promise<TenantRecord | null> {
  const [tenant] = await database
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1)

  return (tenant as TenantRecord) ?? null
}
