import { useEffect, useState } from "react";
import {
  ArrowUpFromLine,
  ArrowDownToLine,
  AlertCircle,
  WifiOff,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import type { SyncEngineStatus } from "#/hooks/useSyncEngine";

// ── Types ──────────────────────────────────────────────────────────────

interface SyncStatusIndicatorProps {
  syncStatus: SyncEngineStatus;
  lastSyncedAt: number | null;
  pendingCount: number;
  /** Optional: trigger manual sync */
  onSync?: () => void;
}

// ── Status config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SyncEngineStatus,
  { label: string; icon: React.ElementType; colorClass: string; animate?: boolean }
> = {
  idle: {
    label: "Synced",
    icon: CheckCircle2,
    colorClass: "bg-green-100 text-green-700",
  },
  pushing: {
    label: "Pushing",
    icon: ArrowUpFromLine,
    colorClass: "bg-blue-100 text-blue-700",
    animate: true,
  },
  pulling: {
    label: "Pulling",
    icon: ArrowDownToLine,
    colorClass: "bg-blue-100 text-blue-700",
    animate: true,
  },
  error: {
    label: "Sync Error",
    icon: AlertCircle,
    colorClass: "bg-red-100 text-red-700",
  },
  offline: {
    label: "Offline",
    icon: WifiOff,
    colorClass: "bg-gray-100 text-gray-600",
  },
};

// ── Relative time formatting ───────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

// ── Component ──────────────────────────────────────────────────────────

/**
 * Displays the current sync engine status with a colored badge,
 * pending Outbox count, and last synced timestamp.
 *
 * @see Requirements 11.1, 11.2, 11.7, 11.8
 */
export function SyncStatusIndicator({
  syncStatus,
  lastSyncedAt,
  pendingCount,
  onSync,
}: Readonly<SyncStatusIndicatorProps>) {
  const config = STATUS_CONFIG[syncStatus];
  const Icon = config.icon;

  // Re-render periodically to keep relative time fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastSyncedAt) return;
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  const pendingLabel = pendingCount > 0 ? `, ${pendingCount} pending` : "";
  const lastSyncedLabel = lastSyncedAt ? `, last synced ${formatRelativeTime(lastSyncedAt)}` : "";
  const ariaLabel = `Sync status: ${config.label}${pendingLabel}${lastSyncedLabel}`;

  return (
    <output className="flex items-center gap-2 flex-wrap" aria-label={ariaLabel}>
      {/* Status badge */}
      <span
        className={[
          "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium",
          config.colorClass,
        ].join(" ")}
      >
        <Icon size={12} className={config.animate ? "animate-pulse" : ""} aria-hidden="true" />
        {config.label}
      </span>

      {/* Pending count */}
      {pendingCount > 0 && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium cursor-default"
          title={`${pendingCount} entries awaiting sync`}
          onClick={onSync}
          aria-label={`${pendingCount} entries awaiting sync. Click to sync.`}
        >
          <RefreshCw size={10} aria-hidden="true" />
          {pendingCount} pending
        </button>
      )}

      {/* Last synced timestamp */}
      {lastSyncedAt && syncStatus === "idle" && (
        <span
          className="text-xs text-muted-foreground"
          title={new Date(lastSyncedAt).toLocaleString()}
        >
          {formatRelativeTime(lastSyncedAt)}
        </span>
      )}
    </output>
  );
}
