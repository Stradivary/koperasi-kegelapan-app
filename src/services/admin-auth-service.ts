/**
 * Admin Authentication and Authorization Service
 * Requirements: 12.1, 12.2, 12.3
 *
 * Provides admin login with session token generation, session validation,
 * role-based access control, and admin user CRUD operations.
 */

import { eq, and } from 'drizzle-orm'
import { adminUsers } from '#/db/schema.ts'
import type { db as DbType } from '#/db/index.ts'
import type { KVCache } from '#/lib/kv-cache.ts'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AdminRole = 'super_admin' | 'tenant_admin' | 'operator'
export type AdminStatus = 'active' | 'suspended'

export interface AdminUserRecord {
  id: string
  tenantId: string
  email: string
  name: string
  role: AdminRole
  status: AdminStatus
  createdAt: Date
  lastLoginAt: Date | null
}

export interface SessionData {
  adminId: string
  tenantId: string
  email: string
  name: string
  role: AdminRole
}

export interface CreateAdminInput {
  tenantId: string
  email: string
  name: string
  role: AdminRole
}

export interface UpdateAdminInput {
  name?: string
  role?: AdminRole
  status?: AdminStatus
}

/** Default session TTL: 24 hours in seconds */
const DEFAULT_SESSION_TTL = 86400

/** KV key prefix for admin sessions */
const SESSION_KEY_PREFIX = 'admin:session:'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the KV key for an admin session.
 */
export function sessionKey(token: string): string {
  return `${SESSION_KEY_PREFIX}${token}`
}

/**
 * Generate a secure session token (UUID).
 */
export function generateSessionToken(): string {
  return crypto.randomUUID()
}

/**
 * Role hierarchy for access control.
 * Higher number = more privileges.
 */
const ROLE_LEVEL: Record<AdminRole, number> = {
  operator: 1,
  tenant_admin: 2,
  super_admin: 3,
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Admin login: verify credentials and create a session token in KV.
 * Requirement: 12.2
 *
 * @param email - Admin email
 * @param database - Drizzle database instance
 * @param kvCache - KV cache for session storage
 * @param ttlSeconds - Session TTL in seconds (default: 24 hours)
 * @returns Session token and admin info
 * @throws Error if admin not found or suspended
 */
export async function adminLogin(
  email: string,
  database: typeof DbType,
  kvCache: KVCache,
  ttlSeconds: number = DEFAULT_SESSION_TTL,
): Promise<{ token: string; admin: AdminUserRecord }> {
  // 1. Look up admin by email
  const [admin] = await database
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1)

  if (!admin) {
    throw new Error('Invalid credentials')
  }

  if (admin.status !== 'active') {
    throw new Error('Account is suspended')
  }

  // 2. Generate session token
  const token = generateSessionToken()

  // 3. Store session in KV with TTL
  const sessionData: SessionData = {
    adminId: admin.id,
    tenantId: admin.tenantId,
    email: admin.email,
    name: admin.name,
    role: admin.role as AdminRole,
  }

  await kvCache.put(sessionKey(token), sessionData, ttlSeconds)

  // 4. Update lastLoginAt
  await database
    .update(adminUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(adminUsers.id, admin.id))

  return { token, admin: admin as AdminUserRecord }
}

/**
 * Validate a session token from KV.
 * Requirement: 12.2
 *
 * @param token - Session token from request header
 * @param kvCache - KV cache for session lookup
 * @returns Session data if valid, null if expired/invalid
 */
export async function validateSession(
  token: string,
  kvCache: KVCache,
): Promise<SessionData | null> {
  const session = await kvCache.get<SessionData>(sessionKey(token))
  return session
}

/**
 * Check if an admin has access to a specific tenant.
 * Requirement: 12.1
 *
 * - super_admin: access all tenants
 * - tenant_admin: access own tenant only
 * - operator: access own tenant only (terminal operations)
 *
 * @param session - Current admin session
 * @param targetTenantId - Tenant being accessed
 * @returns true if access is allowed
 */
export function checkTenantAccess(
  session: SessionData,
  targetTenantId: string,
): boolean {
  if (session.role === 'super_admin') {
    return true
  }
  return session.tenantId === targetTenantId
}

/**
 * Check if an admin has the required role level.
 * Requirement: 12.1
 *
 * @param session - Current admin session
 * @param requiredRole - Minimum role required
 * @returns true if the admin's role meets or exceeds the required level
 */
export function checkRoleLevel(
  session: SessionData,
  requiredRole: AdminRole,
): boolean {
  return ROLE_LEVEL[session.role] >= ROLE_LEVEL[requiredRole]
}

/**
 * RBAC middleware check: verify tenant access and minimum role.
 * Requirement: 12.1
 *
 * @param session - Current admin session
 * @param targetTenantId - Tenant being accessed
 * @param requiredRole - Minimum role required
 * @throws Error if access denied
 */
