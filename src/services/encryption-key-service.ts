/**
 * Encryption Key Management Service
 * Requirements: 7.1, 7.4
 *
 * Manages AES-GCM 256-bit encryption key lifecycle: generation, storage,
 * rotation with migration windows, retirement, and secure distribution
 * to authorized terminals.
 */

import { eq, and, desc } from 'drizzle-orm'
import { encryptionKeys, tenants, terminals } from '#/db/schema.ts'
import { generateEncryptionKeyMaterial } from '#/services/tenant-service.ts'
import type { db as DbType } from '#/db/index.ts'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EncryptionKeyRecord {
  id: string
  tenantId: string
  keyMaterial: string
  version: number
  status: 'active' | 'rotating' | 'retired'
  activatedAt: Date
  retiredAt: Date | null
  migrationDeadline: Date | null
}

/**
 * Public-safe encryption key info — keyMaterial is excluded.
 * Used in API responses where key material must never be exposed.
 */
export interface EncryptionKeyPublicInfo {
  id: string
  tenantId: string
  version: number
  status: 'active' | 'rotating' | 'retired'
  activatedAt: Date
  retiredAt: Date | null
  migrationDeadline: Date | null
}

export interface RotationResult {
  newKey: EncryptionKeyPublicInfo
  migrationDeadline: Date
}

export interface RetirementResult {
  retiredKeyId: string
  promotedKeyId: string
  retiredAt: Date
}

/** Default migration window: 30 days */
const DEFAULT_MIGRATION_DAYS = 30

// ─── 4.1: Key Generation and Storage ────────────────────────────────────────

/**
 * Generate a new AES-GCM 256-bit encryption key and store it in the database.
 * The key material is stored as base64 in the encryption_keys table.
 * Each key has an incrementing version number per tenant.
 *
 * Requirement: 7.1
 *
 * @param tenantId - UUID of the tenant
 * @param database - Drizzle database instance
 * @returns The created encryption key record
 */
export async function createEncryptionKey(
  tenantId: string,
  database: typeof DbType,
): Promise<EncryptionKeyRecord> {
  // Determine the next version number for this tenant
  const [latestKey] = await database
    .select({ version: encryptionKeys.version })
    .from(encryptionKeys)
    .where(eq(encryptionKeys.tenantId, tenantId))
    .orderBy(desc(encryptionKeys.version))
    .limit(1)

  const nextVersion = (latestKey?.version ?? 0) + 1

  // Generate AES-GCM 256-bit key material as base64
  const keyMaterial = await generateEncryptionKeyMaterial()

  // Store in the encryption_keys table
  const [key] = await database
    .insert(encryptionKeys)
    .values({
      tenantId,
      keyMaterial,
      version: nextVersion,
      status: 'active',
    })
    .returning()

  if (!key) {
    throw new Error('Failed to create encryption key')
  }

  return key as EncryptionKeyRecord
}

/**
 * Get the current active encryption key for a tenant.
 *
 * @param tenantId - UUID of the tenant
 * @param database - Drizzle database instance
 * @returns The active encryption key or null
 */
export async function getActiveEncryptionKey(
  tenantId: string,
  database: typeof DbType,
): Promise<EncryptionKeyRecord | null> {
  const [key] = await database
    .select()
    .from(encryptionKeys)
    .where(
      and(
        eq(encryptionKeys.tenantId, tenantId),
        eq(encryptionKeys.status, 'active'),
      ),
    )
    .limit(1)

  return (key as EncryptionKeyRecord) ?? null
}

// ─── 4.2: Key Rotation ──────────────────────────────────────────────────────

/**
 * Rotate a tenant's encryption key. Creates a new key with status "rotating",
 * sets a migration deadline, and keeps the old key as "active" during the
 * transition. Updates the tenant's encryptionKeyId to the new key.
 *
 * Requirement: 7.4
 *
 * @param tenantId - UUID of the tenant
 * @param database - Drizzle database instance
 * @param migrationDays - Number of days for the migration window (default: 30)
 * @returns The new key info and migration deadline
 */
export async function rotateTenantEncryptionKey(
  tenantId: string,
  database: typeof DbType,
  migrationDays: number = DEFAULT_MIGRATION_DAYS,
): Promise<RotationResult> {
  // 1. Find the current active key
  const activeKey = await getActiveEncryptionKey(tenantId, database)
  if (!activeKey) {
    throw new Error(
      `No active encryption key found for tenant "${tenantId}"`,
    )
  }

  // 2. Determine the next version number
  const [latestKey] = await database
    .select({ version: encryptionKeys.version })
    .from(encryptionKeys)
    .where(eq(encryptionKeys.tenantId, tenantId))
    .orderBy(desc(encryptionKeys.version))
    .limit(1)

  const nextVersion = (latestKey?.version ?? 0) + 1

  // 3. Generate new key material
  const keyMaterial = await generateEncryptionKeyMaterial()

  // 4. Calculate migration deadline
  const migrationDeadline = new Date()
  migrationDeadline.setDate(migrationDeadline.getDate() + migrationDays)

  // 5. Insert new key with status "rotating" and migration deadline
  const [newKey] = await database
    .insert(encryptionKeys)
    .values({
      tenantId,
      keyMaterial,
      version: nextVersion,
      status: 'rotating',
      migrationDeadline,
    })
    .returning()

  if (!newKey) {
    throw new Error('Failed to create rotating encryption key')
  }

  // 6. Update the old active key's migration deadline
  await database
    .update(encryptionKeys)
    .set({ migrationDeadline })
    .where(eq(encryptionKeys.id, activeKey.id))

  // 7. Update tenant's encryptionKeyId to the new key
  await database
    .update(tenants)
    .set({
      encryptionKeyId: newKey.id,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))

  return {
    newKey: toPublicInfo(newKey as EncryptionKeyRecord),
    migrationDeadline,
  }
}

