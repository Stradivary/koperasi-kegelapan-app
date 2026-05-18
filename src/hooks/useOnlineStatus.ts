import { useState, useEffect } from "react";

/**
 * Reactively tracks browser online/offline connectivity state.
 * Uses `navigator.onLine` for initial value and listens to window
 * `online`/`offline` events for real-time updates.
 *
 * @returns `{ isOnline }` — `true` when the browser reports connectivity,
 * `false` when offline.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
}
