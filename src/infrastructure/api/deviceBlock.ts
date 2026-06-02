/**
 * Client-side device block handling.
 *
 * Intercepts 403 `device_blocked` responses, clears local auth state,
 * exposes block status for sync engine suppression, and schedules
 * re-authentication when the block expires.
 */

import { getTenantContextStore } from "#/infrastructure/persistence/dexie/indexeddb.lazy";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DeviceBlockState {
  blocked: boolean;
  blockedUntil: number | null; // unix timestamp in seconds
}

export interface DeviceBlockedResponse {
  error: "device_blocked";
  blockedUntil: number;
}

// ── Singleton state ──────────────────────────────────────────────────────────

let _blockState: DeviceBlockState = { blocked: false, blockedUntil: null };
let _unblockTimer: ReturnType<typeof setTimeout> | null = null;
let _onUnblock: (() => void) | null = null;
const _listeners: Set<(state: DeviceBlockState) => void> = new Set();

// ── Public API ───────────────────────────────────────────────────────────────

/** Get the current device block state. */
export function getDeviceBlockState(): DeviceBlockState {
  return { ..._blockState };
}

/** Check if the device is currently blocked. */
export function isDeviceBlocked(): boolean {
  if (!_blockState.blocked) return false;
  // Check if block has expired based on local clock
  if (_blockState.blockedUntil !== null) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (_blockState.blockedUntil <= nowSeconds) {
      // Block expired locally - clear it
      clearBlockState();
      return false;
    }
  }
  return true;
}

/** Subscribe to block state changes. Returns unsubscribe function. */
export function subscribeToDeviceBlock(listener: (state: DeviceBlockState) => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/** Register a callback to be invoked when the block expires (for re-auth). */
export function onDeviceUnblock(callback: () => void): void {
  _onUnblock = callback;
}

/**
 * Handle a device block response from the server.
 * Clears auth state and sets up the unblock timer.
 */
export async function handleDeviceBlocked(blockedUntil: number, tenantId?: string): Promise<void> {
  _blockState = { blocked: true, blockedUntil };
  notifyListeners();

  // Clear local auth state
  await clearAuthState(tenantId);

  // Schedule re-auth attempt when block expires
  scheduleUnblock(blockedUntil);
}

/** Clear the block state (e.g., after successful re-auth). */
export function clearBlockState(): void {
  _blockState = { blocked: false, blockedUntil: null };
  if (_unblockTimer) {
    clearTimeout(_unblockTimer);
    _unblockTimer = null;
  }
  notifyListeners();
}

/**
 * Check if a fetch Response is a device_blocked 403 response.
 * If so, handles the block and returns true. Otherwise returns false.
 *
 * Usage in API calls:
 * ```ts
 * const res = await fetch(url, options);
 * if (await checkDeviceBlockResponse(res, tenantId)) {
 *   // Request was blocked - caller should abort
 *   return;
 * }
 * ```
 */
export async function checkDeviceBlockResponse(
  response: Response,
  tenantId?: string,
): Promise<boolean> {
  if (response.status !== 403) return false;

  try {
    // Clone to avoid consuming the body for the caller
    const body = await response.clone().json();
    if (body?.error === "device_blocked" && typeof body.blockedUntil === "number") {
      await handleDeviceBlocked(body.blockedUntil, tenantId);
      return true;
    }
  } catch {
    // Not a JSON response or not a device_blocked error - ignore
  }

  return false;
}

/**
 * Format the blocked-until timestamp for display in the user's locale.
 */
export function formatBlockedUntil(blockedUntil: number): string {
  const date = new Date(blockedUntil * 1000);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function notifyListeners(): void {
  const state = getDeviceBlockState();
  for (const listener of _listeners) {
    try {
      listener(state);
    } catch {
      // Don't let listener errors break the notification loop
    }
  }
}

async function clearAuthState(tenantId?: string): Promise<void> {
  try {
    const tenantContextStore = await getTenantContextStore();
    if (tenantId) {
      // Clear specific tenant context
      await tenantContextStore.delete(tenantId);
      // Clear cached session grants for this tenant
      // We need to get the context first to know accountId/deviceId
      // Since we may have already deleted it, try to clear by iterating
      // The sessionGrantCacheStore uses composite key [tenantId, accountId, deviceId]
      // We'll clear all contexts and let the user re-auth
    } else {
      // Clear all tenant contexts if no specific tenant
      const allContexts = await tenantContextStore.getAll();
      for (const ctx of allContexts) {
        await tenantContextStore.delete(ctx.tenantId);
      }
    }

    // Clear all session grant caches - they're invalid after a block
    // Since sessionGrantCacheStore doesn't have a getAll/clearAll,
    // we clear via the raw IndexedDB API
    await clearSessionGrantCache(tenantId);
  } catch {
    // Best-effort cleanup - don't throw if IndexedDB fails
  }
}

async function clearSessionGrantCache(tenantId?: string): Promise<void> {
  const idb =
    typeof globalThis !== "undefined" && "indexedDB" in globalThis ? globalThis.indexedDB : null;
  if (!idb) return;

  return new Promise((resolve) => {
    const req = idb.open("koperasi-wallet", 3);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sessionGrantCache")) {
        db.close();
        resolve();
        return;
      }
      const transaction = db.transaction("sessionGrantCache", "readwrite");
      const store = transaction.objectStore("sessionGrantCache");

      if (tenantId) {
        // Iterate and delete matching tenant entries
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (cursor) {
            const value = cursor.value;
            if (value.tenantId === tenantId) {
              cursor.delete();
            }
            cursor.continue();
          }
        };
      } else {
        // Clear all
        store.clear();
      }

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        resolve();
      };
    };
    req.onerror = () => resolve();
  });
}

function scheduleUnblock(blockedUntil: number): void {
  if (_unblockTimer) {
    clearTimeout(_unblockTimer);
    _unblockTimer = null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const delayMs = Math.max(0, (blockedUntil - nowSeconds) * 1000);

  // Cap at 24 hours to avoid setTimeout overflow issues with very large values
  const maxDelay = 24 * 60 * 60 * 1000;
  const effectiveDelay = Math.min(delayMs, maxDelay);

  _unblockTimer = setTimeout(() => {
    _unblockTimer = null;
    _blockState = { blocked: false, blockedUntil: null };
    notifyListeners();

    // Trigger re-authentication callback
    if (_onUnblock) {
      _onUnblock();
    }
  }, effectiveDelay);
}

// ── Visibility change handler ────────────────────────────────────────────────

/**
 * Set up a visibility change listener that checks block expiry
 * when the user returns to the tab. Call once at app startup.
 */
export function setupBlockVisibilityHandler(): () => void {
  function handleVisibilityChange() {
    if (document.visibilityState !== "visible") return;
    if (!_blockState.blocked || _blockState.blockedUntil === null) return;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (_blockState.blockedUntil <= nowSeconds) {
      // Block has expired while tab was hidden
      clearBlockState();
      if (_onUnblock) {
        _onUnblock();
      }
    }
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
