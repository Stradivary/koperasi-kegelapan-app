import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import type { ReconciliationStatus } from "../../hooks/useReconciliation";
import { Button } from "../ui/button";

interface OfflineIndicatorProps {
  pendingCount: number;
  syncStatus: ReconciliationStatus;
  onSync: () => void;
}

export function OfflineIndicator({ pendingCount, syncStatus, onSync }: OfflineIndicatorProps) {
  const isOnline = typeof navigator !== "undefined" && navigator.onLine;

  if (pendingCount === 0 && isOnline) return null;

  return (
    <div className="flex items-center gap-2">
      {!isOnline && (
        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Offline</span>
      )}
      {pendingCount > 0 && (
        <Button
          variant="ghost"
          onClick={onSync}
          disabled={syncStatus === "syncing" || !isOnline}
          className="text-xs h-7 px-2"
        >
          {syncStatus === "syncing" ? "Syncing..." : `${pendingCount} pending`}
        </Button>
      )}
    </div>
  );
}

/**
 * Root-level offline banner displayed at the top of the viewport when
 * the browser reports no network connectivity. Uses the reactive
 * `useOnlineStatus` hook so it appears/disappears in real time.
 *
 * Renders as a subtle, in-flow element that pushes the topbar down
 * rather than overlaying it with fixed positioning.
 */
export function RootOfflineBanner() {
  const { isOnline } = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="w-full bg-yellow-500 px-3 py-1 text-center" role="status" aria-live="polite">
      <p className="text-xs font-medium text-white">Mode Offline</p>
    </div>
  );
}
