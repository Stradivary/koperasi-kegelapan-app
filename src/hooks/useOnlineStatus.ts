import { useState, useEffect } from "react";

/**
 * Reactively tracks browser online/offline connectivity state.
 * Uses `navigator.onLine` for initial value and listens to window
 * `online`/`offline` events for real-time updates.
 *
 * @returns `{ isOnline }` - `true` when the browser reports connectivity,
 * `false` when offline.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    globalThis.addEventListener("online", handleOnline);
    globalThis.addEventListener("offline", handleOffline);

    return () => {
      globalThis.removeEventListener("online", handleOnline);
      globalThis.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
}
