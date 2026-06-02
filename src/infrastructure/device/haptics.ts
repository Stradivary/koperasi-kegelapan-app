/**
 * Haptic feedback utility for kiosk NFC interactions.
 * Provides tactile feedback on phase transitions via the Vibration API.
 *
 * @see Requirements 11.3, 11.4
 */

/**
 * Triggers haptic feedback based on the interaction type.
 *
 * - "intermediate": 50ms pulse for scanning, validating, writing transitions
 * - "success": 100ms pulse for successful operations
 * - "error": two 50ms pulses separated by 50ms gap for error states
 *
 * Silently no-ops if the Vibration API is not supported (e.g., SSR, desktop browsers).
 */
export function triggerHaptic(type: "intermediate" | "success" | "error"): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) {
    return;
  }

  switch (type) {
    case "intermediate":
      navigator.vibrate(50);
      break;
    case "success":
      navigator.vibrate(100);
      break;
    case "error":
      navigator.vibrate([50, 50, 50]);
      break;
  }
}
