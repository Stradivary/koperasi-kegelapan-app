import { useEffect, useRef, useState } from "react";
import type { NfcCardPhase } from "./nfc/useNfcCard";
import type { SessionGrant } from "#/core/payload/types";

export interface UseKioskAutoScanOptions {
  enabled: boolean;
  grant: SessionGrant | null;
  loading: boolean;
  phase: NfcCardPhase;
  scan: () => void;
  resetDelay?: number;
  /**
   * When true, automatically triggers the first scan on mount
   * (as soon as grant is available and phase is idle).
   * This removes the need for a manual "Tempelkan Kartu" button.
   */
  autoStart?: boolean;
}

/**
 * Encapsulates the auto-scan loop logic for kiosk mode.
 *
 * After at least one scan cycle completes (reaches "success" or "error"),
 * the hook will automatically invoke `scan()` whenever the phase transitions
 * back to "idle" — provided `enabled` is true, `grant` is non-null, and
 * the grant is not still loading.
 *
 * When `autoStart` is true, the hook will also trigger the first scan
 * automatically on mount (as soon as grant is available and phase is idle),
 * removing the need for a manual button tap.
 */
export function useKioskAutoScan(options: UseKioskAutoScanOptions): {
  hasCompletedCycle: boolean;
  isAutoScanning: boolean;
} {
  const { enabled, grant, loading, phase, scan, resetDelay, autoStart = false } = options;

  // Track whether at least one cycle has completed (success or error observed)
  const [hasCompletedCycle, setHasCompletedCycle] = useState(false);

  // Track whether we are currently in auto-scanning mode
  const [isAutoScanning, setIsAutoScanning] = useState(false);

  // Use a ref to track the previous phase so we can detect transitions
  const prevPhaseRef = useRef<NfcCardPhase>(phase);

  // Use a ref for hasCompletedCycle to avoid stale closures in the idle effect
  const hasCompletedCycleRef = useRef(false);

  // Track whether the initial auto-start scan has been triggered
  const autoStartTriggeredRef = useRef(false);

  // Mark cycle as completed when phase reaches "success" or "error"
  useEffect(() => {
    if (phase === "success" || phase === "error") {
      if (!hasCompletedCycleRef.current) {
        hasCompletedCycleRef.current = true;
        setHasCompletedCycle(true);
      }
    }
  }, [phase]);

  // Auto-start: trigger the first scan on mount when grant becomes available
  useEffect(() => {
    if (!autoStart || autoStartTriggeredRef.current) return;
    if (!enabled || !grant || loading) return;
    if (phase !== "idle") return;

    autoStartTriggeredRef.current = true;
    scan();
  }, [autoStart, enabled, grant, loading, phase, scan]);

  // Auto-invoke scan() when phase transitions to "idle" after a completed cycle
  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    // Only act on transitions TO idle (not when already idle)
    if (phase !== "idle" || prevPhase === "idle") return;

    // Don't trigger if no cycle has completed yet (prevents initial mount trigger)
    if (!hasCompletedCycleRef.current) return;

    // Don't trigger if auto-scan is disabled
    if (!enabled) return;

    // Don't trigger if grant is null or still loading
    if (!grant || loading) return;

    setIsAutoScanning(true);

    if (resetDelay && resetDelay > 0) {
      const timer = setTimeout(() => {
        scan();
        setIsAutoScanning(false);
      }, resetDelay);
      return () => {
        clearTimeout(timer);
        setIsAutoScanning(false);
      };
    } else {
      scan();
      setIsAutoScanning(false);
    }
  }, [phase, enabled, grant, loading, scan, resetDelay]);

  return { hasCompletedCycle, isAutoScanning };
}
