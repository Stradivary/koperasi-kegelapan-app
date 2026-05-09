/**
 * Sync Status Tracker
 *
 * Tracks pending transaction count, last successful sync timestamp,
 * and syncing state. Exposes a callback-based reactive interface
 * for terminal UI consumption.
 *
 * Requirements: 8.4
 */

import type { SyncStatus, SyncStatusListener } from './types.ts'
import { getPendingTransactionCount } from './indexed-db.ts'

/**
 * Creates a sync status tracker instance.
 * Not a singleton — one per terminal instance.
 */
export function createSyncStatusTracker(db: IDBDatabase) {
  let status: SyncStatus = {
    pendingCount: 0,
    lastSyncTimestamp: null,
    isSyncing: false,
  }

  const listeners = new Set<SyncStatusListener>()

  function notify() {
    const snapshot = { ...status }
    for (const listener of listeners) {
      listener(snapshot)
    }
  }

  /**
   * Subscribes to sync status changes.
   * Returns an unsubscribe function.
   */
  function subscribe(listener: SyncStatusListener): () => void {
    listeners.add(listener)
    // Immediately notify with current status
    listener({ ...status })
    return () => {
      listeners.delete(listener)
    }
  }

  /**
   * Returns the current sync status snapshot.
   */
  function getStatus(): SyncStatus {
    return { ...status }
  }

  /**
   * Refreshes the pending count from IndexedDB.
   */
  async function refreshPendingCount(): Promise<void> {
    const pending = await getPendingTransactionCount(db, 'pending')
    const failed = await getPendingTransactionCount(db, 'failed')
    status = { ...status, pendingCount: pending + failed }
    notify()
  }

  /**
   * Marks sync as in progress.
   */
  function setSyncing(syncing: boolean): void {
    status = { ...status, isSyncing: syncing }
    notify()
  }

  /**
   * Records a successful sync and updates the timestamp.
   */
  function recordSuccessfulSync(syncedCount: number): void {
    if (syncedCount > 0) {
      status = {
        ...status,
        lastSyncTimestamp: Date.now(),
      }
      notify()
    }
  }

  /**
   * Updates the pending count by a delta (e.g., +1 when queuing, -N after sync).
   */
  function adjustPendingCount(delta: number): void {
    status = {
      ...status,
      pendingCount: Math.max(0, status.pendingCount + delta),
    }
    notify()
  }

  return {
    subscribe,
    getStatus,
    refreshPendingCount,
    setSyncing,
    recordSuccessfulSync,
    adjustPendingCount,
  }
}

export type SyncStatusTracker = ReturnType<typeof createSyncStatusTracker>
