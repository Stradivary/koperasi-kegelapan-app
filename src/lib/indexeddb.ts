import type { ReconciliationEvent } from '../core/payload/types'

const DB_NAME = 'koperasi-wallet'
const DB_VERSION = 1

export interface TenantContext {
  tenantId: string
  tenantSlug: string
  tenantName: string
  deviceId: string
  accountId: string
  role: string
  updatedAt: number
}

export interface CardSnapshot {
  tenantId: string
  cardIdHex: string
  rawBytes: Uint8Array
  capturedAt: number
  serialNumber: string
}

export interface PolicyCache {
  tenantId: string
  maxTransactionAmount: number
  maxDailyTotal: number
  topupOnlineOnly: boolean
  fetchedAt: number
  expiresAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('tenantContext')) {
        db.createObjectStore('tenantContext', { keyPath: 'tenantId' })
      }
      if (!db.objectStoreNames.contains('cardSnapshot')) {
        db.createObjectStore('cardSnapshot', { keyPath: ['tenantId', 'cardIdHex'] })
      }
      if (!db.objectStoreNames.contains('policyCache')) {
        db.createObjectStore('policyCache', { keyPath: 'tenantId' })
      }
      if (!db.objectStoreNames.contains('reconciliationOutbox')) {
        const outbox = db.createObjectStore('reconciliationOutbox', { keyPath: 'idempotencyKey' })
        outbox.createIndex('byTenantId', 'tenantId', { unique: false })
        outbox.createIndex('byStatus', 'status', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const tenantContextStore = {
  get: (tenantId: string) => tx<TenantContext | undefined>('tenantContext', 'readonly', (s) => s.get(tenantId)),
  put: (ctx: TenantContext) => tx<IDBValidKey>('tenantContext', 'readwrite', (s) => s.put(ctx)),
  delete: (tenantId: string) => tx<undefined>('tenantContext', 'readwrite', (s) => s.delete(tenantId)),
}

export const cardSnapshotStore = {
  get: (tenantId: string, cardIdHex: string) =>
    tx<CardSnapshot | undefined>('cardSnapshot', 'readonly', (s) => s.get([tenantId, cardIdHex])),
  put: (snap: CardSnapshot) => tx<IDBValidKey>('cardSnapshot', 'readwrite', (s) => s.put(snap)),
  delete: (tenantId: string, cardIdHex: string) =>
    tx<undefined>('cardSnapshot', 'readwrite', (s) => s.delete([tenantId, cardIdHex])),
}

export const policyCacheStore = {
  get: (tenantId: string) => tx<PolicyCache | undefined>('policyCache', 'readonly', (s) => s.get(tenantId)),
  put: (policy: PolicyCache) => tx<IDBValidKey>('policyCache', 'readwrite', (s) => s.put(policy)),
  delete: (tenantId: string) => tx<undefined>('policyCache', 'readwrite', (s) => s.delete(tenantId)),
}

interface OutboxEntry extends ReconciliationEvent {
  tenantId: string
  terminalId: number
  status: 'pending' | 'synced' | 'failed'
  createdAt: number
  attempts: number
}

export const reconciliationOutbox = {
  add: async (entry: Omit<OutboxEntry, 'status' | 'createdAt' | 'attempts'>): Promise<void> => {
    const full: OutboxEntry = { ...entry, status: 'pending', createdAt: Date.now(), attempts: 0 }
    await tx<IDBValidKey>('reconciliationOutbox', 'readwrite', (s) => s.put(full))
  },

  getPending: (tenantId: string): Promise<OutboxEntry[]> =>
    new Promise(async (resolve, reject) => {
      const db = await openDb()
      const transaction = db.transaction('reconciliationOutbox', 'readonly')
      const store = transaction.objectStore('reconciliationOutbox')
      const index = store.index('byTenantId')
      const req = index.getAll(tenantId)
      req.onsuccess = () =>
        resolve((req.result as OutboxEntry[]).filter((e) => e.status === 'pending'))
      req.onerror = () => reject(req.error)
    }),

  markSynced: (idempotencyKey: string) =>
    new Promise<void>(async (resolve, reject) => {
      const db = await openDb()
      const transaction = db.transaction('reconciliationOutbox', 'readwrite')
      const store = transaction.objectStore('reconciliationOutbox')
      const req = store.get(idempotencyKey)
      req.onsuccess = () => {
        const entry = req.result as OutboxEntry | undefined
        if (!entry) { resolve(); return }
        const putReq = store.put({ ...entry, status: 'synced' })
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      }
      req.onerror = () => reject(req.error)
    }),

  clearTenant: async (tenantId: string): Promise<void> => {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('reconciliationOutbox', 'readwrite')
      const store = transaction.objectStore('reconciliationOutbox')
      const index = store.index('byTenantId')
      const req = index.openCursor(IDBKeyRange.only(tenantId))
      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
        if (cursor) { cursor.delete(); cursor.continue() }
        else resolve()
      }
      req.onerror = () => reject(req.error)
    })
  },
}

export function makeIdempotencyKey(
  tenantId: string,
  cardIdHex: string,
  counter: number,
): string {
  return `${tenantId}:${cardIdHex}:${counter}`
}
