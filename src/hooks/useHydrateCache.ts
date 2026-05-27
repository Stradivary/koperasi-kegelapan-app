/**
 * useHydrateCache — Populates React Query cache from IndexedDB (Dexie)
 * on login and on every page navigation.
 *
 * This ensures the UI always has fresh data from the local DB without
 * waiting for individual component queries to fire. It reads from Dexie
 * (which is populated by syncPull) and sets the React Query cache directly.
 *
 * Triggered by:
 * - Initial mount (after login / page load)
 * - Every route navigation (via TanStack Router location changes)
 * - After a successful sync pull (lastSyncedAt changes)
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { getCardsWithUsers, getUserRows } from "#/lib/stationQueries";

/**
 * Read IndexedDB and populate React Query cache for a tenant.
 * Exported so it can be called imperatively (e.g., after login).
 */
export async function hydrateQueryCache(
  queryClient: { setQueryData: (key: unknown[], data: unknown) => void },
  tenantId: string,
): Promise<void> {
  const [stationCards, filteredUsers] = await Promise.all([
    getCardsWithUsers(tenantId),
    getUserRows(tenantId),
  ]);

  // Set cache directly — this populates the queries without triggering a refetch
  queryClient.setQueryData(["station-cards", tenantId], stationCards);
  queryClient.setQueryData(["users", tenantId], filteredUsers);
}

/**
 * Hydrate React Query cache with data from IndexedDB for the given tenant.
 * Call this in the tenant layout so it runs on every navigation and after sync.
 *
 * @param tenantId - Active tenant ID (null/undefined to disable)
 * @param lastSyncedAt - Timestamp of last successful sync (triggers re-hydration)
 */
export function useHydrateCache(tenantId: string | null | undefined, lastSyncedAt?: number | null) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const isHydratingRef = useRef(false);

  useEffect(() => {
    if (!tenantId || isHydratingRef.current) return;

    let cancelled = false;
    isHydratingRef.current = true;

    async function hydrate() {
      try {
        if (cancelled) return;
        await hydrateQueryCache(queryClient, tenantId!);
      } catch (err) {
        // Non-critical — queries will still work via their own queryFn
        console.warn("[useHydrateCache] Failed to hydrate cache:", err);
      } finally {
        isHydratingRef.current = false;
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
      isHydratingRef.current = false;
    };
    // Re-run on every navigation (location.pathname changes), tenantId change,
    // and after a successful sync (lastSyncedAt changes)
  }, [tenantId, location.pathname, lastSyncedAt, queryClient]);
}
