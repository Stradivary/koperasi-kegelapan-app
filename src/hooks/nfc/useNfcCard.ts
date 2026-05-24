import { useState, useCallback, useRef, useEffect } from "react";
import { prepareWrite } from "../../core/nfc/pipelineEngine";
import { isNfcSupported, extractCardBytes, friendlyWriteError } from "../../core/nfc/engine";
import type { CardPayload, SessionGrant } from "../../core/payload/types";
import { decodeAndValidateCard } from "./cardValidation";
import { UNREGISTERED_CARD_MESSAGE } from "./cardValidation";
import { verifyWrittenPayload } from "./writeVerification";
import { recordCardWrite } from "./recordCardWrite";
import {
  saveWriteJournal,
  clearWriteJournal,
  getPendingJournal,
  markJournalRecovering,
  markJournalPending,
  getCardIdHex,
} from "./writeJournal";
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
  // Store bound event handlers so we can remove them from the NDEFReader.
  // Without this, each scan() call leaks the previous reader + closure chain.
  const readingHandlerRef = useRef<((event: NDEFReadingEvent) => void) | null>(null);
  const errorHandlerRef = useRef<((event: NDEFErrorEvent) => void) | null>(null);
  const phaseRef = useRef<NfcCardPhase>("idle");
  const pendingWriteRef = useRef<PendingWrite | null>(null);
  const lastScanTimestamp = useRef<number>(0);
  const lastWriteTimestamp = useRef<number>(0);
  const pendingWriteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postWriteAutoResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grantRef = useRef<SessionGrant | null>(grant);
  grantRef.current = grant;
  // Tracks whether an inline write (write→verify→record) is actively in progress.
  // When true, the reading event handler must NOT process fresh scans to avoid
  // racing with the write pipeline and causing double transaction recordings.
  const inlineWriteInProgressRef = useRef(false);
  // When true, the next scan should skip card validation and directly attempt
  // to write from the persisted write journal (retry after verification failure).
  const journalRetryModeRef = useRef(false);
  // Stores the cardIdHex of the last write attempt for journal lookup during retry.
  const lastWriteCardIdHexRef = useRef<string | null>(null);

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

  // #region Reader cleanup helper
  // Removes event listeners from the current NDEFReader to prevent memory leaks.
  // Each scan() creates a new reader — without removing listeners from the old one,
  // the old reader + its entire closure chain stays in memory indefinitely.
  const cleanupReader = useCallback(() => {
    const reader = readerRef.current as EventTarget | null;
    if (reader) {
      if (readingHandlerRef.current) {
        reader.removeEventListener("reading", readingHandlerRef.current as EventListener);
      }
      if (errorHandlerRef.current) {
        reader.removeEventListener("readingerror", errorHandlerRef.current as EventListener);
      }
    }
    readerRef.current = null;
    readingHandlerRef.current = null;
    errorHandlerRef.current = null;
  }, []);

  // #region Cleanup on unmount

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cleanupReader();
      clearPendingWriteTimeout();
      clearPostWriteAutoReset();
    };
  }, [cleanupReader, clearPendingWriteTimeout, clearPostWriteAutoReset]);

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

    // Clean up previous reader's event listeners to prevent memory leak
    cleanupReader();

    phaseRef.current = "scanning";
    setState({ ...INITIAL_STATE, phase: "scanning" });

    const reader = new NDEFReader();
    readerRef.current = reader;

    // #region Event: reading
    const readingHandler = (event: NDEFReadingEvent) => {
      const phase = phaseRef.current;

      // Rapid-tap debounce: ignore taps within 1s unless writing
      if (phase !== "writing" && Date.now() - lastScanTimestamp.current < 1000) return;

      // Phase guard: only process from idle/error/scanning/writing
      if (phase !== "idle" && phase !== "error" && phase !== "scanning" && phase !== "writing") {
        return;
      }

      // When an inline write is in progress (write→verify→record pipeline running),
      // ignore reading events unless there's a pending deferred write waiting for re-tap.
      // This prevents a race where handleFreshScan reads stale card data and triggers
      // journal recovery, causing double transaction recordings.
      if (phase === "writing" && inlineWriteInProgressRef.current && !pendingWriteRef.current) {
        return;
      }

      if (phase === "scanning" || phase === "writing") {
        void handleReading(event, signal);
      }
    };
    readingHandlerRef.current = readingHandler;
    reader.addEventListener("reading", readingHandler);

    // #region Event: readingerror
    const errorHandler = (event: NDEFErrorEvent) => {
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
    };
    errorHandlerRef.current = errorHandler;
    reader.addEventListener("readingerror", errorHandler);

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
      inlineWriteInProgressRef.current = true;
      setState((s) => ({
        ...s,
        phase: "writing",
        payload: pending.currentPayload,
        serialNumber: pending.serialNumber,
      }));

      try {
        const currentReader = readerRef.current;
        if (currentReader && !writeSignal.aborted) {
          await performWriteVerifyRecord(currentReader, pending, writeSignal);
          inlineWriteInProgressRef.current = false;
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
        } else {
          inlineWriteInProgressRef.current = false;
        }
      } catch (e) {
        if (writeSignal.aborted) {
          inlineWriteInProgressRef.current = false;
          return;
        }
        inlineWriteInProgressRef.current = false;
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

      // Journal retry mode: skip full validation and directly attempt journal write.
      // Used when "Coba Lagi" is pressed after a write/verification failure.
      if (journalRetryModeRef.current) {
        journalRetryModeRef.current = false;
        try {
          // Minimal decode to get cardIdHex — no full validation
          const minimalResult = await decodeAndValidateCard(
            raw,
            currentGrant,
            event.serialNumber,
            true, // lenient — skip strict checks
            readSignal,
          );
          if (readSignal.aborted) return;

          const payload = minimalResult.payload;
          if (payload) {
            const cardIdHex = getCardIdHex(payload);
            const journal = await getPendingJournal(tenantId, cardIdHex);

            if (journal) {
              await handleJournalRecovery(journal, cardIdHex, event.serialNumber, readSignal);
              return;
            }
          }
          // No journal found — fall through to normal ready state
          if (minimalResult.phase === "ready") {
            phaseRef.current = "ready";
            setState({
              phase: "ready",
              payload: minimalResult.payload,
              serialNumber: event.serialNumber,
              error: null,
              tamperDetected: false,
              warning: minimalResult.warning,
            });
          } else {
            phaseRef.current = "error";
            setState((s) => ({
              ...s,
              phase: "error",
              error: minimalResult.error ?? "Gagal membaca kartu",
              tamperDetected: minimalResult.tamperDetected,
            }));
          }
          return;
        } catch {
          if (readSignal.aborted) return;
          handlePostWriteReadError();
          return;
        }
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

        // Check for pending write journal — attempt recovery if needed
        if (result.phase === "ready" && result.payload) {
          const cardIdHex = getCardIdHex(result.payload);
          const journal = await getPendingJournal(tenantId, cardIdHex);

          if (journal) {
            const cardCounter = result.payload.wallet.counter;
            const expectedCounter = journal.expectedPayload.wallet.counter;

            if (cardCounter < expectedCounter) {
              // Write didn't land — trigger recovery write
              await handleJournalRecovery(journal, cardIdHex, event.serialNumber, readSignal);
              return;
            } else {
              // Write landed but verify/record failed last time — clear journal and record
              await clearWriteJournal(tenantId, cardIdHex);
            }
          }
        }

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

    /**
     * Attempt to recover a failed write using the persisted journal entry.
     */
    async function handleJournalRecovery(
      journal: NonNullable<Awaited<ReturnType<typeof getPendingJournal>>>,
      cardIdHex: string,
      serialNumber: string,
      recoverySignal: AbortSignal,
    ) {
      phaseRef.current = "writing";
      inlineWriteInProgressRef.current = true;
      setState((s) => ({
        ...s,
        phase: "writing",
        payload: journal.previousPayload,
        serialNumber,
      }));

      try {
        await markJournalRecovering(tenantId, cardIdHex);

        const currentReader = readerRef.current;
        if (!currentReader || recoverySignal.aborted) {
          inlineWriteInProgressRef.current = false;
          await markJournalPending(tenantId, cardIdHex);
          return;
        }

        // Re-use the stored raw bytes for the write
        const pending: PendingWrite = {
          raw: journal.rawBytes,
          payload: journal.expectedPayload,
          currentPayload: journal.previousPayload,
          updatedPayload: journal.updatedPayload,
          serialNumber,
          operationType: journal.entry.operationType,
        };

        await performWriteVerifyRecord(currentReader, pending, recoverySignal);

        inlineWriteInProgressRef.current = false;
        phaseRef.current = "success";
        setState({
          phase: "success",
          payload: journal.expectedPayload,
          serialNumber,
          error: null,
          tamperDetected: false,
          warning: null,
        });
        lastWriteTimestamp.current = Date.now();
      } catch (e) {
        if (recoverySignal.aborted) {
          inlineWriteInProgressRef.current = false;
          return;
        }
        inlineWriteInProgressRef.current = false;
        await markJournalPending(tenantId, cardIdHex);
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
      const cardName = pending.updatedPayload.identity.name || null;
      await recordCardWrite({
        tenantId,
        terminalId,
        operationType: pending.operationType,
        currentPayload: pending.currentPayload,
        updatedPayload: pending.updatedPayload,
        cardName,
      });

      // 4. Clear write journal — write fully confirmed
      const cardIdHex = getCardIdHex(pending.updatedPayload);
      await clearWriteJournal(tenantId, cardIdHex);
    }
  }, [
    grant,
    tenantId,
    terminalId,
    lenient,
    cleanupReader,
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

        // Persist write-ahead journal BEFORE attempting physical write
        const cardIdHex = getCardIdHex(currentPayload);
        lastWriteCardIdHexRef.current = cardIdHex;
        await saveWriteJournal({
          tenantId,
          cardIdHex,
          serialNumber: currentSerial,
          rawBytes: raw,
          expectedPayload: payload,
          previousPayload: currentPayload,
          updatedPayload,
          operationType,
          terminalId,
        });

        // Attempt immediate write — card is likely still in range
        if (reader && signal && !signal.aborted) {
          inlineWriteInProgressRef.current = true;
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
            inlineWriteInProgressRef.current = false;
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

          const cardName = updatedPayload.identity.name || null;
          await recordCardWrite({
            tenantId,
            terminalId,
            operationType,
            currentPayload,
            updatedPayload,
            cardName,
          });

          // Clear write journal — write fully confirmed
          await clearWriteJournal(tenantId, cardIdHex);

          inlineWriteInProgressRef.current = false;
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
        inlineWriteInProgressRef.current = false;
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
    cleanupReader();

    // Clear persisted write journal when user abandons the operation.
    // Only skip clearing if the write landed but verification failed
    // (WRITE_VERIFICATION_FAILED_MESSAGE) — in that case the journal is
    // still needed for recovery on next scan.
    const cardIdHex = state.payload ? getCardIdHex(state.payload) : lastWriteCardIdHexRef.current;
    if (cardIdHex && phaseRef.current !== "success") {
      const isVerificationFailure =
        phaseRef.current === "error" && state.error === WRITE_VERIFICATION_FAILED_MESSAGE;
      if (!isVerificationFailure) {
        void clearWriteJournal(tenantId, cardIdHex);
      }
    }

    pendingWriteRef.current = null;
    inlineWriteInProgressRef.current = false;
    lastWriteCardIdHexRef.current = null;
    clearPendingWriteTimeout();
    clearPostWriteAutoReset();
    phaseRef.current = "idle";
    setState(INITIAL_STATE);
  }, [
    cleanupReader,
    clearPendingWriteTimeout,
    clearPostWriteAutoReset,
    state.payload,
    state.error,
    tenantId,
  ]);

  // #region Cancel (soft)

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    cleanupReader();

    // Clear persisted write journal on cancel (same logic as reset)
    const cardIdHex = state.payload ? getCardIdHex(state.payload) : lastWriteCardIdHexRef.current;
    if (cardIdHex && phaseRef.current !== "success") {
      const isVerificationFailure =
        phaseRef.current === "error" && state.error === WRITE_VERIFICATION_FAILED_MESSAGE;
      if (!isVerificationFailure) {
        void clearWriteJournal(tenantId, cardIdHex);
      }
    }

    pendingWriteRef.current = null;
    inlineWriteInProgressRef.current = false;
    lastWriteCardIdHexRef.current = null;
    clearPendingWriteTimeout();
    clearPostWriteAutoReset();
    phaseRef.current = "idle";
    setState((s) => ({ ...s, phase: "idle" }));
  }, [
    cleanupReader,
    clearPendingWriteTimeout,
    clearPostWriteAutoReset,
    state.payload,
    state.error,
    tenantId,
  ]);

  // #region Retry from journal (skip validation)

  const retryScan = useCallback(async () => {
    // Load the journal and set it as a pending write so that the next tap
    // triggers completePendingWrite directly (writes without reading card data).
    // This avoids "tidak terdaftar" errors when the card is moved too fast.
    const cardIdHex = lastWriteCardIdHexRef.current;
    if (cardIdHex) {
      const journal = await getPendingJournal(tenantId, cardIdHex);
      if (journal) {
        pendingWriteRef.current = {
          raw: journal.rawBytes,
          payload: journal.expectedPayload,
          currentPayload: journal.previousPayload,
          updatedPayload: journal.updatedPayload,
          serialNumber: journal.entry.serialNumber,
          operationType: journal.entry.operationType,
        };
      }
    }
    journalRetryModeRef.current = true;
    await scan();
  }, [scan, tenantId]);

  return { state, scan, write, reset, cancel, retryScan };
}