// ─── 4.3: Key Retirement ────────────────────────────────────────────────────

/**
 * Retire old encryption keys whose migration deadline has passed.
 * For each tenant, if there is an "active" key with a "rotating" sibling
 * whose migration deadline is past, the old "active" key is set to "retired"
 * and the "rotating" key is promoted to "active".
 *
 * Requirement: 7.4
 *
 * @param database - Drizzle database instance
 * @param now - Current date (injectable for testing)
 * @returns Array of retirement results
 */
export async function retireExpiredKeys(
  database: typeof DbType,
  now: Date = new Date(),
): Promise<RetirementResult[]> {
  const results: RetirementResult[] = []

  // Find all "rotating" keys whose migration deadline has passed
  const rotatingKeys = await database
    .select()
    .from(encryptionKeys)
    .where(eq(encryptionKeys.status, 'rotating'))

  for (const rotatingKey of rotatingKeys) {
    // Check if migration deadline has passed
    if (!rotatingKey.migrationDeadline || rotatingKey.migrationDeadline > now) {
      continue
    }

    // Find the corresponding "active" key for the same tenant
    const [activeKey] = await database
      .select()
      .from(encryptionKeys)
      .where(
        and(
          eq(encryptionKeys.tenantId, rotatingKey.tenantId),
          eq(encryptionKeys.status, 'active'),
        ),
      )
      .limit(1)

    if (!activeKey) {
      continue
    }

    // Retire the old active key
    const retiredAt = now
    await database
      .update(encryptionKeys)
      .set({
        status: 'retired',
        retiredAt,
      })
      .where(eq(encryptionKeys.id, activeKey.id))

    // Promote the rotating key to active
    await database
      .update(encryptionKeys)
      .set({
        status: 'active',
        migrationDeadline: null,
      })
      .where(eq(encryptionKeys.id, rotatingKey.id))

    results.push({
      retiredKeyId: activeKey.id,
      promotedKeyId: rotatingKey.id,
      retiredAt,
    })
  }

  return results
}

// ─── 4.4: Secure Key Distribution ───────────────────────────────────────────

/**
 * Retrieve key material for an authorized terminal. Verifies that the terminal
 * belongs to the specified tenant and has "active" status before returning
 * the key material. This is the ONLY path through which key material is exposed.
 *
 * Requirement: 7.4
 *
 * @param tenantId - UUID of the tenant
 * @param terminalId - UUID of the terminal requesting the key
 * @param database - Drizzle database instance
 * @returns The key material (base64) for the active and optionally rotating keys
 * @throws Error if terminal is not authorized
 */
export async function getKeyMaterialForTerminal(
  tenantId: string,
  terminalId: string,
  database: typeof DbType,
): Promise<{ activeKey: string; rotatingKey: string | null }> {
  // 1. Verify terminal authorization
  const [terminal] = await database
    .select()
    .from(terminals)
    .where(
      and(
        eq(terminals.id, terminalId),
        eq(terminals.tenantId, tenantId),
        eq(terminals.status, 'active'),
      ),
    )
    .limit(1)

  if (!terminal) {
    throw new Error(
      'Terminal not authorized: terminal not found, does not belong to this tenant, or is not active',
    )
  }

  // 2. Get the active key for this tenant
  const [activeKey] = await database
    .select()
    .from(encryptionKeys)
    .where(
      and(
        eq(encryptionKeys.tenantId, tenantId),
        eq(encryptionKeys.status, 'active'),
      ),
    )
    .limit(1)

  if (!activeKey) {
    throw new Error(`No active encryption key found for tenant "${tenantId}"`)
  }

  // 3. Check for a rotating key (during key rotation period)
  const [rotatingKey] = await database
    .select()
    .from(encryptionKeys)
    .where(
      and(
        eq(encryptionKeys.tenantId, tenantId),
        eq(encryptionKeys.status, 'rotating'),
      ),
    )
    .limit(1)

  return {
    activeKey: activeKey.keyMaterial,
    rotatingKey: rotatingKey?.keyMaterial ?? null,
  }
}

/**
 * Get encryption key info for public API responses.
 * Key material is NEVER included.
 *
 * @param tenantId - UUID of the tenant
 * @param database - Drizzle database instance
 * @returns Array of public key info (without keyMaterial)
 */
export async function getEncryptionKeysPublicInfo(
  tenantId: string,
  database: typeof DbType,
): Promise<EncryptionKeyPublicInfo[]> {
  const keys = await database
    .select({
      id: encryptionKeys.id,
      tenantId: encryptionKeys.tenantId,
      version: encryptionKeys.version,
      status: encryptionKeys.status,
      activatedAt: encryptionKeys.activatedAt,
      retiredAt: encryptionKeys.retiredAt,
      migrationDeadline: encryptionKeys.migrationDeadline,
    })
    .from(encryptionKeys)
    .where(eq(encryptionKeys.tenantId, tenantId))
    .orderBy(desc(encryptionKeys.version))

  return keys as EncryptionKeyPublicInfo[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip keyMaterial from an encryption key record for safe API exposure.
 */
function toPublicInfo(key: EncryptionKeyRecord): EncryptionKeyPublicInfo {
  return {
    id: key.id,
    tenantId: key.tenantId,
    version: key.version,
    status: key.status,
    activatedAt: key.activatedAt,
    retiredAt: key.retiredAt,
    migrationDeadline: key.migrationDeadline,
  }
}
