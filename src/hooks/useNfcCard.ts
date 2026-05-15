import { useState, useCallback, useRef } from "react";
import { validateCard, prepareWrite, decryptCardBody } from "../core/nfc/pipelineEngine";
import { isNfcSupported, extractCardBytes, friendlyWriteError } from "../core/nfc/engine";
import { decodePayload } from "../core/payload/engine";
import type { CardPayload, SessionGrant } from "../core/payload/types";
import {
  BUFFER_SIZE,
  WIRE_SIZE,
  CARD_SCHEMA_VERSION,
  TRAILER_COUNTER_BIND,
} from "../core/payload/types";
import { reconciliationOutbox, makeIdempotencyKey } from "../lib/indexeddb";

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
}

interface PendingWrite {
  raw: Uint8Array;
  payload: CardPayload;
  currentPayload: CardPayload;
  updatedPayload: CardPayload;
  serialNumber: string | null;
}

export function useNfcCard(grant: SessionGrant | null, tenantId: string, terminalId: number) {
  const [state, setState] = useState<NfcCardState>({
    phase: "idle",
    payload: null,
    serialNumber: null,
    error: null,
    tamperDetected: false,
  });

  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<NDEFReader | null>(null);
  // phaseRef mirrors state.phase so event handlers always see the current value
  const phaseRef = useRef<NfcCardPhase>("idle");
  const pendingWriteRef = useRef<PendingWrite | null>(null);

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

    pendingWriteRef.current = null;
    phaseRef.current = "scanning";
    setState({
      phase: "scanning",
      payload: null,
      serialNumber: null,
      error: null,
      tamperDetected: false,
    });

    const reader = new NDEFReader();
    readerRef.current = reader;

    reader.addEventListener("reading", async (event: NDEFReadingEvent) => {
      const phase = phaseRef.current;

      // ── Phase 1: card scan ──────────────────────────────────────────────────
      // Guard on 'scanning' only — if the card stays in range during async validation
      // a second reading event would enter here concurrently, causing a race.
      if (phase === "scanning") {
        phaseRef.current = "validating";
        setState((s) => ({ ...s, phase: "validating" }));

        const raw = extractCardBytes(event.message);
        if (!raw) {
          phaseRef.current = "error";
          setState((s) => ({
            ...s,
            phase: "error",
            error: "Kartu tidak berisi data yang valid",
            tamperDetected: false,
          }));
          return;
        }

        try {
          // Decrypt body first if card uses v2 AES-256-GCM encryption
          const version = raw[4];
          let decodableRaw = raw;
          if (version === CARD_SCHEMA_VERSION) {
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
          const validation = await validateCard(payload, raw, grant);
          if (signal.aborted) return;
          if (!validation.valid) {
            phaseRef.current = "error";
            setState((s) => ({
              ...s,
              phase: "error",
              error: validation.reason ?? "Validasi gagal",
              tamperDetected: validation.tamper ?? false,
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
          });
        } catch (e) {
          if (signal.aborted) return;
          phaseRef.current = "error";
          setState((s) => ({
            ...s,
            phase: "error",
            error: `Decode gagal: ${e}`,
            tamperDetected: true,
          }));
        }
        return;
      }

      // ── Phase 2: write on second tap ────────────────────────────────────────
      if (phase === "writing") {
        const pending = pendingWriteRef.current;
        if (!pending) return; // crypto not done yet — user tapped too fast, they'll need to tap again
        pendingWriteRef.current = null;

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
            type: "debit",
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

          const resultPayload = pending.payload;
          phaseRef.current = "success";
          setState({
            phase: "success",
            payload: resultPayload,
            serialNumber,
            error: null,
            tamperDetected: false,
          });
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
  }, [grant, tenantId, terminalId]);

  const write = useCallback(
    async (updatedPayload: CardPayload): Promise<boolean> => {
      if (!grant || !state.payload) return false;

      const currentPayload = state.payload;
      const currentSerial = state.serialNumber;

      phaseRef.current = "writing";
      setState((s) => ({ ...s, phase: "writing" }));

      try {
        // Crypto runs while scan is still active — foreground dispatch never drops
        const { bytes: raw, payload } = await prepareWrite(currentPayload, updatedPayload, grant);
        pendingWriteRef.current = {
          raw,
          payload,
          currentPayload,
          updatedPayload,
          serialNumber: currentSerial,
        };
        return true;
      } catch (e) {
        phaseRef.current = "error";
        setState((s) => ({ ...s, phase: "error", error: String(e) }));
        return false;
      }
    },
    [grant, state.payload, state.serialNumber],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    readerRef.current = null;
    pendingWriteRef.current = null;
    phaseRef.current = "idle";
    setState({
      phase: "idle",
      payload: null,
      serialNumber: null,
      error: null,
      tamperDetected: false,
    });
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    readerRef.current = null;
    pendingWriteRef.current = null;
    phaseRef.current = "idle";
    setState((s) => ({ ...s, phase: "idle" }));
  }, []);

  return { state, scan, write, reset, cancel };
}
