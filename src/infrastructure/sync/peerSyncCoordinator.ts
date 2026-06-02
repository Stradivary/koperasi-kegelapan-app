/**
 * PeerSyncCoordinator
 *
 * Ensures cross-device check-in consistency by coordinating sync pushes
 * between devices. The NFC card state is ALWAYS the authoritative source
 * of truth - operations are never blocked waiting for cloud sync.
 *
 * Key principles:
 * - NFC card state is authoritative (operations always proceed)
 * - Cloud sync is best-effort for consistency
 * - Sync failures never block operations
 * - Immediate push on check-in (bypass 5s debounce)
 *
 * @see Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */

import { localDb } from "#/infrastructure/persistence/dexie/localDb";
import { syncPush } from "#/application/sync/syncPush.usecase";

// ── Types ──────────────────────────────────────────────────────────────

export interface PeerSyncStatus {
  /** Whether the last check-in has been confirmed synced to cloud */
  lastCheckinSynced: boolean;
  /** Timestamp of last confirmed sync */
  lastSyncConfirmedAt: number | null;
  /** Whether we should block operations pending sync (always false - NFC is authoritative) */
  shouldWaitForSync: boolean;
}

export interface PeerSyncCoordinator {
  /** Notify that a check-in was performed on this device */
  notifyCheckin(cardId: string, timestamp: number): void;
  /** Check if a card's check-in has been synced before allowing operations on another device */
  verifyCheckinSynced(cardId: string): Promise<PeerSyncStatus>;
  /** Force push pending check-in data before allowing cross-device read */
  forcePushBeforeRead(cardId: string): Promise<boolean>;
}

// ── Constants ──────────────────────────────────────────────────────────

/** Maximum wait time for forcePushBeforeRead in milliseconds */
const FORCE_PUSH_TIMEOUT_MS = 3000;

// ── Internal state ─────────────────────────────────────────────────────

/** Track the tenant ID for sync operations */
let activeTenantId: string | null = null;

/** Callback to trigger immediate sync (set by integration layer) */
let triggerSyncCallback: (() => void) | null = null;

// ── Configuration ──────────────────────────────────────────────────────

/**
 * Set the active tenant ID for sync operations.
 * Must be called before using the coordinator.
 */
export function setActiveTenantId(tenantId: string | null): void {
  activeTenantId = tenantId;
}

/**
 * Register a callback to trigger immediate sync (bypass debounce).
 * Typically wired to useSyncEngine's triggerSync().
 */
export function registerTriggerSync(callback: (() => void) | null): void {
  triggerSyncCallback = callback;
}

// ── Implementation ─────────────────────────────────────────────────────

/**
 * Notify that a check-in was performed on this device.
 * Triggers an immediate sync push to the cloud, bypassing the normal 5s debounce.
 *
 * @param cardId - The card that was checked in
 * @param timestamp - The check-in timestamp (epoch ms)
 *
 * @see Requirement 9.1: Trigger sync push within 500ms, bypassing debounce
 */
export function notifyCheckin(_cardId: string, _timestamp: number): void {
  // Trigger immediate sync push (bypass debounce)
  if (triggerSyncCallback) {
    triggerSyncCallback();
  } else if (activeTenantId) {
    // Fallback: call syncPush directly if no callback registered
    syncPush(activeTenantId).catch(() => {
      // Sync failure is non-blocking - NFC card state is authoritative
      // The standard retry/backoff mechanism will handle re-push
    });
  }
}

/**
 * Verify whether a card's check-in has been synced to the cloud.
 *
 * NFC card state is authoritative - shouldWaitForSync is always false.
 * This function provides status information for monitoring/logging purposes.
 *
 * @param cardId - The card to check sync status for
 * @returns PeerSyncStatus indicating sync state
 *
 * @see Requirement 9.3: Allow operations based on NFC card state alone
 * @see Requirement 9.4: Allow terminal operations immediately without waiting for cloud
 */
