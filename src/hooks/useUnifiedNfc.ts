/**
 * Unified NFC Hook
 *
 * Integrates the GenericNfcLayer and pipelineEngine to provide a complete
 * NFC scanning and writing experience with state machine management.
 *
 * Supports two scan modes:
 * - "raw": Only uses GenericNfcLayer for basic scanning without payload processing
 * - "payload": Uses both layers with full decryption, validation, and write support
 *
 * @module hooks/useUnifiedNfc
 * @see Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 18.3, 19.3
 */

import { useCallback, useMemo, useReducer, useRef } from "react";

import type { NfcAdapter, NfcError } from "../core/nfc/adapters/types";
import { GenericNfcLayer } from "../core/nfc/genericNfcLayer";
import type { PayloadError } from "../core/nfc/payloadTypes";
import { prepareWrite, commitWrite, readAndValidateCard } from "../core/nfc/pipelineEngine";
import { validateSession } from "../core/nfc/sessionValidator";
import { nfcReducer, initialNfcState, type NfcState } from "../core/nfc/stateMachine";
import type { RawNfcResult } from "../core/nfc/types";
import type { CardPayload, SessionGrant } from "../core/payload/types";

// ============================================================================
// Types
// ============================================================================

export interface UseUnifiedNfcOptions {
  sessionGrant: SessionGrant | null;
  tenantId: string;
  terminalId: number;
  scanMode?: "raw" | "payload";
  adapter?: NfcAdapter;
  onRawScan?: (result: RawNfcResult) => void;
  onCardRead?: (payload: CardPayload, result: RawNfcResult) => void;
  onWriteSuccess?: (payload: CardPayload) => void;
  onError?: (error: NfcError | PayloadError) => void;
}

export interface UseUnifiedNfcReturn {
  /** Current NFC state */
  state: NfcState;
  /** Whether NFC is supported on this device */
  isNfcSupported: boolean;

  /** Start scanning for NFC tags */
  scan: () => Promise<void>;
  /** Write an updated payload to the current card */
  write: (updatedPayload: CardPayload) => Promise<boolean>;
  /** Retry a failed write (tap card again with stored bytes) */
  retryWrite: () => Promise<boolean>;
  /** Whether there is a pending write waiting for retry */
  hasPendingWrite: boolean;
  /** Reset the scanner to idle state */
  reset: () => void;
  /** Cancel the current operation */
  cancel: () => void;