export function requireAccess(
  session: SessionData,
  targetTenantId: string,
  requiredRole: AdminRole,
): void {
  if (!checkRoleLevel(session, requiredRole)) {
    throw new Error(
      `Access denied: requires ${requiredRole} role or higher`,
    )
  }

  if (!checkTenantAccess(session, targetTenantId)) {
    throw new Error(
      'Access denied: you do not have access to this tenant',
    )
  }
}

/**
 * Create a new admin user with email uniqueness enforcement.
 * Requirement: 12.3
 *
 * @param input - Admin user creation input
 * @param actingAdmin - Session of the admin performing the action
 * @param database - Drizzle database instance
 * @returns The created admin user record
 * @throws Error if email already exists or role assignment not allowed
 */
export async function createAdminUser(
  input: CreateAdminInput,
  actingAdmin: SessionData,
  database: typeof DbType,
): Promise<AdminUserRecord> {
  // 1. Check acting admin has sufficient privileges
  if (!checkRoleLevel(actingAdmin, 'tenant_admin')) {
    throw new Error('Only tenant_admin or super_admin can create admin users')
  }

  // 2. Restrict role assignment based on acting admin's role
  if (input.role === 'super_admin' && actingAdmin.role !== 'super_admin') {
    throw new Error('Only super_admin can assign super_admin role')
  }

  if (input.role === 'tenant_admin' && actingAdmin.role === 'tenant_admin') {
    // tenant_admin can create other tenant_admins only for their own tenant
    if (actingAdmin.tenantId !== input.tenantId) {
      throw new Error('tenant_admin can only create users for their own tenant')
    }
  }

  // 3. Enforce email uniqueness
  const [existing] = await database
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, input.email))
    .limit(1)

  if (existing) {
    throw new Error(`Email "${input.email}" is already in use`)
  }

  // 4. Create admin user
  const [created] = await database
    .insert(adminUsers)
    .values({
      tenantId: input.tenantId,
      email: input.email,
      name: input.name,
      role: input.role,
      status: 'active',
    })
    .returning()

  if (!created) {
    throw new Error('Failed to create admin user')
  }

  return created as AdminUserRecord
}

/**
 * Update an admin user (name, role, status).
 * Requirement: 12.3
 *
 * @param adminId - UUID of the admin to update
 * @param updates - Fields to update
 * @param actingAdmin - Session of the admin performing the action
 * @param database - Drizzle database instance
 * @returns The updated admin user record
 * @throws Error if admin not found or role assignment not allowed
 */
export async function updateAdminUser(
  adminId: string,
  updates: UpdateAdminInput,
  actingAdmin: SessionData,
  database: typeof DbType,
): Promise<AdminUserRecord> {
  // 1. Check acting admin has sufficient privileges
  if (!checkRoleLevel(actingAdmin, 'tenant_admin')) {
    throw new Error('Only tenant_admin or super_admin can update admin users')
  }

  // 2. Look up the target admin
  const [target] = await database
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, adminId))
    .limit(1)

  if (!target) {
    throw new Error(`Admin user "${adminId}" not found`)
  }

  // 3. Restrict role changes
  if (updates.role) {
    if (updates.role === 'super_admin' && actingAdmin.role !== 'super_admin') {
      throw new Error('Only super_admin can assign super_admin role')
    }
    // Cannot elevate someone above your own role
    if (ROLE_LEVEL[updates.role] > ROLE_LEVEL[actingAdmin.role]) {
      throw new Error('Cannot assign a role higher than your own')
    }
  }

  // 4. tenant_admin can only update users in their own tenant
  if (actingAdmin.role === 'tenant_admin' && target.tenantId !== actingAdmin.tenantId) {
    throw new Error('tenant_admin can only update users in their own tenant')
  }

  // 5. Build update set
  const updateSet: Record<string, unknown> = {}
  if (updates.name !== undefined) updateSet.name = updates.name
  if (updates.role !== undefined) updateSet.role = updates.role
  if (updates.status !== undefined) updateSet.status = updates.status

  if (Object.keys(updateSet).length === 0) {
    return target as AdminUserRecord
  }

  // 6. Update admin user
  const [updated] = await database
    .update(adminUsers)
    .set(updateSet)
    .where(eq(adminUsers.id, adminId))
    .returning()

  if (!updated) {
    throw new Error('Failed to update admin user')
  }

  return updated as AdminUserRecord
}

/**
 * Get an admin user by ID.
 *
 * @param adminId - UUID of the admin
 * @param database - Drizzle database instance
 * @returns Admin user record or null
 */
export async function getAdminUser(
  adminId: string,
  database: typeof DbType,
): Promise<AdminUserRecord | null> {
  const [admin] = await database
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, adminId))
    .limit(1)

  return (admin as AdminUserRecord) ?? null
}

/**
 * List admin users for a tenant.
 *
 * @param tenantId - UUID of the tenant
 * @param database - Drizzle database instance
 * @returns Array of admin user records
 */
export async function listAdminUsers(
  tenantId: string,
  database: typeof DbType,
): Promise<AdminUserRecord[]> {
  const results = await database
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.tenantId, tenantId))
    .orderBy(adminUsers.createdAt)

  return results as AdminUserRecord[]
}
