/**
 * NFC State Machine for the Unified NFC Scanner
 *
 * Implements a reducer-based state machine that manages NFC operation phases.
 * The state machine enforces valid transitions and provides predictable
 * state management for the UI layer.
 *
 * Phase sequence: idle → scanning → classifying → validating/ready → writing → success
 *
 * @module core/nfc/stateMachine
 * @see Requirements 9.1, 19.1, 19.2, 19.3, 19.4
 */

import type { CardPayload } from "../payload/types";
import type { NfcError } from "./adapters/types";
import type { PayloadError } from "./payloadTypes";
import type { CardClassification, RawNfcResult } from "./types";

// ============================================================================
// Phase Type
// ============================================================================

/**
 * The current phase of the NFC operation.
 *
 * - "idle": No operation in progress, waiting for user action
 * - "scanning": Actively scanning for an NFC tag
 * - "classifying": Determining the type of card scanned
 * - "validating": Decrypting and validating a valid_payload card
 * - "ready": Card data is available for display or action
 * - "writing": Writing data to the NFC tag
 * - "write_pending_retry": Write failed, waiting for user to tap card again
 * - "success": Operation completed successfully
 * - "error": An error occurred during the operation
 *
 * @see Requirement 9.1
 */
export type NfcPhase =
  | "idle"
  | "scanning"
  | "classifying"
  | "validating"
  | "ready"
  | "writing"
  | "write_pending_retry"
  | "success"
  | "error";

// ============================================================================
// State Type
// ============================================================================

/**
 * The complete state of the NFC state machine.
 */
export interface NfcState {
  /** Current phase of the NFC operation */
  phase: NfcPhase;
  /** Raw scan result from the Generic NFC Layer */
  rawResult: RawNfcResult | null;
  /** Decoded and validated card payload (for valid_payload cards) */
  payload: CardPayload | null;
  /** Classification of the scanned card */
  classification: CardClassification | null;
  /** Error details if phase is "error" */
  error: NfcError | PayloadError | null;
  /** Whether tamper was detected during validation */
  tamperDetected: boolean;
  /** Whether the card is currently checked in */
  isCheckedIn: boolean;
}

// ============================================================================
// Action Types
// ============================================================================

/**
 * Actions that can be dispatched to the NFC state machine.
 */
export type NfcAction =
  | { type: "START_SCAN" }
  | { type: "RAW_SCAN_COMPLETE"; result: RawNfcResult }
  | { type: "CLASSIFICATION_COMPLETE"; classification: CardClassification }
  | { type: "VALIDATION_COMPLETE"; payload: CardPayload }
  | { type: "START_WRITE" }
  | { type: "WRITE_PENDING_RETRY" }
  | { type: "WRITE_COMPLETE"; payload: CardPayload }
  | { type: "ERROR"; error: NfcError | PayloadError }
  | { type: "RESET" }
  | { type: "CANCEL" };

// ============================================================================
// Initial State
// ============================================================================

/**
 * The initial state of the NFC state machine.
 */
export const initialNfcState: NfcState = {
  phase: "idle",
  rawResult: null,
  payload: null,
  classification: null,
  error: null,
  tamperDetected: false,
  isCheckedIn: false,
};

// ============================================================================
// Active Phases (phases that can be cancelled)
// ============================================================================

/** Phases considered "active" where cancel is allowed */
const ACTIVE_PHASES: ReadonlySet<NfcPhase> = new Set([
  "scanning",
  "classifying",
  "validating",
  "writing",
  "write_pending_retry",
]);

// ============================================================================
// Reducer Helpers
// ============================================================================

/**
 * Determine the next state for CLASSIFICATION_COMPLETE action.
 */
function applyClassificationComplete(
  state: NfcState,
  classification: CardClassification,
): NfcState {
  if (state.phase !== "classifying") return state;

  if (classification === "valid_payload") {
    return { ...state, phase: "validating", classification };
  }
  return { ...state, phase: "ready", classification };
}

/**
 * Determine the next state for VALIDATION_COMPLETE action.
 */
function applyValidationComplete(state: NfcState, payload: CardPayload): NfcState {
  if (state.phase !== "validating") return state;
  const isCheckedIn = payload.wallet.state === 1; // CardState.CHECKED_IN
  return { ...state, phase: "ready", payload, isCheckedIn };
}

/**
 * Determine the next state for WRITE_COMPLETE action.
 */
function applyWriteComplete(state: NfcState, payload: CardPayload): NfcState {
  if (state.phase !== "writing") return state;
  const isCheckedIn = payload.wallet.state === 1; // CardState.CHECKED_IN
  return { ...state, phase: "success", payload, isCheckedIn };
}

/**
 * Determine the next state for ERROR action.
 */
function applyError(state: NfcState, error: NfcError | PayloadError): NfcState {
  if (!ACTIVE_PHASES.has(state.phase)) return state;
  const tamperDetected = "tamperDetected" in error && error.tamperDetected === true;
  return { ...state, phase: "error", error, tamperDetected };
}

// ============================================================================
// Reducer
// ============================================================================

/**
 * NFC state machine reducer.
 *
 * Handles state transitions based on dispatched actions.
 * Enforces valid phase transitions and handles cancel/reset from any state.
 *
 * State transitions:
 * - idle → scanning: START_SCAN
 * - scanning → classifying: RAW_SCAN_COMPLETE
 * - scanning → error: ERROR
 * - classifying → validating: CLASSIFICATION_COMPLETE (classification = "valid_payload")
 * - classifying → ready: CLASSIFICATION_COMPLETE (classification != "valid_payload")
 * - classifying → error: ERROR
 * - validating → ready: VALIDATION_COMPLETE
 * - validating → error: ERROR (tamper detected)
 * - ready → writing: START_WRITE
 * - ready → idle: RESET
 * - writing → success: WRITE_COMPLETE
 * - writing → write_pending_retry: WRITE_PENDING_RETRY (write failed, tap again)
 * - writing → error: ERROR
 * - write_pending_retry → writing: START_WRITE (user tapped card again)
 * - write_pending_retry → idle: CANCEL / RESET
 * - success → idle: RESET
 * - error → idle: RESET
 * - any active phase → idle: CANCEL
 *
 * @see Requirements 9.1, 19.1, 19.2, 19.3, 19.4
 */
export function nfcReducer(state: NfcState, action: NfcAction): NfcState {
  switch (action.type) {
    case "START_SCAN": {
      if (state.phase !== "idle" && state.phase !== "error") return state;
      return { ...initialNfcState, phase: "scanning" };
    }

    case "RAW_SCAN_COMPLETE": {
      if (state.phase !== "scanning") return state;
      return { ...state, phase: "classifying", rawResult: action.result };
    }

    case "CLASSIFICATION_COMPLETE":
      return applyClassificationComplete(state, action.classification);

    case "VALIDATION_COMPLETE":
      return applyValidationComplete(state, action.payload);

    case "START_WRITE": {
      if (state.phase !== "ready" && state.phase !== "write_pending_retry") return state;
      return { ...state, phase: "writing" };
    }

    case "WRITE_PENDING_RETRY": {
      if (state.phase !== "writing") return state;
      return { ...state, phase: "write_pending_retry" };
    }

    case "WRITE_COMPLETE":
      return applyWriteComplete(state, action.payload);

    case "ERROR":
      return applyError(state, action.error);

    case "CANCEL": {
      if (!ACTIVE_PHASES.has(state.phase)) return state;
      return { ...initialNfcState };
    }

    case "RESET":
      return { ...initialNfcState };

    default:
      return state;
  }
}
