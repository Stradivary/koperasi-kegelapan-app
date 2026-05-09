/**
 * Terminal Management Service
 * Requirements: 10.1, 10.2, 10.3, 10.4
 *
 * Manages terminal registration, authorization, heartbeat monitoring,
 * decommissioning, and listing with filtering.
 */

import { and, eq } from 'drizzle-orm'
import { terminals } from '#/db/schema.ts'
import { terminalRegistrationInputSchema } from '#/db/validations.ts'
import type { TerminalRegistrationInput } from '#/db/validations.ts'
import type { db as DbType } from '#/db/index.ts'

// ─── Types ───────────────────────────────────────────────────────────────────

export type TerminalType = 'gate' | 'terminal' | 'station' | 'scout'
export type TerminalStatus = 'active' | 'inactive' | 'maintenance'

export interface TerminalRecord {
  id: string
  tenantId: string
  name: string
  type: TerminalType
  location: string | null
  status: TerminalStatus
  lastHeartbeat: Date | null
  registeredAt: Date
  registeredBy: string
}

export interface TerminalAuth {
  terminalId: string
  tenantId: string
  type: TerminalType
  token: string
}

export interface TerminalFilters {
  type?: TerminalType
  status?: TerminalStatus
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a simple auth token (UUID-based) for terminal credential provisioning.
 */
export function generateTerminalToken(): string {
  return crypto.randomUUID()
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Register a new terminal with type classification and credential provisioning.
 * Requirement: 10.1
 *
 * @param input - Terminal registration input (validated with terminalRegistrationInputSchema)
 * @param registeredBy - Admin user ID performing the registration
 * @param database - Drizzle database instance
 * @returns The created terminal record
 */
export async function registerTerminal(
  input: TerminalRegistrationInput,
  registeredBy: string,
  database: typeof DbType,
): Promise<TerminalRecord> {
  // 1. Validate input with Zod schema
  const parsed = terminalRegistrationInputSchema.parse(input)

  // 2. Create terminal record with status "active"
  const [terminal] = await database
    .insert(terminals)
    .values({
      tenantId: parsed.tenantId,
      name: parsed.name,
      type: parsed.type,
      location: parsed.location ?? null,
      status: 'active',
      registeredBy,
    })
    .returning()

  if (!terminal) {
    throw new Error('Failed to create terminal record')
  }

  return terminal as TerminalRecord
}

/**
 * Authorize a terminal by validating it exists, belongs to the tenant, and is active.
 * Requirement: 10.2
 *
 * @param tenantId - UUID of the tenant
 * @param terminalId - UUID of the terminal
 * @param database - Drizzle database instance
 * @returns Terminal authorization info with a generated token
 * @throws Error if terminal not found, wrong tenant, or inactive
 */
export async function authorizeTerminal(
  tenantId: string,
  terminalId: string,
  database: typeof DbType,
): Promise<TerminalAuth> {
  // 1. Look up the terminal
  const [terminal] = await database
    .select()
    .from(terminals)
    .where(eq(terminals.id, terminalId))
    .limit(1)

  if (!terminal) {
    throw new Error(`Terminal "${terminalId}" not found`)
  }

  // 2. Verify tenant membership
  if (terminal.tenantId !== tenantId) {
    throw new Error(`Terminal "${terminalId}" does not belong to tenant "${tenantId}"`)
  }

  // 3. Verify active status
  if (terminal.status !== 'active') {
    throw new Error(`Terminal "${terminalId}" is not active (current status: ${terminal.status})`)
  }

  // 4. Generate auth token
  const token = generateTerminalToken()

  return {
    terminalId: terminal.id,
    tenantId: terminal.tenantId,
    type: terminal.type as TerminalType,
    token,
  }
}

/**
 * Update the lastHeartbeat timestamp for an active terminal.
 * Requirement: 10.3
 *
 * @param terminalId - UUID of the terminal
 * @param database - Drizzle database instance
 * @throws Error if terminal not found or not active
 */
export async function heartbeat(
  terminalId: string,
  database: typeof DbType,
): Promise<void> {
  // 1. Verify terminal exists and is active
  const [terminal] = await database
    .select({ id: terminals.id, status: terminals.status })
    .from(terminals)
    .where(eq(terminals.id, terminalId))
    .limit(1)

  if (!terminal) {
    throw new Error(`Terminal "${terminalId}" not found`)
  }

  if (terminal.status !== 'active') {
    throw new Error(`Terminal "${terminalId}" is not active (current status: ${terminal.status})`)
  }

  // 2. Update lastHeartbeat
  await database
    .update(terminals)
    .set({ lastHeartbeat: new Date() })
    .where(eq(terminals.id, terminalId))
}

/**
 * Decommission a terminal by setting its status to "inactive".
 * Requirement: 10.4
 *
 * @param tenantId - UUID of the tenant
 * @param terminalId - UUID of the terminal
 * @param database - Drizzle database instance
 * @returns The updated terminal record
 * @throws Error if terminal not found or doesn't belong to tenant
 */
export async function decommissionTerminal(
  tenantId: string,
  terminalId: string,
  database: typeof DbType,
): Promise<TerminalRecord> {
  // 1. Verify terminal exists and belongs to tenant
  const [terminal] = await database
    .select()
    .from(terminals)
    .where(
      and(
        eq(terminals.id, terminalId),
        eq(terminals.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!terminal) {
    throw new Error(`Terminal "${terminalId}" not found for tenant "${tenantId}"`)
  }

  // 2. Set status to "inactive"
  const [updated] = await database
    .update(terminals)
    .set({ status: 'inactive' })
    .where(eq(terminals.id, terminalId))
    .returning()

  if (!updated) {
    throw new Error('Failed to decommission terminal')
  }

  return updated as TerminalRecord
}

/**
 * List terminals for a tenant with optional filtering by type and status.
 * Requirement: 10.1
 *
 * @param tenantId - UUID of the tenant
 * @param filters - Optional type and status filters
 * @param database - Drizzle database instance
 * @returns Array of terminal records
 */
export async function listTerminals(
  tenantId: string,
  filters: TerminalFilters,
  database: typeof DbType,
): Promise<TerminalRecord[]> {
  // Build where conditions
  const conditions = [eq(terminals.tenantId, tenantId)]

  if (filters.type) {
    conditions.push(eq(terminals.type, filters.type))
  }
  if (filters.status) {
    conditions.push(eq(terminals.status, filters.status))
  }

  const whereCondition = conditions.length === 1
    ? conditions[0]!
    : and(...conditions)!

  const results = await database
    .select()
    .from(terminals)
    .where(whereCondition)
    .orderBy(terminals.registeredAt)

  return results as TerminalRecord[]
}
