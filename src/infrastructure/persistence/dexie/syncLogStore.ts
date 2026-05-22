/**
 * In-memory sync log store for capturing sync failure reasons.
 * Provides a reactive way to track and display sync errors in the Settings panel.
 */

export type SyncLogLevel = "info" | "warn" | "error";

export interface SyncLogEntry {
  id: string;
  timestamp: number;
  level: SyncLogLevel;
  message: string;
  details?: string;
}

/** Maximum number of log entries to retain */
const MAX_LOG_ENTRIES = 100;

let _logs: SyncLogEntry[] = [];
let _listeners: Set<() => void> = new Set();
let _idCounter = 0;

function notifyListeners(): void {
  for (const listener of _listeners) {
    listener();
  }
}

/**
 * Add a log entry to the sync log store.
 */
export function addSyncLog(level: SyncLogLevel, message: string, details?: string): void {
  const entry: SyncLogEntry = {
    id: `sync-log-${++_idCounter}`,
    timestamp: Date.now(),
    level,
    message,
    details,
  };

  _logs = [entry, ..._logs].slice(0, MAX_LOG_ENTRIES);
  notifyListeners();
}

/**
 * Get all current log entries (newest first).
 */
export function getSyncLogs(): readonly SyncLogEntry[] {
  return _logs;
}

/**
 * Clear all log entries.
 */
export function clearSyncLogs(): void {
  _logs = [];
  notifyListeners();
}

/**
 * Subscribe to log changes. Returns an unsubscribe function.
 */
export function subscribeSyncLogs(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}
