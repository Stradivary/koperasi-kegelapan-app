import { useState, useCallback, useRef, useEffect } from "react";
import {
  validateCard,
  prepareWrite,
  decryptCardBody,
  TENANT_MISMATCH_REASON,
  UNREGISTERED_CARD_MESSAGE,
} from "../core/nfc/pipelineEngine";
import { isNfcSupported, extractCardBytes, friendlyWriteError } from "../core/nfc/engine";
import { decodePayload, encodePayloadWire } from "../core/payload/engine";
import { isTenantBindValid } from "../core/payload/tenantBind";
import type { CardPayload, SessionGrant } from "../core/payload/types";
import { BUFFER_SIZE, WIRE_SIZE, TRAILER_COUNTER_BIND } from "../core/payload/types";
import { reconciliationOutbox, makeIdempotencyKey } from "../lib/indexeddb";
import { recordTransaction } from "../lib/transactionLogService";

const WRITE_VERIFICATION_FAILED_MESSAGE = "Gagal menulis kartu";

type TransactionOperationType = "debit" | "credit" | "checkin" | "checkout" | "topup" | "admin";

function arraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

async function decodeCardPayloadForVerification(
  raw: Uint8Array,
  grant: SessionGrant,
): Promise<CardPayload> {
  const version = raw[4];
  let decodableRaw = raw;

  if (version >= 2) {
    const trailerView = new DataView(raw.buffer, raw.byteOffset + BUFFER_SIZE);
    const counterBind = trailerView.getUint32(TRAILER_COUNTER_BIND, true);
    const cardId = raw.slice(6, 12);
    const decryptedBuf = await decryptCardBody(
      raw.slice(0, BUFFER_SIZE),
      grant.sessionKey,
      cardId,
      BigInt(counterBind),
    );
    const full = new Uint8Array(WIRE_SIZE);
    full.set(decryptedBuf, 0);
    full.set(raw.slice(BUFFER_SIZE), BUFFER_SIZE);
    decodableRaw = full;
  }

  return decodePayload(decodableRaw);
}

async function verifyWrittenPayload(
  expectedPayload: CardPayload,
  grant: SessionGrant,
): Promise<void> {
  const verificationAbort = new AbortController();

  return new Promise((resolve, reject) => {
    const verificationReader = new NDEFReader();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(verificationTimeout);
      verificationAbort.abort();
      callback();
    };

    const verificationTimeout = setTimeout(() => {
      finish(() => reject(new Error(WRITE_VERIFICATION_FAILED_MESSAGE)));
    }, 1500);

    verificationReader.addEventListener("reading", (event: NDEFReadingEvent) => {
      void (async () => {
        const raw = extractCardBytes(event.message);
        if (!raw) {
          throw new Error(WRITE_VERIFICATION_FAILED_MESSAGE);
        }

        const actualPayload = await decodeCardPayloadForVerification(raw, grant);
        const payloadMatches = arraysEqual(
          encodePayloadWire(actualPayload),
          encodePayloadWire(expectedPayload),
        );

        if (!payloadMatches) {
          throw new Error(WRITE_VERIFICATION_FAILED_MESSAGE);
        }
      })()
        .then(() => finish(resolve))
        .catch(() => finish(() => reject(new Error(WRITE_VERIFICATION_FAILED_MESSAGE))));
    });

    verificationReader.addEventListener("readingerror", () => {
      finish(() => reject(new Error(WRITE_VERIFICATION_FAILED_MESSAGE)));
    });

    verificationReader.scan({ signal: verificationAbort.signal }).catch(() => {
      if (settled || verificationAbort.signal.aborted) {
        return;
      }
      finish(() => reject(new Error(WRITE_VERIFICATION_FAILED_MESSAGE)));
    });
  });
}

export type NfcCardPhase =
  | "idle"
  | "scanning"
  | "validating"
  | "ready"
  | "writing"
  | "success"
  | "error";

interface CardValidationResult {
  phase: "ready" | "error";
  payload: CardPayload | null;
  error: string | null;
  tamperDetected: boolean;
  warning: string | null;
}

/**
 * Decode and validate a raw NFC card payload.
 * Returns a discriminated result indicating ready or error state.
 */
