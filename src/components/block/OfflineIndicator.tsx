import { WifiHigh, WifiOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useOnlineStatus } from "#/hooks/useOnlineStatus";
import type { ReconciliationStatus } from "#/hooks/useReconciliation";
import { Button } from "../ui/button";

interface OfflineIndicatorProps {
  pendingCount: number;
  syncStatus: ReconciliationStatus;
  onSync: () => void;
}

export function OfflineIndicator({
  pendingCount,
  syncStatus,
  onSync,
}: Readonly<OfflineIndicatorProps>) {
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
 * Snackbar-style connectivity notification. Shows a brief toast when
 * the browser transitions between online and offline states, then
 * auto-hides after a few seconds.
 *
 * Renders nothing in the DOM - it only fires sonner toasts on change.
 */
export function RootOfflineBanner() {
  const { isOnline } = useOnlineStatus();
  const prevOnline = useRef(isOnline);

  useEffect(() => {
    // Skip the initial render - only fire on actual transitions
    if (prevOnline.current === isOnline) return;
    prevOnline.current = isOnline;

    if (isOnline) {
      toast.success("Koneksi internet tersambung kembali", { icon: <WifiHigh />, duration: 3000 });
    } else {
      toast.warning("Koneksi internet terputus. Operasi tetap berjalan secara offline.", {
        icon: <WifiOff />,
        duration: 4000,
      });
    }
  }, [isOnline]);

  return null;
}
