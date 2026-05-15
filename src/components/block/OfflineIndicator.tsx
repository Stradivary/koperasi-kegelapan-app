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