async function decodeAndValidateCard(
  raw: Uint8Array,
  grant: SessionGrant,
  _serialNumber: string,
  lenient: boolean,
  signal: AbortSignal,
): Promise<CardValidationResult> {
  const version = raw[4];
  let decodableRaw = raw;
  if (version >= 2) {
    const trailerView = new DataView(raw.buffer, raw.byteOffset + BUFFER_SIZE);
    const counterBind = trailerView.getUint32(TRAILER_COUNTER_BIND, true);
    const cardId = raw.slice(6, 12);
    const decryptedBuf = await decryptCardBody(
      raw.slice(0, BUFFER_SIZE),
      grant.sessionKey,
      cardId,
      BigInt(counterBind),
    );
    const full = new Uint8Array(WIRE_SIZE);
    full.set(decryptedBuf, 0);
    full.set(raw.slice(BUFFER_SIZE), BUFFER_SIZE);
    decodableRaw = full;
  }

  const payload = decodePayload(decodableRaw);
  const isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false;

  if (isOffline) {
    if (!isTenantBindValid(payload.header.tenantBind, grant.tenantId)) {
      if (lenient) {
        return {
          phase: "ready",
          payload,
          error: null,
          tamperDetected: false,
          warning: UNREGISTERED_CARD_MESSAGE,
        };
      }
      return {
        phase: "error",
        payload: null,
        error: UNREGISTERED_CARD_MESSAGE,
        tamperDetected: false,
        warning: null,
      };
    }
    return { phase: "ready", payload, error: null, tamperDetected: false, warning: null };
  }

  const validation = await validateCard(payload, raw, grant);
  if (signal.aborted) {
    return { phase: "error", payload: null, error: null, tamperDetected: false, warning: null };
  }

  if (!validation.valid) {
    const isTenantMismatch =
      validation.reason === TENANT_MISMATCH_REASON ||
      validation.reason === UNREGISTERED_CARD_MESSAGE;
    const isTamper = validation.tamper ?? false;

    if (lenient && !isTamper) {
      const warning = isTenantMismatch
        ? UNREGISTERED_CARD_MESSAGE
        : (validation.reason ?? "Validasi gagal");
      return { phase: "ready", payload, error: null, tamperDetected: false, warning };
    }

    const error = isTenantMismatch
      ? UNREGISTERED_CARD_MESSAGE
      : (validation.reason ?? "Validasi gagal");
    return {
      phase: "error",
      payload: isTenantMismatch ? null : payload,
      error,
      tamperDetected: isTamper,
      warning: null,
    };
  }

  return { phase: "ready", payload, error: null, tamperDetected: false, warning: null };
}

export interface NfcCardState {
  phase: NfcCardPhase;
  payload: CardPayload | null;
  serialNumber: string | null;
  error: string | null;
  tamperDetected: boolean;
  /** Non-blocking warning (e.g. tenant mismatch in lenient mode) */
  warning: string | null;
}

interface PendingWrite {
  raw: Uint8Array;
  payload: CardPayload;
  currentPayload: CardPayload;
  updatedPayload: CardPayload;
  serialNumber: string | null;
  operationType: string;
}

interface UseNfcCardOptions {
  /**
   * When true, validation failures that don't indicate tampering (e.g. tenant mismatch,
   * key version mismatch) will result in "ready" state with a warning instead of "error".
   * This allows scout/inspection modes to view card content even for unregistered cards.
   */
  lenient?: boolean;
}

