/**
 * Sync Status Bar
 *
 * Displays pending sync count and last sync timestamp.
 * Used across all terminal UIs.
 *
 * Requirements: 8.4
 */

import { cn } from '#/lib/utils.ts'
import type { SyncStatus } from '#/lib/sync/types.ts'

interface SyncStatusBarProps {
  syncStatus: SyncStatus
  className?: string
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return 'Never'
  const date = new Date(ts)
  return date.toLocaleTimeString()
}

export function SyncStatusBar({ syncStatus, className }: SyncStatusBarProps) {
  const { pendingCount, lastSyncTimestamp, isSyncing } = syncStatus

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm',
        className,
      )}
      role="status"
      aria-label={`Sync status: ${pendingCount} pending transactions. Last sync: ${formatTimestamp(lastSyncTimestamp)}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-block h-2.5 w-2.5 rounded-full',
            pendingCount === 0 && !isSyncing && 'bg-emerald-500',
            pendingCount > 0 && !isSyncing && 'bg-amber-500',
            isSyncing && 'animate-pulse bg-blue-500',
          )}
          aria-hidden="true"
        />
        <span className="font-medium">
          {isSyncing
            ? 'Syncing...'
            : pendingCount === 0
              ? 'All synced'
              : `${pendingCount} pending`}
        </span>
      </div>
      <span className="text-muted-foreground">
        Last sync: {formatTimestamp(lastSyncTimestamp)}
      </span>
    </div>
  )
}
