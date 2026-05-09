/**
 * Transaction Sync Service — Barrel Exports
 *
 * Client-side sync infrastructure for offline-first terminal operations.
 * Provides IndexedDB-based transaction queuing, background sync with
 * exponential backoff, sync status tracking, conflict handling,
 * and offline tenant config caching.
 */

// Types
export type {
  PendingTransaction,
  PendingTransactionStatus,
  SyncResult,
  SyncStatus,
  SyncStatusListener,
  CachedTenantConfig,
  ConflictInfo,
} from './types.ts'

export {
  DB_NAME,
  DB_VERSION,
  PENDING_TRANSACTIONS_STORE,
  TENANT_CONFIG_STORE,
} from './types.ts'

// IndexedDB wrapper (7.1)
export {
  openDatabase,
  addPendingTransaction,
  getAllPendingTransactions,
  updatePendingTransaction,
  removePendingTransaction,
  getPendingTransactionCount,
  setCachedTenantConfig,
  getCachedTenantConfig,
  removeCachedTenantConfig,
} from './indexed-db.ts'

// Sync service (7.2)
export {
  syncPendingTransactions,
  calculateBackoffDelay,
  getSyncableCount,
  MAX_BATCH_SIZE,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  SYNC_ENDPOINT,
} from './sync-service.ts'
export type { SyncServiceOptions } from './sync-service.ts'

// Sync status tracker (7.3)
export { createSyncStatusTracker } from './sync-status.ts'
export type { SyncStatusTracker } from './sync-status.ts'

// Conflict handler (7.4)
export {
  markAsConflict,
  getConflictedTransactions,
  resolveConflict,
  isDuplicateTransaction,
  parseConflictResponse,
} from './conflict-handler.ts'

// Config cache (7.5)
export { createConfigCache, CONFIG_ENDPOINT } from './config-cache.ts'
export type { ConfigCache, ConfigCacheOptions } from './config-cache.ts'
