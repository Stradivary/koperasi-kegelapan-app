import { useState, useCallback, useRef, useEffect } from "react";
import {
  validateCard,
  prepareWrite,
  decryptCardBody,
  TENANT_MISMATCH_REASON,
  UNREGISTERED_CARD_MESSAGE,
} from "../core/nfc/pipelineEngine";
import { isNfcSupported, extractCardBytes, friendlyWriteError } from "../core/nfc/engine";
import { decodePayload } from "../core/payload/engine";
import { isTenantBindValid } from "../core/payload/tenantBind";
import type { CardPayload, SessionGrant } from "../core/payload/types";
import { BUFFER_SIZE, WIRE_SIZE, TRAILER_COUNTER_BIND } from "../core/payload/types";
import { reconciliationOutbox, makeIdempotencyKey } from "../lib/indexeddb";
import { recordTransaction } from "../lib/transactionLogService";

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

      // ── Phase 1: card scan ──────────────────────────────────────────────────
      // Guard on 'scanning' only — if the card stays in range during async validation
      // a second reading event would enter here concurrently, causing a race.
      if (phase === "scanning") {
        // Record timestamp when a valid scan begins processing
        lastScanTimestamp.current = Date.now();

        // ── Pending write recovery (Req 9.4, 9.5) ──────────────────────────────
        // If there's a stored pending write from a previous interrupted write,
        // check if the scanned card matches the target.
        const pending = pendingWriteRef.current;
        if (pending) {
          const scannedSerial = event.serialNumber;
          if (scannedSerial && pending.serialNumber && scannedSerial === pending.serialNumber) {
            // Serial matches — execute the stored write (Req 9.4)
            pendingWriteRef.current = null;
            clearPendingWriteTimeout();
            phaseRef.current = "writing";
            setState((s) => ({ ...s, phase: "writing" }));

            try {
              const reader = readerRef.current;
              if (reader && signal && !signal.aborted) {
                await reader.write(
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

                // Write succeeded — record to outbox
                const cardIdHex = Array.from(pending.updatedPayload.header.cardId)
                  .map((b) => b.toString(16).padStart(2, "0"))
                  .join("");

                await reconciliationOutbox.add({
                  tenantId,
                  terminalId,
                  cardId: cardIdHex,
                  counter: Number(pending.updatedPayload.wallet.counter),
                  type: pending.operationType,
                  amount: pending.currentPayload.wallet.balance - pending.updatedPayload.wallet.balance,
                  balanceAfter: pending.updatedPayload.wallet.balance,
                  timestamp: pending.updatedPayload.wallet.lastTimestamp,
                  hash: Array.from(pending.updatedPayload.logEntries.at(-1)?.hash ?? new Uint8Array(6))
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
                    userId: pending.updatedPayload.identity.userId ? pending.updatedPayload.identity.userId : null,
                    counter: Number(pending.updatedPayload.wallet.counter),
                    type: pending.operationType as
                      | "debit"
                      | "credit"
                      | "checkin"
                      | "checkout"
                      | "topup"
                      | "admin",
                    amount: Math.abs(pending.currentPayload.wallet.balance - pending.updatedPayload.wallet.balance),
                    balanceAfter: pending.updatedPayload.wallet.balance,
                    timestamp: pending.updatedPayload.wallet.lastTimestamp,
                    hash: Array.from(pending.updatedPayload.logEntries.at(-1)?.hash ?? new Uint8Array(6))
                      .map((b) => b.toString(16).padStart(2, "0"))
                      .join(""),
                    terminalId,
                    deviceId: null,
                  });
                } catch {
                  // Non-critical — reconciliation outbox is the primary
                }

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
                return;
              }
            } catch (e) {
              if (signal.aborted) return;
              phaseRef.current = "error";
              setState((s) => ({ ...s, phase: "error", error: friendlyWriteError(e) }));
              return;
            }
            return;
          } else {
            // Serial mismatch — discard pending write and process as fresh scan (Req 9.5)
            pendingWriteRef.current = null;
            clearPendingWriteTimeout();
          }
        }

        phaseRef.current = "validating";
        setState((s) => ({ ...s, phase: "validating" }));

        const raw = extractCardBytes(event.message);
        if (!raw) {
          // If a write just succeeded, this is likely the NFC subsystem returning
          // a stale/empty read. Show a friendlier message instead of "tidak terdaftar".
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

          // Auto-reset after 3s for transient post-write read errors (Req 9.2)
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
          // Decrypt body first if card uses v2+ AES-256-GCM encryption
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
            // Offline mode: skip full server-side validation after successful decrypt.
            // Successful decryption already proves the session key is valid for this card.
            // Only check tenant bind to prevent cross-tenant operations.
            if (!isTenantBindValid(payload.header.tenantBind, grant.tenantId)) {
              if (lenient) {
                // Lenient mode: show card data with warning
                phaseRef.current = "ready";
                setState({
                  phase: "ready",
                  payload,
                  serialNumber: event.serialNumber,
                  error: null,
                  tamperDetected: false,
                  warning: UNREGISTERED_CARD_MESSAGE,
                });
                return;
              }
              phaseRef.current = "error";
              setState((s) => ({
                ...s,
                phase: "error",
                payload: null,
                error: UNREGISTERED_CARD_MESSAGE,
                tamperDetected: false,
                warning: null,
              }));
              return;
            }
            if (signal.aborted) return;
            phaseRef.current = "ready";
            setState({
              phase: "ready",
              payload,
              serialNumber: event.serialNumber,
              error: null,
              tamperDetected: false,
              warning: null,
            });
          } else {
            // Online mode: perform full validation with server grant
            const validation = await validateCard(payload, raw, grant);
            if (signal.aborted) return;
            if (!validation.valid) {
              // Tenant mismatch: show standard unregistered message and suppress card details
              const isTenantMismatch =
                validation.reason === TENANT_MISMATCH_REASON ||
                validation.reason === UNREGISTERED_CARD_MESSAGE;
              const isTamper = validation.tamper ?? false;

              // In lenient mode, non-tamper validation failures (tenant mismatch, key version)
              // result in "ready" with a warning instead of hard "error"
              if (lenient && !isTamper) {
                phaseRef.current = "ready";
                setState({
                  phase: "ready",
                  payload,
                  serialNumber: event.serialNumber,
                  error: null,
                  tamperDetected: false,
                  warning: isTenantMismatch
                    ? UNREGISTERED_CARD_MESSAGE
                    : (validation.reason ?? "Validasi gagal"),
                });
                return;
              }

              phaseRef.current = "error";
              setState((s) => ({
                ...s,
                phase: "error",
                payload: isTenantMismatch ? null : s.payload,
                error: isTenantMismatch
                  ? UNREGISTERED_CARD_MESSAGE
                  : (validation.reason ?? "Validasi gagal"),
                tamperDetected: isTamper,
                warning: null,
              }));
              return;
            }
            phaseRef.current = "ready";
            setState({
              phase: "ready",
              payload,
              serialNumber: event.serialNumber,
              error: null,
              tamperDetected: false,
              warning: null,
            });
          }
        } catch {
          if (signal.aborted) return;

          // If a write succeeded recently (within 10s), this is likely a transient NFC read
          // error (corrupted data after write). Show a friendlier message and allow retry
          // instead of the confusing "tidak terdaftar" message.
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

          // Auto-reset after 3s for transient post-write read errors (Req 9.2)
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
        return;
      }

      // ── Phase 2: write on second tap ────────────────────────────────────────
      if (phase === "writing") {
        const pending = pendingWriteRef.current;
        if (!pending) return; // crypto not done yet — user tapped too fast, they'll need to tap again
        pendingWriteRef.current = null;
        clearPendingWriteTimeout();

        try {
          const { raw, currentPayload, updatedPayload, serialNumber } = pending;

          // Write using the SAME reader instance — NFC foreground dispatch is never released
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

          // Also record to Dexie transactionLog for sync push
          try {
            await recordTransaction({
              tenantId,
              cardId: cardIdHex,
              userId: updatedPayload.identity.userId ? updatedPayload.identity.userId : null,
              counter: Number(updatedPayload.wallet.counter),
              type: pending.operationType as
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

          const resultPayload = pending.payload;
          phaseRef.current = "success";
          setState({
            phase: "success",
            payload: resultPayload,
            serialNumber,
            error: null,
            tamperDetected: false,
            warning: null,
          });
          lastWriteTimestamp.current = Date.now();
        } catch (e) {
          if (signal.aborted) return; // reset/cancel already cleaned up state
          phaseRef.current = "error";
          setState((s) => ({ ...s, phase: "error", error: friendlyWriteError(e) }));
        }
      }
    });

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
        setState((s) => ({ ...s, phase: "error", error: String(e) }));
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