export async function verifyCheckinSynced(cardId: string): Promise<PeerSyncStatus> {
  if (!activeTenantId) {
    return {
      lastCheckinSynced: false,
      lastSyncConfirmedAt: null,
      shouldWaitForSync: false,
    };
  }

  try {
    // Check for pending check-in transactions for this card
    const pendingCheckins = await localDb.transactionLog
      .where("[tenantId+cardId+counter]")
      .between([activeTenantId, cardId, -Infinity], [activeTenantId, cardId, Infinity], true, true)
      .filter((entry) => entry.type === "checkin" && entry.syncStatus === "pending")
      .toArray();

    if (pendingCheckins.length === 0) {
      // No pending check-ins - either already synced or no check-in recorded
      // Find the most recent synced check-in to get the confirmed timestamp
      const syncedCheckins = await localDb.transactionLog
        .where("[tenantId+cardId+counter]")
        .between(
          [activeTenantId, cardId, -Infinity],
          [activeTenantId, cardId, Infinity],
          true,
          true,
        )
        .filter((entry) => entry.type === "checkin" && entry.syncStatus === "synced")
        .toArray();

      const sortedCheckins = syncedCheckins.toSorted((a, b) => b.timestamp - a.timestamp);
      const lastSynced = sortedCheckins[0];

      return {
        lastCheckinSynced: true,
        lastSyncConfirmedAt: lastSynced?.syncedAt ?? null,
        shouldWaitForSync: false,
      };
    }

    // There are pending check-ins - not yet synced
    return {
      lastCheckinSynced: false,
      lastSyncConfirmedAt: null,
      shouldWaitForSync: false, // NFC card state is authoritative - never wait
    };
  } catch {
    // On any error, return safe defaults - never block operations
    return {
      lastCheckinSynced: false,
      lastSyncConfirmedAt: null,
      shouldWaitForSync: false,
    };
  }
}

/**
 * Force push pending transactions for a card before a cross-device read.
 * Attempts to push with a 3s maximum wait time.
 *
 * Returns whether the push actually succeeded. Callers should never block
 * operations on this result - NFC card state is authoritative regardless.
 * A `false` return means the push failed or timed out and will be retried
 * by the standard backoff mechanism.
 *
 * @param cardId - The card to push pending transactions for
 * @returns true if push succeeded or there was nothing to push; false if push failed or timed out
 *
 * @see Requirement 9.5: Push pending transactions with 3s max wait
 * @see Requirement 9.6: On failure, allow operations to continue, queue for retry
 * @see Requirement 9.7: NFC card state is authoritative, update cloud on next sync
 */
export async function forcePushBeforeRead(cardId: string): Promise<boolean> {
  if (!activeTenantId) {
    return true; // No tenant - nothing to push
  }

  if (!navigator.onLine) {
    return false; // Offline - push not possible, retry via backoff
  }

  try {
    // Check if there are pending transactions for this card
    const pendingEntries = await localDb.transactionLog
      .where("[tenantId+cardId+counter]")
      .between([activeTenantId, cardId, -Infinity], [activeTenantId, cardId, Infinity], true, true)
      .filter((entry) => entry.syncStatus === "pending")
      .toArray();

    if (pendingEntries.length === 0) {
      return true; // Nothing to push
    }

    // Attempt sync push with 3s timeout
    await Promise.race([
      syncPush(activeTenantId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Force push timeout")), FORCE_PUSH_TIMEOUT_MS),
      ),
    ]);

    return true; // Push succeeded
  } catch {
    // Push failed or timed out - standard backoff mechanism will handle retry
    return false;
  }
}

// ── Coordinator instance (for interface compliance) ────────────────────

export const peerSyncCoordinator: PeerSyncCoordinator = {
  notifyCheckin,
  verifyCheckinSynced,
  forcePushBeforeRead,
};
