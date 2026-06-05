import { useState, useEffect, useRef } from "react";
import { checkLocalBlockedStatus } from "#/core/nfc/localStatusCheck";
import { cardRepo, userRepo } from "#/infrastructure/persistence/dexie/repositories";
import type { NfcCardPhase } from "./nfc/useNfcCard";
import type { CardPayload } from "#/core/payload/types";

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
 * - Runs `checkLocalBlockedStatus` when phase transitions to "ready" and payload is available
 * - Uses payload.header.cardId (hex) as the lookup key to match local DB storage
 * - Discards stale results if phase/payload changes during in-flight check
 * - Resets all state when phase transitions to "idle"
 * - On IndexedDB read error, treats as not blocked with notInLocalDb: true
 */
export function useBlockedCheck(options: UseBlockedCheckOptions): BlockedCheckResult {
  const { tenantId, serialNumber: _serialNumber, phase, payload } = options;
  const [state, setState] = useState<BlockedCheckResult>(INITIAL_STATE);

  // Derive the cardId hex from payload header (matches local DB key format)
  const cardIdHex = payload
    ? Array.from(payload.header.cardId)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    : null;

  // Track the current phase and cardIdHex at invocation time to detect stale results
  const invocationRef = useRef<{ phase: NfcCardPhase; cardIdHex: string | null }>({
    phase: "idle",
    cardIdHex: null,
  });

  // Keep invocationRef in sync with current props
  invocationRef.current = { phase, cardIdHex };

  useEffect(() => {
    // Reset all state when phase transitions to "idle"
    if (phase === "idle") {
      setState(INITIAL_STATE);
      return;
    }

    // Only run the check when phase is "ready" and cardIdHex is available
    if (phase !== "ready" || !cardIdHex) {
      return;
    }

    // Capture the phase/cardIdHex at the time we start the check
    const capturedPhase = phase;
    const capturedCardId = cardIdHex;

    setState((s) => ({ ...s, isChecking: true, isReady: false }));

    checkLocalBlockedStatus(tenantId, cardIdHex, { cardRepo, userRepo })
      .then((result) => {
        // Discard stale results if phase or cardIdHex changed during the async check
        const current = invocationRef.current;
        if (current.phase !== capturedPhase || current.cardIdHex !== capturedCardId) {
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
        if (current.phase !== capturedPhase || current.cardIdHex !== capturedCardId) {
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
  }, [phase, cardIdHex, tenantId]);

  return state;
}
