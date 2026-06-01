import { useState, useEffect, useCallback, useRef } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSAL_KEY = "pwa-install-prompt-dismissed";

/**
 * Check if the user has dismissed the install prompt in this session.
 */
function isDismissedInSession(): boolean {
  try {
    return sessionStorage.getItem(DISMISSAL_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Persist dismissal state so the prompt doesn't re-appear in the same session.
 */
function persistDismissal(): void {
  try {
    sessionStorage.setItem(DISMISSAL_KEY, "true");
  } catch {
    // Ignore storage errors (e.g., private browsing)
  }
}

/**
 * Global variable to capture the beforeinstallprompt event early,
 * before any component mounts. This ensures we don't miss the event
 * if it fires during page load.
 */
let earlyPromptEvent: BeforeInstallPromptEvent | null = null;

if (globalThis.window !== undefined) {
  globalThis.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    earlyPromptEvent = e as BeforeInstallPromptEvent;
  });
}

/**
 * Captures the browser's install prompt event and exposes it for deferred use.
 * Returns `canInstall` (true when prompt is available and not dismissed),
 * `isInstalled`, `install()` to trigger it, and `dismiss()` to hide it for the session.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    earlyPromptEvent,
  );
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(isDismissedInSession);
  const promptCaptured = useRef(!!earlyPromptEvent);

  useEffect(() => {
    // Check if already installed via display-mode media queries
    // Include standalone, fullscreen, and minimal-ui for broader browser support
    const mq = globalThis.matchMedia(
      "(display-mode: fullscreen), (display-mode: standalone), (display-mode: minimal-ui)",
    );
    if (mq.matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for display-mode changes (e.g., app gets installed while page is open)
    const mqHandler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };
    mq.addEventListener("change", mqHandler);

    const handler = (e: Event) => {
      e.preventDefault();
      earlyPromptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      promptCaptured.current = true;
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      earlyPromptEvent = null;
    };

    globalThis.addEventListener("beforeinstallprompt", handler);
    globalThis.addEventListener("appinstalled", installedHandler);

    // If the early event was captured before mount, use it
    if (earlyPromptEvent && !promptCaptured.current) {
      setDeferredPrompt(earlyPromptEvent);
      promptCaptured.current = true;
    }

    return () => {
      globalThis.removeEventListener("beforeinstallprompt", handler);
      globalThis.removeEventListener("appinstalled", installedHandler);
      mq.removeEventListener("change", mqHandler);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    earlyPromptEvent = null;
    if (outcome === "dismissed") {
      persistDismissal();
      setIsDismissed(true);
    }
    return outcome === "accepted";
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    persistDismissal();
    setIsDismissed(true);
  }, []);

  return {
    canInstall: !!deferredPrompt && !isInstalled && !isDismissed,
    isInstalled,
    install,
    dismiss,
  };
}
