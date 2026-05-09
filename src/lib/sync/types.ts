/**
 * Transaction Sync Service — Shared Types
 *
 * Type definitions for the offline transaction queue, sync service,
 * and tenant config caching used by terminal devices.
 *
 * Requirements: 8.2, 8.3, 8.4, 8.5, 9.3
 */

import type { TransactionRecord } from '#/lib/card/types.ts'

// ─── Pending Transaction (IndexedDB Queue) ──────────────────────────────────

/** Status of a pending transaction in the sync queue */
export type PendingTransactionStatus =
  | 'pending'
  | 'syncing'
  | 'failed'
  | 'conflict'

/**
 * A transaction queued for sync in IndexedDB.
 * Auto-increment `id` is assigned by IndexedDB on insert.
 */
export interface PendingTransaction {
  id?: number
  tenantId: string
  memberId: string
  terminalId: string
  terminalType: 'gate' | 'terminal' | 'station' | 'scout'
  transaction: TransactionRecord
  queuedAt: number
  status: PendingTransactionStatus
  retryCount: number
  lastError: string | null
}

// ─── Sync Result ────────────────────────────────────────────────────────────

/** Result of a batch sync attempt */
export interface SyncResult {
  synced: number
  failed: number
  conflicts: number
}

// ─── Sync Status ────────────────────────────────────────────────────────────

/** Observable sync status exposed to the terminal UI */
export interface SyncStatus {
  pendingCount: number
  lastSyncTimestamp: number | null
  isSyncing: boolean
}

/** Callback for sync status changes */
export type SyncStatusListener = (status: SyncStatus) => void

// ─── Cached Tenant Config ───────────────────────────────────────────────────

/**
 * Tenant configuration cached in IndexedDB for offline operation.
 * Includes tariff rates, encryption keys, and branding.
 */
export interface CachedTenantConfig {
  tenantId: string
  tariffRatePerHour: number
  maxBalance: number
  minBalanceForEntry: number
  encryptionKeyMaterial: string
  encryptionKeyVersion: number
  branding: {
    primaryColor: string
    logoUrl: string | null
    displayName: string
  }
  cachedAt: number
}

// ─── Conflict Info ──────────────────────────────────────────────────────────

/** Details about a sync conflict for admin review */
export interface ConflictInfo {
  transactionId: number
  reason: string
  serverMessage: string
  detectedAt: number
}

// ─── Database Constants ─────────────────────────────────────────────────────

export const DB_NAME = 'mbc-sync'
export const DB_VERSION = 1
export const PENDING_TRANSACTIONS_STORE = 'pending-transactions'
export const TENANT_CONFIG_STORE = 'tenant-config'
