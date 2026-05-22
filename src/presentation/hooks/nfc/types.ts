import type { CardPayload } from "#/domain/payload/types";

// ─── Constants ───────────────────────────────────────────────────────────────

export const WRITE_VERIFICATION_FAILED_MESSAGE = "Gagal menulis kartu";
export const VERIFICATION_TIMEOUT_MS = 2500;
export const MAX_VERIFICATION_RETRIES = 1;
export const POST_WRITE_AUTO_RESET_MS = 5000;
export const PENDING_WRITE_TIMEOUT_MS = 30_000;

// ─── Phase & State ───────────────────────────────────────────────────────────

export type NfcCardPhase =
  | "idle"
  | "scanning"
  | "validating"
  | "ready"
  | "writing"
  | "success"
  | "error";

export interface NfcCardState {
  phase: NfcCardPhase;
  payload: CardPayload | null;
  serialNumber: string | null;
  error: string | null;
  tamperDetected: boolean;
  /** Non-blocking warning (e.g. tenant mismatch in lenient mode) */
  warning: string | null;
}

export const INITIAL_STATE: NfcCardState = {
  phase: "idle",
  payload: null,
  serialNumber: null,
  error: null,
  tamperDetected: false,
  warning: null,
};

// ─── Internal types ──────────────────────────────────────────────────────────

export interface PendingWrite {
  raw: Uint8Array;
  payload: CardPayload;
  currentPayload: CardPayload;
  updatedPayload: CardPayload;
  serialNumber: string | null;
  operationType: string;
}

export interface UseNfcCardOptions {
  /**
   * When true, validation failures that don't indicate tampering (e.g. tenant mismatch,
   * key version mismatch) will result in "ready" state with a warning instead of "error".
   * This allows scout/inspection modes to view card content even for unregistered cards.
   */
  lenient?: boolean;
}

export interface CardValidationResult {
  phase: "ready" | "error";
  payload: CardPayload | null;
  error: string | null;
  tamperDetected: boolean;
  warning: string | null;
}
