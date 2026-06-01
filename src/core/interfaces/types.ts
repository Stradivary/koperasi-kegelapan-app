/**
 * Domain-owned data types for repository interfaces.
 * These types mirror the shapes needed by domain logic without coupling to
 * IndexedDB/Dexie schema or any infrastructure concern.
 *
 * IMPORTANT: This file must have ZERO outward imports.
 */

/**
 * Domain representation of a card record.
 * Mirrors the shape needed by domain logic without coupling to IndexedDB schema.
 */
export interface CardRecord {
  tenantId: string;
  cardId: string;
  userId: string | null;
  status:
    | "active"
    | "blocked_tamper"
    | "blocked_fraud"
    | "blocked_expired"
    | "blocked_admin"
    | "deleted";
  balance: number;
  counter: number;
  keyVersion: number;
  createdAt: number;
  lastActivityAt: number | null;
  expiresAt: number | null;
  notes: string | null;
}

/**
 * Domain representation of a user record.
 */
export interface UserRecord {
  tenantId: string;
  userId: string;
  name: string;
  status: "active" | "suspended" | "deleted";
}

/**
 * Result of a remote UID existence check.
 */
export interface UIDCheckResult {
  exists: boolean;
  tenantId?: string;
}
