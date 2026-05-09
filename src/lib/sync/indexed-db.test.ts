/**
 * Tests for IndexedDB wrapper (Task 7.1)
 * Covers: pending transaction CRUD and tenant config cache operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
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
import type { PendingTransaction, CachedTenantConfig } from './types.ts'
import {
  DB_NAME,
  PENDING_TRANSACTIONS_STORE,
  TENANT_CONFIG_STORE,
} from './types.ts'

function makePendingTx(
  overrides: Partial<Omit<PendingTransaction, 'id'>> = {},
): Omit<PendingTransaction, 'id'> {
  return {
    tenantId: 'KOP-001',
    memberId: 'MBC-8829',
    terminalId: 'TERM-001',
    terminalType: 'gate',
    transaction: {
      type: 'CHECKIN',
      amount: 0,
      balanceBefore: 50000,
      balanceAfter: 50000,
      occurredAt: 1700000000,
    },
    queuedAt: Date.now(),
    status: 'pending',
    retryCount: 0,
    lastError: null,
    ...overrides,
  }
}

describe('IndexedDB wrapper (7.1)', () => {
  let db: IDBDatabase

  beforeEach(async () => {
    db = await openDatabase(indexedDB)
  })

  afterEach(() => {
    db.close()
    // Delete the database between tests for isolation
    indexedDB.deleteDatabase(DB_NAME)
  })

  // ─── Database Schema ────────────────────────────────────────────────────

  it('creates the mbc-sync database with correct object stores', () => {
    expect(db.name).toBe(DB_NAME)
    expect(db.objectStoreNames.contains(PENDING_TRANSACTIONS_STORE)).toBe(true)
    expect(db.objectStoreNames.contains(TENANT_CONFIG_STORE)).toBe(true)
  })

  it('pending-transactions store has auto-increment id keyPath', () => {
    const tx = db.transaction(PENDING_TRANSACTIONS_STORE, 'readonly')
    const store = tx.objectStore(PENDING_TRANSACTIONS_STORE)
    expect(store.keyPath).toBe('id')
    expect(store.autoIncrement).toBe(true)
  })

  it('pending-transactions store has status and tenantId indexes', () => {
    const tx = db.transaction(PENDING_TRANSACTIONS_STORE, 'readonly')
    const store = tx.objectStore(PENDING_TRANSACTIONS_STORE)
    expect(store.indexNames.contains('status')).toBe(true)
    expect(store.indexNames.contains('tenantId')).toBe(true)
    expect(store.indexNames.contains('queuedAt')).toBe(true)
  })

  it('tenant-config store uses tenantId as keyPath', () => {
    const tx = db.transaction(TENANT_CONFIG_STORE, 'readonly')
    const store = tx.objectStore(TENANT_CONFIG_STORE)
    expect(store.keyPath).toBe('tenantId')
  })

  // ─── Pending Transaction CRUD ───────────────────────────────────────────

  it('adds a pending transaction and returns auto-generated id', async () => {
    const id = await addPendingTransaction(db, makePendingTx())
    expect(id).toBeGreaterThan(0)
  })

  it('retrieves all pending transactions', async () => {
    await addPendingTransaction(db, makePendingTx())
    await addPendingTransaction(db, makePendingTx({ memberId: 'MBC-0002' }))

    const all = await getAllPendingTransactions(db)
    expect(all).toHaveLength(2)
  })

  it('filters pending transactions by status', async () => {
    await addPendingTransaction(db, makePendingTx({ status: 'pending' }))
    await addPendingTransaction(db, makePendingTx({ status: 'syncing' }))
    await addPendingTransaction(db, makePendingTx({ status: 'failed' }))

    const pending = await getAllPendingTransactions(db, 'pending')
    expect(pending).toHaveLength(1)
    expect(pending[0].status).toBe('pending')

    const syncing = await getAllPendingTransactions(db, 'syncing')
    expect(syncing).toHaveLength(1)
  })

  it('updates a pending transaction', async () => {
    const id = await addPendingTransaction(db, makePendingTx())

    await updatePendingTransaction(db, id, {
      status: 'syncing',
      retryCount: 1,
    })

    const all = await getAllPendingTransactions(db)
    expect(all[0].status).toBe('syncing')
    expect(all[0].retryCount).toBe(1)
  })

  it('rejects update for non-existent transaction', async () => {
    await expect(
      updatePendingTransaction(db, 99999, { status: 'syncing' }),
    ).rejects.toThrow('not found')
  })

  it('removes a pending transaction', async () => {
    const id = await addPendingTransaction(db, makePendingTx())

    await removePendingTransaction(db, id)

    const all = await getAllPendingTransactions(db)
    expect(all).toHaveLength(0)
  })

  it('counts pending transactions', async () => {
    await addPendingTransaction(db, makePendingTx({ status: 'pending' }))
    await addPendingTransaction(db, makePendingTx({ status: 'pending' }))
    await addPendingTransaction(db, makePendingTx({ status: 'failed' }))

    const total = await getPendingTransactionCount(db)
    expect(total).toBe(3)

    const pendingOnly = await getPendingTransactionCount(db, 'pending')
    expect(pendingOnly).toBe(2)
  })

  it('stores full PendingTransaction schema fields', async () => {
    const tx = makePendingTx({
      tenantId: 'KOP-002',
      memberId: 'MBC-1234',
      terminalId: 'TERM-005',
      terminalType: 'station',
      status: 'failed',
      retryCount: 3,
      lastError: 'Network timeout',
    })

    const id = await addPendingTransaction(db, tx)
    const all = await getAllPendingTransactions(db)
    const stored = all.find((t) => t.id === id)!

    expect(stored.tenantId).toBe('KOP-002')
    expect(stored.memberId).toBe('MBC-1234')
    expect(stored.terminalId).toBe('TERM-005')
    expect(stored.terminalType).toBe('station')
    expect(stored.status).toBe('failed')
    expect(stored.retryCount).toBe(3)
    expect(stored.lastError).toBe('Network timeout')
    expect(stored.transaction.type).toBe('CHECKIN')
  })

  // ─── Tenant Config Cache ────────────────────────────────────────────────

  it('stores and retrieves tenant config', async () => {
    const config: CachedTenantConfig = {
      tenantId: 'KOP-001',
      tariffRatePerHour: 2000,
      maxBalance: 10_000_000,
      minBalanceForEntry: 2000,
      encryptionKeyMaterial: 'base64-key-material',
      encryptionKeyVersion: 1,
      branding: {
        primaryColor: '#1a73e8',
        logoUrl: null,
        displayName: 'Koperasi A',
      },
      cachedAt: Date.now(),
    }

    await setCachedTenantConfig(db, config)
    const retrieved = await getCachedTenantConfig(db, 'KOP-001')

    expect(retrieved).toBeDefined()
    expect(retrieved!.tenantId).toBe('KOP-001')
    expect(retrieved!.tariffRatePerHour).toBe(2000)
    expect(retrieved!.branding.displayName).toBe('Koperasi A')
  })

  it('returns undefined for non-existent tenant config', async () => {
    const result = await getCachedTenantConfig(db, 'NONEXISTENT')
    expect(result).toBeUndefined()
  })

  it('overwrites existing tenant config on put', async () => {
    const config: CachedTenantConfig = {
      tenantId: 'KOP-001',
      tariffRatePerHour: 2000,
      maxBalance: 10_000_000,
      minBalanceForEntry: 2000,
      encryptionKeyMaterial: 'key-v1',
      encryptionKeyVersion: 1,
      branding: {
        primaryColor: '#1a73e8',
        logoUrl: null,
        displayName: 'Koperasi A',
      },
      cachedAt: Date.now(),
    }

    await setCachedTenantConfig(db, config)
    await setCachedTenantConfig(db, {
      ...config,
      tariffRatePerHour: 3000,
      encryptionKeyVersion: 2,
    })

    const retrieved = await getCachedTenantConfig(db, 'KOP-001')
    expect(retrieved!.tariffRatePerHour).toBe(3000)
    expect(retrieved!.encryptionKeyVersion).toBe(2)
  })

  it('removes tenant config', async () => {
    const config: CachedTenantConfig = {
      tenantId: 'KOP-001',
      tariffRatePerHour: 2000,
      maxBalance: 10_000_000,
      minBalanceForEntry: 2000,
      encryptionKeyMaterial: 'key-v1',
      encryptionKeyVersion: 1,
      branding: {
        primaryColor: '#1a73e8',
        logoUrl: null,
        displayName: 'Koperasi A',
      },
      cachedAt: Date.now(),
    }

    await setCachedTenantConfig(db, config)
    await removeCachedTenantConfig(db, 'KOP-001')

    const result = await getCachedTenantConfig(db, 'KOP-001')
    expect(result).toBeUndefined()
  })
})
