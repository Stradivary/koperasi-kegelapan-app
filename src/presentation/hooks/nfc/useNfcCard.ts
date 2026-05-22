import { useState, useCallback, useRef, useEffect } from "react";
import { prepareWrite } from "#/domain/nfc/pipelineEngine";
import { isNfcSupported, extractCardBytes, friendlyWriteError } from "#/domain/nfc/engine";
import type { CardPayload, SessionGrant } from "#/domain/payload/types";
import { decodeAndValidateCard } from "./cardValidation";
import { UNREGISTERED_CARD_MESSAGE } from "./cardValidation";
import { verifyWrittenPayload } from "./writeVerification";
import { recordCardWrite } from "./recordCardWrite";
import {
  WRITE_VERIFICATION_FAILED_MESSAGE,
  POST_WRITE_AUTO_RESET_MS,
  PENDING_WRITE_TIMEOUT_MS,
  INITIAL_STATE,
} from "./types";
import type { NfcCardPhase, NfcCardState, PendingWrite, UseNfcCardOptions } from "./types";

// Re-export public types for consumers
export type { NfcCardPhase, NfcCardState, UseNfcCardOptions } from "./types";

// #region Hook

export function useNfcCard(
  grant: SessionGrant | null,
  tenantId: string,
  terminalId: number,
  options?: UseNfcCardOptions,
) {
  const lenient = options?.lenient ?? false;
  const [state, setState] = useState<NfcCardState>(INITIAL_STATE);

  // #region Refs
  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<NDEFReader | null>(null);
  const phaseRef = useRef<NfcCardPhase>("idle");
  const pendingWriteRef = useRef<PendingWrite | null>(null);
  const lastScanTimestamp = useRef<number>(0);
  const lastWriteTimestamp = useRef<number>(0);
  const pendingWriteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postWriteAutoResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grantRef = useRef<SessionGrant | null>(grant);
  grantRef.current = grant;

  // #region Timer helpers

  const clearPendingWriteTimeout = useCallback(() => {
    if (pendingWriteTimeoutRef.current) {
      clearTimeout(pendingWriteTimeoutRef.current);
      pendingWriteTimeoutRef.current = null;
    }
  }, []);

  const clearPostWriteAutoReset = useCallback(() => {
    if (postWriteAutoResetRef.current) {
      clearTimeout(postWriteAutoResetRef.current);
      postWriteAutoResetRef.current = null;
    }
  }, []);

  const scheduleAutoReset = useCallback(() => {
    clearPostWriteAutoReset();
    postWriteAutoResetRef.current = setTimeout(() => {
      phaseRef.current = "idle";
      setState(INITIAL_STATE);
    }, POST_WRITE_AUTO_RESET_MS);
  }, [clearPostWriteAutoReset]);

  const startPendingWriteTimeout = useCallback(() => {
    clearPendingWriteTimeout();
    pendingWriteTimeoutRef.current = setTimeout(() => {
      pendingWriteRef.current = null;
      phaseRef.current = "error";
      setState((s) => ({
        ...s,
        phase: "error",
        error: "Operasi tidak selesai. Silakan tap ulang kartu.",
        tamperDetected: false,
      }));
      scheduleAutoReset();
    }, PENDING_WRITE_TIMEOUT_MS);
  }, [clearPendingWriteTimeout, scheduleAutoReset]);

  // #region Cleanup on unmount

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearPendingWriteTimeout();
      clearPostWriteAutoReset();
    };
  }, [clearPendingWriteTimeout, clearPostWriteAutoReset]);

  // #region Scan

  const scan = useCallback(async () => {
    if (!grant) {
      setState((s) => ({ ...s, phase: "error", error: "No active session grant" }));
      return;
    }
    if (!isNfcSupported()) {
      setState((s) => ({ ...s, phase: "error", error: "NFC not supported on this device" }));
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    clearPostWriteAutoReset();
    if (!pendingWriteRef.current) clearPendingWriteTimeout();

    phaseRef.current = "scanning";
    setState({ ...INITIAL_STATE, phase: "scanning" });

    const reader = new NDEFReader();
    readerRef.current = reader;

    // #region Event: reading
    reader.addEventListener("reading", (event: NDEFReadingEvent) => {
      const phase = phaseRef.current;

      // Rapid-tap debounce: ignore taps within 1s unless writing
      if (phase !== "writing" && Date.now() - lastScanTimestamp.current < 1000) return;

      // Phase guard: only process from idle/error/scanning/writing
      if (phase !== "idle" && phase !== "error" && phase !== "scanning" && phase !== "writing") {
        return;
      }

      if (phase === "scanning" || phase === "writing") {
        void handleReading(event, signal);
      }
    });

    // #region Event: readingerror
    reader.addEventListener("readingerror", (event: NDEFErrorEvent) => {
      if (phaseRef.current !== "scanning" && phaseRef.current !== "validating") return;

      const err = event.error;
      let msg = "Gagal membaca kartu NFC";
      if (err) {
        const lower = err.message.toLowerCase();
        if (lower.includes("not ndef") || lower.includes("ndef")) {
          msg = "Kartu tidak memiliki data NDEF. Pastikan kartu sudah ditulis terlebih dahulu.";
        } else if (err.name !== "AbortError") {
          msg = err.message;
        }
      }

      phaseRef.current = "error";
      setState((s) => ({ ...s, phase: "error", error: msg, tamperDetected: false }));
    });

    // #region Start scan
    reader.scan({ signal }).catch((e: Error) => {
      if (!signal.aborted) {
        phaseRef.current = "error";
        setState((s) => ({ ...s, phase: "error", error: e.message }));
      }
    });

    // #region Reading handler (closure over signal)

    async function handleReading(event: NDEFReadingEvent, readSignal: AbortSignal) {
      lastScanTimestamp.current = Date.now();

      // #region Pending write: re-tap to complete deferred write
      const pending = pendingWriteRef.current;
      if (pending) {
        const scannedSerial = event.serialNumber;
        if (scannedSerial && pending.serialNumber && scannedSerial === pending.serialNumber) {
          await completePendingWrite(pending, readSignal);
          return;
        }
        // Different card — discard pending and proceed with fresh scan
        pendingWriteRef.current = null;
        clearPendingWriteTimeout();
      }

      // #region Fresh scan: decode and validate
      await handleFreshScan(event, readSignal);
    }

    async function completePendingWrite(pending: PendingWrite, writeSignal: AbortSignal) {
      pendingWriteRef.current = null;
      clearPendingWriteTimeout();
      phaseRef.current = "writing";
      setState((s) => ({ ...s, phase: "writing" }));

      try {
        const currentReader = readerRef.current;
        if (currentReader && !writeSignal.aborted) {
          await performWriteVerifyRecord(currentReader, pending, writeSignal);
          phaseRef.current = "success";
          setState({
            phase: "success",
            payload: pending.payload,
            serialNumber: pending.serialNumber,
            error: null,
            tamperDetected: false,
            warning: null,
          });
          lastWriteTimestamp.current = Date.now();
        }
      } catch (e) {
        if (writeSignal.aborted) return;
        phaseRef.current = "error";
        setState((s) => ({
          ...s,
          phase: "error",
          error:
            e instanceof Error && e.message === WRITE_VERIFICATION_FAILED_MESSAGE
              ? WRITE_VERIFICATION_FAILED_MESSAGE
              : friendlyWriteError(e),
        }));
      }
    }

    async function handleFreshScan(event: NDEFReadingEvent, readSignal: AbortSignal) {
      phaseRef.current = "validating";
      setState((s) => ({ ...s, phase: "validating" }));

      const raw = extractCardBytes(event.message);
      if (!raw) {
        handlePostWriteReadError();
        return;
      }

      const currentGrant = grantRef.current;
      if (!currentGrant) {
        phaseRef.current = "error";
        setState((s) => ({ ...s, phase: "error", error: "Session grant expired" }));
        return;
      }

      try {
        const result = await decodeAndValidateCard(
          raw,
          currentGrant,
          event.serialNumber,
          lenient,
          readSignal,
        );
        if (readSignal.aborted) return;

        phaseRef.current = result.phase;
        if (result.phase === "ready") {
          setState({
            phase: "ready",
            payload: result.payload,
            serialNumber: event.serialNumber,
            error: null,
            tamperDetected: false,
            warning: result.warning,
          });
        } else {
          setState((s) => ({
            ...s,
            phase: "error",
            payload: result.payload ?? s.payload,
            error: result.error,
            tamperDetected: result.tamperDetected,
            warning: null,
          }));
        }
      } catch {
        if (readSignal.aborted) return;
        handlePostWriteReadError();
      }
    }

    function handlePostWriteReadError() {
      const timeSinceWrite = Date.now() - lastWriteTimestamp.current;
      const isPostWrite = timeSinceWrite < 10_000 && lastWriteTimestamp.current > 0;

      phaseRef.current = "error";
      setState((s) => ({
        ...s,
        phase: "error",
        payload: null,
        error: isPostWrite ? "Lepas kartu sebentar lalu tap ulang" : UNREGISTERED_CARD_MESSAGE,
        tamperDetected: false,
      }));

      if (isPostWrite) scheduleAutoReset();
    }

    /**
     * Write → Verify → Record pipeline.
     * Retries the write once on I/O error (card briefly lost contact).
     */
    async function performWriteVerifyRecord(
      targetReader: NDEFReader,
      pending: PendingWrite,
      writeSignal: AbortSignal,
    ): Promise<void> {
      const writeMessage: NDEFMessageInit = {
        records: [
          {
            recordType: "unknown",
            data: pending.raw.buffer.slice(
              pending.raw.byteOffset,
              pending.raw.byteOffset + pending.raw.byteLength,
            ) as ArrayBuffer,
          },
        ],
      };

      // 1. Write to card (retry once on I/O error)
      try {
        await targetReader.write(writeMessage, { signal: writeSignal, overwrite: true });
      } catch (firstWriteError) {
        if (writeSignal.aborted) throw firstWriteError;
        const isRetryable =
          firstWriteError instanceof DOMException &&
          firstWriteError.name !== "AbortError" &&
          firstWriteError.name !== "NotSupportedError";
        if (!isRetryable) throw firstWriteError;

        await new Promise((resolve) => setTimeout(resolve, 200));
        if (writeSignal.aborted) throw firstWriteError;
        await targetReader.write(writeMessage, { signal: writeSignal, overwrite: true });
      }

      // 2. Verify written data
      const currentGrant = grantRef.current;
      if (!currentGrant) throw new Error("Session grant expired during write");
      await verifyWrittenPayload(pending.payload, currentGrant);

      // 3. Record AFTER successful verification (no phantom transactions)
      await recordCardWrite({
        tenantId,
        terminalId,
        operationType: pending.operationType,
        currentPayload: pending.currentPayload,
        updatedPayload: pending.updatedPayload,
      });
    }
  }, [
    grant,
    tenantId,
    terminalId,
    lenient,
    clearPendingWriteTimeout,
    clearPostWriteAutoReset,
    scheduleAutoReset,
  ]);

  // #region Write

  const write = useCallback(
    async (updatedPayload: CardPayload, operationType: string = "debit"): Promise<boolean> => {
      const currentGrant = grantRef.current;
      if (!currentGrant || !state.payload) return false;

      const currentPayload = state.payload;
      const currentSerial = state.serialNumber;
      const reader = readerRef.current;
      const signal = abortRef.current?.signal;

      phaseRef.current = "writing";
      setState((s) => ({ ...s, phase: "writing" }));

      try {
        const { bytes: raw, payload } = await prepareWrite(
          currentPayload,
          updatedPayload,
          currentGrant,
        );

        // Attempt immediate write — card is likely still in range
        if (reader && signal && !signal.aborted) {
          try {
            await reader.write(
              {
                records: [
                  {
                    recordType: "unknown",
                    data: raw.buffer.slice(
                      raw.byteOffset,
                      raw.byteOffset + raw.byteLength,
                    ) as ArrayBuffer,
                  },
                ],
              },
              { signal, overwrite: true },
            );
          } catch {
            // Write I/O failed (card removed too fast) — fall back to re-tap below
            pendingWriteRef.current = {
              raw,
              payload,
              currentPayload,
              updatedPayload,
              serialNumber: currentSerial,
              operationType,
            };
            startPendingWriteTimeout();
            return true;
          }

          // Write succeeded — verify and record (errors here are real failures)
          await verifyWrittenPayload(payload, currentGrant);

          await recordCardWrite({
            tenantId,
            terminalId,
            operationType,
            currentPayload,
            updatedPayload,
          });

          phaseRef.current = "success";
          setState({
            phase: "success",
            payload,
            serialNumber: currentSerial,
            error: null,
            tamperDetected: false,
            warning: null,
          });
          lastWriteTimestamp.current = Date.now();
          return true;
        }

        // Fallback: store pending write and wait for next tap
        pendingWriteRef.current = {
          raw,
          payload,
          currentPayload,
          updatedPayload,
          serialNumber: currentSerial,
          operationType,
        };
        startPendingWriteTimeout();
        return true;
      } catch (e) {
        phaseRef.current = "error";
        setState((s) => ({
          ...s,
          phase: "error",
          error:
            e instanceof Error && e.message === WRITE_VERIFICATION_FAILED_MESSAGE
              ? WRITE_VERIFICATION_FAILED_MESSAGE
              : friendlyWriteError(e),
        }));
        return false;
      }
    },
    [state.payload, state.serialNumber, tenantId, terminalId, startPendingWriteTimeout],
  );

  // #region Reset (full)

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    readerRef.current = null;
    pendingWriteRef.current = null;
    clearPendingWriteTimeout();
    clearPostWriteAutoReset();
    phaseRef.current = "idle";
    setState(INITIAL_STATE);
  }, [clearPendingWriteTimeout, clearPostWriteAutoReset]);

  // #region Cancel (soft)

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    readerRef.current = null;
    pendingWriteRef.current = null;
    clearPendingWriteTimeout();
    clearPostWriteAutoReset();
    phaseRef.current = "idle";
    setState((s) => ({ ...s, phase: "idle" }));
  }, [clearPendingWriteTimeout, clearPostWriteAutoReset]);

  return { state, scan, write, reset, cancel };
}
