/**
 * IndexedDB Wrapper for Offline Transaction Queue and Config Cache
 *
 * Provides a typed interface over the browser IndexedDB API for storing
 * pending transactions and cached tenant configuration.
 *
 * Requirements: 8.2, 8.5
 */

import type { PendingTransaction, PendingTransactionStatus, CachedTenantConfig } from './types.ts'
import {
  DB_NAME,
  DB_VERSION,
  PENDING_TRANSACTIONS_STORE,
  TENANT_CONFIG_STORE,
} from './types.ts'

// ─── Database Initialization ────────────────────────────────────────────────

/**
 * Opens (or creates) the mbc-sync IndexedDB database.
 * Creates object stores on first open or version upgrade.
 */
export function openDatabase(
  indexedDB: IDBFactory = globalThis.indexedDB,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(PENDING_TRANSACTIONS_STORE)) {
        const txStore = db.createObjectStore(PENDING_TRANSACTIONS_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        })
        txStore.createIndex('status', 'status', { unique: false })
        txStore.createIndex('tenantId', 'tenantId', { unique: false })
        txStore.createIndex('queuedAt', 'queuedAt', { unique: false })
      }

      if (!db.objectStoreNames.contains(TENANT_CONFIG_STORE)) {
        db.createObjectStore(TENANT_CONFIG_STORE, {
          keyPath: 'tenantId',
        })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ─── Pending Transaction Operations ─────────────────────────────────────────

/**
 * Adds a pending transaction to the queue.
 * Returns the auto-generated ID.
 */
export function addPendingTransaction(
  db: IDBDatabase,
  transaction: Omit<PendingTransaction, 'id'>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_TRANSACTIONS_STORE, 'readwrite')
    const store = tx.objectStore(PENDING_TRANSACTIONS_STORE)
    const request = store.add(transaction)

    request.onsuccess = () => resolve(request.result as number)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Retrieves all pending transactions, optionally filtered by status.
 */
export function getAllPendingTransactions(
  db: IDBDatabase,
  status?: PendingTransactionStatus,
): Promise<PendingTransaction[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_TRANSACTIONS_STORE, 'readonly')
    const store = tx.objectStore(PENDING_TRANSACTIONS_STORE)

    let request: IDBRequest<PendingTransaction[]>
    if (status) {
      const index = store.index('status')
      request = index.getAll(status)
    } else {
      request = store.getAll()
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Updates a pending transaction record by ID.
 */
export function updatePendingTransaction(
  db: IDBDatabase,
  id: number,
  updates: Partial<Omit<PendingTransaction, 'id'>>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_TRANSACTIONS_STORE, 'readwrite')
    const store = tx.objectStore(PENDING_TRANSACTIONS_STORE)
    const getRequest = store.get(id)

    getRequest.onsuccess = () => {
      const existing = getRequest.result as PendingTransaction | undefined
      if (!existing) {
        reject(new Error(`PendingTransaction with id ${id} not found`))
        return
      }
      const updated = { ...existing, ...updates }
      const putRequest = store.put(updated)
      putRequest.onsuccess = () => resolve()
      putRequest.onerror = () => reject(putRequest.error)
    }
    getRequest.onerror = () => reject(getRequest.error)
  })
}

/**
 * Removes a pending transaction by ID.
 */
export function removePendingTransaction(
  db: IDBDatabase,
  id: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_TRANSACTIONS_STORE, 'readwrite')
    const store = tx.objectStore(PENDING_TRANSACTIONS_STORE)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Returns the count of pending transactions with a given status.
 */
export function getPendingTransactionCount(
  db: IDBDatabase,
  status?: PendingTransactionStatus,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_TRANSACTIONS_STORE, 'readonly')
    const store = tx.objectStore(PENDING_TRANSACTIONS_STORE)

    let request: IDBRequest<number>
    if (status) {
      const index = store.index('status')
      request = index.count(status)
    } else {
      request = store.count()
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ─── Tenant Config Cache Operations ─────────────────────────────────────────

/**
 * Stores or updates a cached tenant config.
 */
export function setCachedTenantConfig(
  db: IDBDatabase,
  config: CachedTenantConfig,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TENANT_CONFIG_STORE, 'readwrite')
    const store = tx.objectStore(TENANT_CONFIG_STORE)
    const request = store.put(config)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Retrieves a cached tenant config by tenant ID.
 */
export function getCachedTenantConfig(
  db: IDBDatabase,
  tenantId: string,
): Promise<CachedTenantConfig | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TENANT_CONFIG_STORE, 'readonly')
    const store = tx.objectStore(TENANT_CONFIG_STORE)
    const request = store.get(tenantId)

    request.onsuccess = () => resolve(request.result as CachedTenantConfig | undefined)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Removes a cached tenant config by tenant ID.
 */
export function removeCachedTenantConfig(
  db: IDBDatabase,
  tenantId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TENANT_CONFIG_STORE, 'readwrite')
    const store = tx.objectStore(TENANT_CONFIG_STORE)
    const request = store.delete(tenantId)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