export function useNfcCard(
  grant: SessionGrant | null,
  tenantId: string,
  terminalId: number,
  options?: UseNfcCardOptions,
) {
  const lenient = options?.lenient ?? false;
  const [state, setState] = useState<NfcCardState>({
    phase: "idle",
    payload: null,
    serialNumber: null,
    error: null,
    tamperDetected: false,
    warning: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<NDEFReader | null>(null);
  // phaseRef mirrors state.phase so event handlers always see the current value
  const phaseRef = useRef<NfcCardPhase>("idle");
  const pendingWriteRef = useRef<PendingWrite | null>(null);
  // Rapid-tap debounce: ignore reading events within 1s of the last valid scan
  const lastScanTimestamp = useRef<number>(0);
  // Track last successful write timestamp to distinguish transient read errors from unregistered cards
  const lastWriteTimestamp = useRef<number>(0);
  // Timer for 30-second pending write timeout (Req 9.6)
  const pendingWriteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timer for auto-reset after transient post-write read errors (Req 9.2)
  const postWriteAutoResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to clear pending write timeout
  const clearPendingWriteTimeout = useCallback(() => {
    if (pendingWriteTimeoutRef.current) {
      clearTimeout(pendingWriteTimeoutRef.current);
      pendingWriteTimeoutRef.current = null;
    }
  }, []);

  // Helper to clear post-write auto-reset timer
  const clearPostWriteAutoReset = useCallback(() => {
    if (postWriteAutoResetRef.current) {
      clearTimeout(postWriteAutoResetRef.current);
      postWriteAutoResetRef.current = null;
    }
  }, []);

  // Start 30-second timeout for pending writes (Req 9.6)
  const startPendingWriteTimeout = useCallback(() => {
    clearPendingWriteTimeout();
    pendingWriteTimeoutRef.current = setTimeout(() => {
      // Discard pending write and show error
      pendingWriteRef.current = null;
      phaseRef.current = "error";
      setState((s) => ({
        ...s,
        phase: "error",
        error: "Operasi tidak selesai. Silakan tap ulang kartu.",
        tamperDetected: false,
      }));
      // Auto-reset after 3s (Req 9.2)
      postWriteAutoResetRef.current = setTimeout(() => {
        phaseRef.current = "idle";
        setState({
          phase: "idle",
          payload: null,
          serialNumber: null,
          error: null,
          tamperDetected: false,
          warning: null,
        });
      }, 3000);
    }, 30_000);
  }, [clearPendingWriteTimeout]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearPendingWriteTimeout();
      clearPostWriteAutoReset();
    };
  }, [clearPendingWriteTimeout, clearPostWriteAutoReset]);

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

    // Clear any pending write timeout when starting a fresh scan
    // Note: preserve pendingWriteRef if it has an active timeout — the reading handler
    // will check serial number match on next tap (Req 9.4, 9.5)
    clearPostWriteAutoReset();
    if (!pendingWriteRef.current) {
      clearPendingWriteTimeout();
    }
    phaseRef.current = "scanning";
    setState({
      phase: "scanning",
      payload: null,
      serialNumber: null,
      error: null,
      tamperDetected: false,
      warning: null,
    });

    const reader = new NDEFReader();
    readerRef.current = reader;

    reader.addEventListener("reading", async (event: NDEFReadingEvent) => {
      const phase = phaseRef.current;

      // ── Rapid-tap debounce guard ────────────────────────────────────────────
      // Ignore reading events that arrive within 1s of the last valid scan start,
      // unless we're in the "writing" phase (second tap to confirm write).
      if (phase !== "writing") {
        const now = Date.now();
        if (now - lastScanTimestamp.current < 1000) {
          return; // ignore rapid tap
        }
      }

      // ── Phase guard: prevent re-entry during active processing ──────────────
      // Only allow entry from "idle", "error", "scanning", or "writing" phases.
      // All other phases (validating, ready, success) indicate an active cycle.
      if (phase !== "idle" && phase !== "error" && phase !== "scanning" && phase !== "writing") {
        return; // ignore tap during active processing
      }

      if (phase === "scanning") {
        await handleScanningPhase(event);
        return;
      }

      if (phase === "writing") {
        await handleWritingPhase();
      }
    });

    // ── Scanning phase handler ──────────────────────────────────────────────
    async function handleScanningPhase(event: NDEFReadingEvent) {
      lastScanTimestamp.current = Date.now();

      const pending = pendingWriteRef.current;
      if (pending) {
        const scannedSerial = event.serialNumber;
        if (scannedSerial && pending.serialNumber && scannedSerial === pending.serialNumber) {
          pendingWriteRef.current = null;
          clearPendingWriteTimeout();
          phaseRef.current = "writing";
          setState((s) => ({ ...s, phase: "writing" }));
          try {
            const currentReader = readerRef.current;
            if (currentReader && signal && !signal.aborted) {
              await currentReader.write(
                {
                  records: [
                    {
                      recordType: "unknown",
                      data: pending.raw.buffer.slice(
                        pending.raw.byteOffset,
                        pending.raw.byteOffset + pending.raw.byteLength,
                      ) as ArrayBuffer,
                    },
                  ],
                },
                { signal, overwrite: true },
              );
              const cardIdHex = Array.from(pending.updatedPayload.header.cardId)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
              await reconciliationOutbox.add({
                tenantId,
                terminalId,
                cardId: cardIdHex,
                counter: Number(pending.updatedPayload.wallet.counter),
                type: pending.operationType,
                amount:
                  pending.currentPayload.wallet.balance - pending.updatedPayload.wallet.balance,
                balanceAfter: pending.updatedPayload.wallet.balance,
                timestamp: pending.updatedPayload.wallet.lastTimestamp,
                hash: Array.from(
                  pending.updatedPayload.logEntries.at(-1)?.hash ?? new Uint8Array(6),
                )
                  .map((b) => b.toString(16).padStart(2, "0"))
                  .join(""),
                idempotencyKey: makeIdempotencyKey(
                  tenantId,
                  cardIdHex,
                  Number(pending.updatedPayload.wallet.counter),
                ),
              });
              try {
                await recordTransaction({
                  tenantId,
                  cardId: cardIdHex,
                  userId: pending.updatedPayload.identity.userId
                    ? pending.updatedPayload.identity.userId
                    : null,
                  counter: Number(pending.updatedPayload.wallet.counter),
                  type: pending.operationType as TransactionOperationType,
                  amount: Math.abs(
                    pending.currentPayload.wallet.balance - pending.updatedPayload.wallet.balance,
                  ),
                  balanceAfter: pending.updatedPayload.wallet.balance,
                  timestamp: pending.updatedPayload.wallet.lastTimestamp,
                  hash: Array.from(
                    pending.updatedPayload.logEntries.at(-1)?.hash ?? new Uint8Array(6),
                  )
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join(""),
                  terminalId,
                  deviceId: null,
                });
              } catch {
                /* Non-critical */
              }
              await verifyWrittenPayload(pending.payload, grant!);
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
            if (signal.aborted) return;
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
          return;
        } else {
          pendingWriteRef.current = null;
          clearPendingWriteTimeout();
        }
      }

      phaseRef.current = "validating";
      setState((s) => ({ ...s, phase: "validating" }));

      const raw = extractCardBytes(event.message);
      if (!raw) {
        const timeSinceWrite = Date.now() - lastWriteTimestamp.current;
        const isPostWriteReadError = timeSinceWrite < 10_000 && lastWriteTimestamp.current > 0;
        phaseRef.current = "error";
        setState((s) => ({
          ...s,
          phase: "error",
          payload: null,
          error: isPostWriteReadError
            ? "Lepas kartu sebentar lalu tap ulang"
            : UNREGISTERED_CARD_MESSAGE,
          tamperDetected: false,
        }));
        if (isPostWriteReadError) {
          clearPostWriteAutoReset();
          postWriteAutoResetRef.current = setTimeout(() => {
            phaseRef.current = "idle";
            setState({
              phase: "idle",
              payload: null,
              serialNumber: null,
              error: null,
              tamperDetected: false,
              warning: null,
            });
          }, 3000);
        }
        return;
      }

      try {
        const result = await decodeAndValidateCard(
          raw,
          grant!,
          event.serialNumber,
          lenient,
          signal,
        );
        if (signal.aborted) return;

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
        if (signal.aborted) return;
        const timeSinceWrite = Date.now() - lastWriteTimestamp.current;
        const isPostWriteReadError = timeSinceWrite < 10_000 && lastWriteTimestamp.current > 0;
        phaseRef.current = "error";
        setState((s) => ({
          ...s,
          phase: "error",
          payload: null,
          error: isPostWriteReadError
            ? "Lepas kartu sebentar lalu tap ulang"
            : UNREGISTERED_CARD_MESSAGE,
          tamperDetected: false,
        }));
        if (isPostWriteReadError) {
          clearPostWriteAutoReset();
          postWriteAutoResetRef.current = setTimeout(() => {
            phaseRef.current = "idle";
            setState({
              phase: "idle",
              payload: null,
              serialNumber: null,
              error: null,
              tamperDetected: false,
              warning: null,
            });
          }, 3000);
        }
      }
    }

    // ── Writing phase handler ───────────────────────────────────────────────
    async function handleWritingPhase() {
      const pending = pendingWriteRef.current;
      if (!pending) return;
      pendingWriteRef.current = null;
      clearPendingWriteTimeout();
      try {
        const { raw, currentPayload, updatedPayload, serialNumber } = pending;
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
        const cardIdHex = Array.from(updatedPayload.header.cardId)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        await reconciliationOutbox.add({
          tenantId,
          terminalId,
          cardId: cardIdHex,
          counter: Number(updatedPayload.wallet.counter),
          type: pending.operationType,
          amount: currentPayload.wallet.balance - updatedPayload.wallet.balance,
          balanceAfter: updatedPayload.wallet.balance,
          timestamp: updatedPayload.wallet.lastTimestamp,
          hash: Array.from(updatedPayload.logEntries.at(-1)?.hash ?? new Uint8Array(6))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
          idempotencyKey: makeIdempotencyKey(
            tenantId,
            cardIdHex,
            Number(updatedPayload.wallet.counter),
          ),
        });
        try {
          await recordTransaction({
            tenantId,
            cardId: cardIdHex,
            userId: updatedPayload.identity.userId ? updatedPayload.identity.userId : null,
            counter: Number(updatedPayload.wallet.counter),
            type: pending.operationType as TransactionOperationType,
            amount: Math.abs(currentPayload.wallet.balance - updatedPayload.wallet.balance),
            balanceAfter: updatedPayload.wallet.balance,
            timestamp: updatedPayload.wallet.lastTimestamp,
            hash: Array.from(updatedPayload.logEntries.at(-1)?.hash ?? new Uint8Array(6))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(""),
            terminalId,
            deviceId: null,
          });
        } catch {
          /* Non-critical */
        }
        phaseRef.current = "success";
        setState({
          phase: "success",
          payload: pending.payload,
          serialNumber,
          error: null,
          tamperDetected: false,
          warning: null,
        });
        lastWriteTimestamp.current = Date.now();
      } catch (e) {
        if (signal.aborted) return;
        phaseRef.current = "error";
        setState((s) => ({ ...s, phase: "error", error: friendlyWriteError(e) }));
      }
    }

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

    reader.scan({ signal }).catch((e: Error) => {
      if (!signal.aborted) {
        phaseRef.current = "error";
        setState((s) => ({ ...s, phase: "error", error: e.message }));
      }
    });
  }, [grant, tenantId, terminalId, lenient, clearPendingWriteTimeout, clearPostWriteAutoReset]);

  const write = useCallback(
    async (updatedPayload: CardPayload, operationType: string = "debit"): Promise<boolean> => {
      if (!grant || !state.payload) return false;

      const currentPayload = state.payload;
      const currentSerial = state.serialNumber;
      const reader = readerRef.current;
      const signal = abortRef.current?.signal;

      phaseRef.current = "writing";
      setState((s) => ({ ...s, phase: "writing" }));

      try {
        // Crypto runs while scan is still active — foreground dispatch never drops
        const { bytes: raw, payload } = await prepareWrite(currentPayload, updatedPayload, grant);

        // Attempt immediate write — card is likely still in range from the scan
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

            // Write succeeded immediately — record to outbox and finish
            const cardIdHex = Array.from(updatedPayload.header.cardId)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");

            await reconciliationOutbox.add({
              tenantId,
              terminalId,
              cardId: cardIdHex,
              counter: Number(updatedPayload.wallet.counter),
              type: operationType,
              amount: currentPayload.wallet.balance - updatedPayload.wallet.balance,
              balanceAfter: updatedPayload.wallet.balance,
              timestamp: updatedPayload.wallet.lastTimestamp,
              hash: Array.from(updatedPayload.logEntries.at(-1)?.hash ?? new Uint8Array(6))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(""),
              idempotencyKey: makeIdempotencyKey(
                tenantId,
                cardIdHex,
                Number(updatedPayload.wallet.counter),
              ),
            });

            // Also record to Dexie transactionLog for sync push
            try {
              await recordTransaction({
                tenantId,
                cardId: cardIdHex,
                userId: updatedPayload.identity.userId ? updatedPayload.identity.userId : null,
                counter: Number(updatedPayload.wallet.counter),
                type: operationType as
                  | "debit"
                  | "credit"
                  | "checkin"
                  | "checkout"
                  | "topup"
                  | "admin",
                amount: Math.abs(currentPayload.wallet.balance - updatedPayload.wallet.balance),
                balanceAfter: updatedPayload.wallet.balance,
                timestamp: updatedPayload.wallet.lastTimestamp,
                hash: Array.from(updatedPayload.logEntries.at(-1)?.hash ?? new Uint8Array(6))
                  .map((b) => b.toString(16).padStart(2, "0"))
                  .join(""),
                terminalId,
                deviceId: null,
              });
            } catch {
              // Duplicate or write error — non-critical, reconciliation outbox is the primary
            }

            await verifyWrittenPayload(payload, grant);

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
          } catch {
            // Immediate write failed (card removed too fast) — fall back to re-tap
          }
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
        // Start 30-second timeout for pending write (Req 9.6)
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
    [grant, state.payload, state.serialNumber, tenantId, terminalId, startPendingWriteTimeout],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    readerRef.current = null;
    pendingWriteRef.current = null;
    clearPendingWriteTimeout();
    clearPostWriteAutoReset();
    phaseRef.current = "idle";
    setState({
      phase: "idle",
      payload: null,
      serialNumber: null,
      error: null,
      tamperDetected: false,
      warning: null,
    });
  }, [clearPendingWriteTimeout, clearPostWriteAutoReset]);

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
