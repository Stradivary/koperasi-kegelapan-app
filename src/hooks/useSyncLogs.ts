/**
 * React hook for consuming sync log entries reactively.
 * Uses useSyncExternalStore for tear-free reads from the sync log store.
 */

import { useSyncExternalStore } from "react";
import { getSyncLogs, subscribeSyncLogs, type SyncLogEntry } from "../lib/syncLogStore";

/**
 * Subscribe to sync log entries. Re-renders when new logs are added or cleared.
 */
export function useSyncLogs(): readonly SyncLogEntry[] {
  return useSyncExternalStore(subscribeSyncLogs, getSyncLogs, getSyncLogs);
}
