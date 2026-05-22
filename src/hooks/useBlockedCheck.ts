import { useState, useEffect, useRef } from "react";
import { checkLocalBlockedStatus } from "../core/nfc/localStatusCheck";
import type { NfcCardPhase } from "./nfc/useNfcCard";
import type { CardPayload } from "../core/payload/types";

export interface UseBlockedCheckOptions {
  tenantId: string;
  serialNumber: string | null;
  phase: NfcCardPhase;
  payload: CardPayload | null;
}

export interface BlockedCheckResult {
  isChecking: boolean;
  isBlocked: boolean;
  blockedReason: string | null;
  notInLocalDb: boolean;
  /** True when phase === "ready" AND check is complete AND card is not blocked */
  isReady: boolean;
}

const INITIAL_STATE: BlockedCheckResult = {
  isChecking: false,
  isBlocked: false,
  blockedReason: null,
  notInLocalDb: false,
  isReady: false,
};

/**
 * Encapsulates the async local-DB blocked status check with proper race condition handling.
 *
 * - Runs `checkLocalBlockedStatus` when phase transitions to "ready" and serialNumber is non-null
 * - Discards stale results if phase/serialNumber changes during in-flight check
 * - Resets all state when phase transitions to "idle"
 * - On IndexedDB read error, treats as not blocked with notInLocalDb: true
 */
export function useBlockedCheck(options: UseBlockedCheckOptions): BlockedCheckResult {
  const { tenantId, serialNumber, phase, payload: _payload } = options;
  const [state, setState] = useState<BlockedCheckResult>(INITIAL_STATE);

  // Track the current phase and serialNumber at invocation time to detect stale results
  const invocationRef = useRef<{ phase: NfcCardPhase; serialNumber: string | null }>({
    phase: "idle",
    serialNumber: null,
  });

  // Keep invocationRef in sync with current props
  invocationRef.current = { phase, serialNumber };

  useEffect(() => {
    // Reset all state when phase transitions to "idle"
    if (phase === "idle") {
      setState(INITIAL_STATE);
      return;
    }

    // Only run the check when phase is "ready" and serialNumber is available
    if (phase !== "ready" || !serialNumber) {
      return;
    }

    // Capture the phase/serialNumber at the time we start the check
    const capturedPhase = phase;
    const capturedSerial = serialNumber;

    setState((s) => ({ ...s, isChecking: true, isReady: false }));

    checkLocalBlockedStatus(tenantId, serialNumber)
      .then((result) => {
        // Discard stale results if phase or serialNumber changed during the async check
        const current = invocationRef.current;
        if (current.phase !== capturedPhase || current.serialNumber !== capturedSerial) {
          return;
        }

        if (result.blocked) {
          setState({
            isChecking: false,
            isBlocked: true,
            blockedReason: result.reason,
            notInLocalDb: false,
            isReady: false,
          });
        } else {
          setState({
            isChecking: false,
            isBlocked: false,
            blockedReason: null,
            notInLocalDb: result.notInLocalDb,
            isReady: true,
          });
        }
      })
      .catch(() => {
        // On IndexedDB read error, treat as not blocked with notInLocalDb: true
        const current = invocationRef.current;
        if (current.phase !== capturedPhase || current.serialNumber !== capturedSerial) {
          return;
        }

        setState({
          isChecking: false,
          isBlocked: false,
          blockedReason: null,
          notInLocalDb: true,
          isReady: true,
        });
      });
  }, [phase, serialNumber, tenantId]);

  return state;
}
