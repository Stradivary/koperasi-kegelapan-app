import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "../ui/button";

const MAX_RETRIES = 3;
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

/**
 * Calculate exponential backoff delay: 1s, 2s, 4s
 */
function getBackoffDelay(attempt: number): number {
  return Math.pow(2, attempt) * 1000;
}

/**
 * PWA update prompt UI component.
 *
 * Service worker registration is handled automatically by VitePWA's
 * `injectRegister: 'auto'` configuration. This component uses `useRegisterSW`
 * to detect updates and prompt the user to reload.
 *
 * Includes:
 * - Error handling for SW registration failures
 * - Retry logic with exponential backoff (1s, 2s, 4s) for update checks
 * - Graceful degradation when SW is unavailable (e.g., HTTP context)
 */
export function PwaUpdatePrompt() {
  const retryCountRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkForUpdates = useCallback(async (registration: ServiceWorkerRegistration) => {
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        await registration.update();
        // Reset retry count on success
        retryCountRef.current = 0;
        return;
      } catch (error) {
        attempt++;
        if (attempt >= MAX_RETRIES) {
          console.warn(
            `[PwaUpdatePrompt] Update check failed after ${MAX_RETRIES} retries:`,
            error,
          );
          return;
        }
        // Wait with exponential backoff before retrying
        const delay = getBackoffDelay(attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }, []);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (!r) {
        console.warn(
          "[PwaUpdatePrompt] SW registration returned undefined — SW may not be available",
        );
        return;
      }

      // Set up periodic update checks with error handling
      intervalRef.current = setInterval(() => {
        checkForUpdates(r);
      }, UPDATE_CHECK_INTERVAL);

      // Perform an initial update check
      checkForUpdates(r);
    },
    onRegisterError(error) {
      console.error("[PwaUpdatePrompt] SW registration failed:", error);
      // Don't crash the app — the component will simply not show the update prompt
    },
  });

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const [dismissed, setDismissed] = useState(false);

  if (!needRefresh || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto">
      <div className="bg-brand-dark text-white rounded-2xl shadow-lg p-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="type-body1-bold text-white">Update tersedia</p>
          <p className="type-body2 text-white/70">Versi baru aplikasi siap diinstal</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={() => setDismissed(true)} variant="ghost">
            Nanti
          </Button>
          <Button onClick={() => updateServiceWorker(true)} variant="default">
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}