  /** The GenericNfcLayer instance (for advanced usage) */
  genericLayer: GenericNfcLayer;
  /** Whether payload operations are available (scanMode=payload + valid session) */
  payloadLayer: object | null;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Unified NFC hook that integrates GenericNfcLayer and pipelineEngine.
 *
 * @param options - Configuration options for the hook
 * @returns Hook return value with state, actions, and layer references
 *
 * @example
 * ```tsx
 * const { state, scan, write, reset, cancel, isNfcSupported } = useUnifiedNfc({
 *   sessionGrant: grant,
 *   tenantId: "tenant-1",
 *   terminalId: 1,
 *   scanMode: "payload",
 *   onCardRead: (payload) => console.log("Card read:", payload),
 * });
 * ```
 */
export function useUnifiedNfc(options: UseUnifiedNfcOptions): UseUnifiedNfcReturn {
  const {
    sessionGrant,
    tenantId,
    terminalId: _terminalId,
    scanMode = "payload",
    adapter,
    onRawScan,
    onCardRead,
    onWriteSuccess,
    onError,
  } = options;

  const [state, dispatch] = useReducer(nfcReducer, initialNfcState);

  // Keep a ref to the GenericNfcLayer so it persists across renders
  const layerRef = useRef<GenericNfcLayer | null>(null);
  if (!layerRef.current) {
    layerRef.current = new GenericNfcLayer({ adapter });
  }
  const genericLayer = layerRef.current;

  // AbortController ref for cancelling operations
  const abortRef = useRef<AbortController | null>(null);

  // Store latest callbacks in refs to avoid stale closures
  const onRawScanRef = useRef(onRawScan);
  onRawScanRef.current = onRawScan;
  const onCardReadRef = useRef(onCardRead);
  onCardReadRef.current = onCardRead;
  const onWriteSuccessRef = useRef(onWriteSuccess);
  onWriteSuccessRef.current = onWriteSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const sessionGrantRef = useRef(sessionGrant);
  sessionGrantRef.current = sessionGrant;
  const tenantIdRef = useRef(tenantId);
  tenantIdRef.current = tenantId;
  const scanModeRef = useRef(scanMode);
  scanModeRef.current = scanMode;

  // Store current raw result for write operations
  const rawResultRef = useRef<RawNfcResult | null>(null);

  // Pending write storage for retry on failed NFC writes
  const pendingWriteRef = useRef<{ bytes: Uint8Array; payload: CardPayload } | null>(null);
  const pendingWriteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup pending write timeout
  const clearPendingWriteTimeout = useCallback(() => {
    if (pendingWriteTimeoutRef.current) {
      clearTimeout(pendingWriteTimeoutRef.current);
      pendingWriteTimeoutRef.current = null;
    }
  }, []);

  // ============================================================================
  // isNfcSupported
  // ============================================================================

  const isNfcSupported = useMemo(() => genericLayer.isSupported(), [genericLayer]);

  // ============================================================================
  // scan()
  // ============================================================================

  const scan = useCallback(async () => {
    // Abort any previous operation
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    // Dispatch START_SCAN
    dispatch({ type: "START_SCAN" });

    try {
      // Perform the raw scan via GenericNfcLayer
      const result = await genericLayer.scan(signal);

      if (signal.aborted) return;

      // Dispatch RAW_SCAN_COMPLETE
      dispatch({ type: "RAW_SCAN_COMPLETE", result });
      rawResultRef.current = result;

      // Fire onRawScan callback
      onRawScanRef.current?.(result);

      // Classify the card
      const classification = result.classification;
      dispatch({ type: "CLASSIFICATION_COMPLETE", classification });

      // If valid_payload and scanMode is "payload", validate/decrypt
      if (classification === "valid_payload" && scanModeRef.current === "payload") {
        // Validate session before payload operations
        const sessionValidation = validateSession(sessionGrantRef.current, tenantIdRef.current);

        if (!sessionValidation.valid) {
          const payloadError: PayloadError = {
            code: sessionValidation.errorCode ?? "NO_SESSION",
            message: sessionValidation.error ?? "Sesi tidak aktif",
            tamperDetected: false,
            recoverable: sessionValidation.errorCode === "SESSION_EXPIRED",
          };
          dispatch({ type: "ERROR", error: payloadError });
          onErrorRef.current?.(payloadError);
          return;
        }

        // Use pipelineEngine to read and validate the card
        const pipelineResult = await readAndValidateCard(signal, sessionGrantRef.current!);

        if (signal.aborted) return;

        if (!pipelineResult.ok) {
          const payloadError: PayloadError = {
            code: pipelineResult.tamper ? "VALIDATION_FAILED" : "DECRYPTION_FAILED",
            message: pipelineResult.error,
            tamperDetected: pipelineResult.tamper ?? false,
            recoverable: false,
          };
          dispatch({ type: "ERROR", error: payloadError });
          onErrorRef.current?.(payloadError);
          return;
        }

        // Dispatch VALIDATION_COMPLETE with the decoded payload
        dispatch({ type: "VALIDATION_COMPLETE", payload: pipelineResult.payload });
        onCardReadRef.current?.(pipelineResult.payload, result);
      }
      // For non-payload classifications or raw mode, the state machine
      // already transitioned to "ready" via CLASSIFICATION_COMPLETE
    } catch (e) {
      if (signal.aborted) return;

      const nfcError: NfcError = {
        code: "SCAN_FAILED",
        message: e instanceof Error ? e.message : String(e),
        recoverable: true,
      };
      dispatch({ type: "ERROR", error: nfcError });
      onErrorRef.current?.(nfcError);
    }
  }, [genericLayer]);

  // ============================================================================
  // write()
  // ============================================================================

  const write = useCallback(
    async (updatedPayload: CardPayload): Promise<boolean> => {
      const grant = sessionGrantRef.current;
      if (!grant || !state.payload) return false;

      // Abort any previous operation
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      dispatch({ type: "START_WRITE" });

      try {
        // Prepare the write using pipelineEngine
        const { bytes, payload: signedPayload } = await prepareWrite(
          state.payload,
          updatedPayload,
          grant,
        );

        if (signal.aborted) return false;

        // Store the prepared write for potential retry
        pendingWriteRef.current = { bytes, payload: signedPayload };

        // Commit the write via pipelineEngine (which uses the NFC engine)
        const writeResult = await commitWrite(bytes, signedPayload, signal);

        if (signal.aborted) return false;

        if (!writeResult.ok) {
          // Write failed (likely card moved too fast) — transition to retry state
          // The prepared bytes are still valid in memory, user can tap again
          dispatch({ type: "WRITE_PENDING_RETRY" });

          // Start 30-second timeout — after which we discard and go to error
          clearPendingWriteTimeout();
          pendingWriteTimeoutRef.current = setTimeout(() => {
            pendingWriteRef.current = null;
            const payloadError: PayloadError = {
              code: "WRITE_FAILED",
              message: "Waktu habis. Penulisan kartu dibatalkan.",
              tamperDetected: false,
              recoverable: true,
            };
            dispatch({ type: "ERROR", error: payloadError });
            onErrorRef.current?.(payloadError);
          }, 30_000);

          return false;
        }

        // Write succeeded — clear pending write
        pendingWriteRef.current = null;
        clearPendingWriteTimeout();

        // Dispatch WRITE_COMPLETE
        dispatch({ type: "WRITE_COMPLETE", payload: writeResult.payload });
        onWriteSuccessRef.current?.(writeResult.payload);
        return true;
      } catch (e) {
        if (signal.aborted) return false;

        const payloadError: PayloadError = {
          code: "WRITE_FAILED",
          message: e instanceof Error ? e.message : String(e),
          tamperDetected: false,
          recoverable: true,
        };
        dispatch({ type: "ERROR", error: payloadError });
        onErrorRef.current?.(payloadError);
        return false;
      }
    },
    [state.payload, clearPendingWriteTimeout],
  );

  // ============================================================================
  // retryWrite() — retry a failed write by tapping the card again
  // ============================================================================

  const retryWrite = useCallback(async (): Promise<boolean> => {
    const pending = pendingWriteRef.current;
    if (!pending) return false;

    // Clear the 30-second timeout FIRST so it doesn't fire ERROR mid-write
    // while NDEFReader.write() is waiting for the card to be tapped
    clearPendingWriteTimeout();

    // Abort any previous operation
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    dispatch({ type: "START_WRITE" });

    try {
      // Retry the commit with the stored bytes (NDEFReader.write waits for card tap)
      const writeResult = await commitWrite(pending.bytes, pending.payload, signal);

      if (signal.aborted) return false;

      if (!writeResult.ok) {
        // Still failing — go back to retry state with a fresh timeout
        dispatch({ type: "WRITE_PENDING_RETRY" });
        pendingWriteTimeoutRef.current = setTimeout(() => {
          pendingWriteRef.current = null;
          const payloadError: PayloadError = {
            code: "WRITE_FAILED",
            message: "Waktu habis. Penulisan kartu dibatalkan.",
            tamperDetected: false,
            recoverable: true,
          };
          dispatch({ type: "ERROR", error: payloadError });
          onErrorRef.current?.(payloadError);
        }, 30_000);
        return false;
      }

      // Write succeeded — clear pending write
      pendingWriteRef.current = null;

      // Dispatch WRITE_COMPLETE
      dispatch({ type: "WRITE_COMPLETE", payload: writeResult.payload });
      onWriteSuccessRef.current?.(writeResult.payload);
      return true;
    } catch {
      if (signal.aborted) return false;

      // Go back to retry state with a fresh timeout so user can try again
      dispatch({ type: "WRITE_PENDING_RETRY" });
      pendingWriteTimeoutRef.current = setTimeout(() => {
        pendingWriteRef.current = null;
        const payloadError: PayloadError = {
          code: "WRITE_FAILED",
          message: "Waktu habis. Penulisan kartu dibatalkan.",
          tamperDetected: false,
          recoverable: true,
        };
        dispatch({ type: "ERROR", error: payloadError });
        onErrorRef.current?.(payloadError);
      }, 30_000);
      return false;
    }
  }, [clearPendingWriteTimeout]);

  // ============================================================================
  // reset()
  // ============================================================================

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    rawResultRef.current = null;
    pendingWriteRef.current = null;
    clearPendingWriteTimeout();
    dispatch({ type: "RESET" });
  }, [clearPendingWriteTimeout]);

  // ============================================================================
  // cancel()
  // ============================================================================

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    genericLayer.abort();
    pendingWriteRef.current = null;
    clearPendingWriteTimeout();
    dispatch({ type: "CANCEL" });
  }, [genericLayer, clearPendingWriteTimeout]);

  // ============================================================================
  // payloadLayer (functional reference for advanced usage)
  // ============================================================================

  const payloadLayer = useMemo(() => {
    if (scanMode === "payload" && sessionGrant) {
      // Return a reference object indicating payload operations are available
      return { readAndValidateCard, prepareWrite, commitWrite, validateSession };
    }
    return null;
  }, [scanMode, sessionGrant]);

  return {
    state,
    isNfcSupported,
    scan,
    write,
    retryWrite,
    hasPendingWrite: pendingWriteRef.current !== null,
    reset,
    cancel,
    genericLayer,
    payloadLayer,
  };
}
