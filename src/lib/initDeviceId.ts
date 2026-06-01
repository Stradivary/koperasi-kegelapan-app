/**
 * Eagerly restores the deviceId from IndexedDB into the API client's
 * in-memory cache on app startup. This ensures the X-Device-Id header
 * is available for any API calls that fire before the React tree mounts
 * and useTenantContext runs.
 *
 * This is a fire-and-forget initialization - if IndexedDB is unavailable
 * or no tenant context exists, the deviceId will be set later during login
 * or when useTenantContext loads.
 */

import { getTenantContextStore } from "./indexeddb.lazy";
import { setCurrentDeviceId } from "./api";

export function initDeviceIdFromStorage(): void {
  // Fire-and-forget: don't block app startup
  getTenantContextStore()
    .then((tenantContextStore) => tenantContextStore.getAll())
    .then((contexts) => {
      if (contexts.length === 0) return;

      // Pick the most recently updated context
      const sorted = contexts.toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      const activeCtx = sorted[0];

      if (activeCtx?.deviceId) {
        setCurrentDeviceId(activeCtx.deviceId);
      }
    })
    .catch(() => {
      // Silently ignore - deviceId will be set later during login or route load
    });
}
