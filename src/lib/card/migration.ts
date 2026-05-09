/**
 * NFC Card Operations — Schema Migration
 *
 * Handles backward-compatible schema version upgrades for card payloads.
 * When a card with an older schema version is read, the migration function
 * applies necessary transformations to bring it to the current version.
 *
 * Requirements: 14.1, 14.2, 14.3
 */

import type { CardPayload } from './types.ts'
import { CURRENT_SCHEMA_VERSION } from './types.ts'

/**
 * Migration function type: transforms a payload from one version to the next.
 */
type MigrationFn = (payload: CardPayload) => CardPayload

/**
 * Registry of migration functions keyed by source version.
 * Each function migrates from version N to version N+1.
 *
 * Add new migrations here as schema versions evolve.
 * Example: migrations[1] would migrate from v1 to v2.
 */
const migrations: Record<number, MigrationFn> = {
  // Future migrations go here, e.g.:
  // 1: (payload) => ({ ...payload, v: 2, newField: defaultValue }),
}

/**
 * Migrate a card payload from its current schema version to the expected version.
 *
 * - If the card version matches the expected version, returns the payload unchanged.
 * - If the card version is older and a migration path exists, applies sequential
 *   migrations to bring it up to date.
 * - If the card version is unrecognized (newer than expected or no migration path),
 *   throws an error.
 *
 * @param payload - Card payload with potentially outdated schema version
 * @param expectedVersion - Target schema version (defaults to CURRENT_SCHEMA_VERSION)
 * @returns Migrated card payload at the expected version
 * @throws Error if the version is unrecognized or no migration path exists
 */
export function migrateSchema(
  payload: CardPayload,
  expectedVersion: number = CURRENT_SCHEMA_VERSION,
): CardPayload {
  // Already at expected version — no migration needed
  if (payload.v === expectedVersion) {
    return payload
  }

  // Card version is newer than expected — unrecognized
  if (payload.v > expectedVersion) {
    throw new Error(
      'Card requires update. Please visit The Station.',
    )
  }

  // Apply sequential migrations from current version to expected version
  let migrated = { ...payload }
  for (let fromVersion = migrated.v; fromVersion < expectedVersion; fromVersion++) {
    const migrationFn = migrations[fromVersion]
    if (!migrationFn) {
      throw new Error(
        'Card requires update. Please visit The Station.',
      )
    }
    migrated = migrationFn(migrated)
  }

  return migrated
}
