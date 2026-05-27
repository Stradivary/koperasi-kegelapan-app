import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardState, CardStatus } from "#/core/payload/types";
import {
  applyBlockStatus,
  applyCheckout,
  PARKING_RATE_PER_HOUR,
  validateCheckoutBalance,
  validateTransition,
} from "#/core/state-machine/engine";
import { useSyncEngineContext } from "#/hooks/SyncEngineContext";
import { useBlockedCheck } from "#/hooks/useBlockedCheck";
import { useKioskAutoScan } from "#/hooks/useKioskAutoScan";
import { useNfcCard } from "#/hooks/nfc/useNfcCard";
import { updateLocalCardRecord } from "#/hooks/nfc/updateLocalCardRecord";
import { useSessionGrant } from "#/hooks/useSessionGrant";
import { formatDuration } from "#/lib/formatters";
import { FeedbackCard } from "../block/FeedbackCard";
import { LoadingState } from "../block/LoadingState";
import { NfcStatusLabel, NfcTapArea } from "../block/NfcTapArea";
import type { CardPayload } from "#/core/payload/types";
import type { BlockedCheckResult } from "#/hooks/useBlockedCheck";

interface TerminalSectionProps {
  tenantId: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
}

/**
 * Returns true if the card is eligible for auto-checkout.
 */
function shouldAutoCheckout(
  payload: CardPayload,
  blockedCheck: BlockedCheckResult,
  nowSeconds: number,
): boolean {
  if (!blockedCheck.isReady) return false;
  const cardState = payload.wallet.state;
  if (cardState !== CardState.CHECKED_IN && cardState !== CardState.STATION_OPERATION) {
    return false;
  }
  const trigger = cardState === CardState.STATION_OPERATION ? "force_checkout" : "gate_checkout";
  const result = validateTransition(payload, trigger, nowSeconds);
  return result.valid;
}

export function TerminalSection({
  tenantId,
  accountId,
  deviceId,
  terminalId,
}: Readonly<TerminalSectionProps>) {
  const {
    grant,
    loading: grantLoading,
    error: grantError,
  } = useSessionGrant(tenantId, accountId, deviceId, "terminal");
  const { state, scan, write, reset, retryScan } = useNfcCard(grant, tenantId, terminalId, {
    lenient: true,
  });
  const syncEngine = useSyncEngineContext();

  // Use the shared useBlockedCheck hook to handle async blocked status check
  const blockedCheck = useBlockedCheck({
    tenantId,
    serialNumber: state.serialNumber,
    phase: state.phase,
    payload: state.payload,
  });

  // Track tamper detection to disable auto-scan until manual "Coba Lagi" restart
  const [tamperDisableAutoScan, setTamperDisableAutoScan] = useState(false);

  // When tamper is detected, disable auto-scan
  useEffect(() => {
    if (state.phase === "error" && state.tamperDetected) {
      setTamperDisableAutoScan(true);
    }
  }, [state.phase, state.tamperDetected]);

  // Use the shared useKioskAutoScan hook for auto-scan loop
  useKioskAutoScan({
    enabled: !tamperDisableAutoScan,
    grant,
    loading: grantLoading,
    phase: state.phase,
    scan,
    resetDelay: 3000,
    autoStart: true,
  });

  const [lastTx, setLastTx] = useState<{
    durationSeconds: number;
    fee: number;
  } | null>(null);

  // Insufficient balance info when checkout is blocked
  const [insufficientBalance, setInsufficientBalance] = useState<{
    fee: number;
    deficit: number;
    currentBalance: number;
  } | null>(null);

  // Track whether we already triggered auto-checkout for this scan cycle
  const autoCheckoutTriggered = useRef(false);

  // Get the current timestamp (real or simulated)
  const getNowSeconds = useCallback(() => {
    return Math.floor(Date.now() / 1000);
  }, []);

  // Auto-checkout when blocked check completes and card is eligible
  useEffect(() => {
    if (!blockedCheck.isReady || !state.payload || autoCheckoutTriggered.current) return;

    const payload = state.payload;
    const nowSeconds = getNowSeconds();
    const cardState = payload.wallet.state;

    // Card not checked in — nothing to checkout
    if (cardState !== CardState.CHECKED_IN && cardState !== CardState.STATION_OPERATION) {
      autoCheckoutTriggered.current = true;
      // IDLE or CHECKED_OUT — no action needed, render handles the message
      return;
    }

    if (!shouldAutoCheckout(payload, blockedCheck, nowSeconds)) {
      autoCheckoutTriggered.current = true;
      return;
    }

    autoCheckoutTriggered.current = true;

    // Check if balance is sufficient for checkout (balance - fee >= 10,000)
    const balanceCheck = validateCheckoutBalance(payload, nowSeconds);
    if (!balanceCheck.sufficient) {
      setInsufficientBalance({
        fee: balanceCheck.fee,
        deficit: balanceCheck.deficit,
        currentBalance: payload.wallet.balance,
      });
      return;
    }

    // Perform standard checkout via applyCheckout
    const updatedPayload = applyCheckout(payload, nowSeconds);
    const durationSeconds = nowSeconds - payload.session.startTime;
    const hours = Math.ceil(durationSeconds / 3600);
    const fee = hours * PARKING_RATE_PER_HOUR;

    setLastTx({ durationSeconds, fee });
    write(updatedPayload, "checkout");
  }, [blockedCheck.isReady, state.payload, write, getNowSeconds]);

  // Write blocked status back to the physical card when local DB says blocked
  // but the on-card status is still ACTIVE. This ensures the card itself becomes
  // the authoritative source of truth for offline enforcement.
  useEffect(() => {
    if (!blockedCheck.isBlocked || !state.payload || state.phase !== "ready") return;
    if (blockedCheck.isChecking) return;

    const payload = state.payload;
    if (payload.identity.status === CardStatus.ACTIVE) {
      const blockedPayload = applyBlockStatus(payload, CardStatus.BLOCKED_ADMIN, getNowSeconds());
      write(blockedPayload, "admin");
      void updateLocalCardRecord(tenantId, blockedPayload);
    }
  }, [
    blockedCheck.isBlocked,
    blockedCheck.isChecking,
    state.payload,
    state.phase,
    write,
    getNowSeconds,
    tenantId,
  ]);

  // Notify sync engine on success
  useEffect(() => {
    if (state.phase === "success") {
      // Notify sync engine that an Outbox write occurred (triggers debounced sync)
      syncEngine?.notifyMutation();
    }
  }, [state.phase, syncEngine]);

  // Reset the auto-checkout flag and per-cycle state when going back to idle
  useEffect(() => {
    if (state.phase === "idle") {
      autoCheckoutTriggered.current = false;
      setInsufficientBalance(null);
      setLastTx(null);
    }
  }, [state.phase]);

  function handleRetry() {
    autoCheckoutTriggered.current = false;
    setInsufficientBalance(null);
    setTamperDisableAutoScan(false);
    retryScan();
  }

  const cardState = state.payload?.wallet.state;

  // Auto-reset when card is in a state that doesn't need checkout (no write needed) so auto-scan loop continues
  const showNotCheckedIn =
    cardState === CardState.IDLE && state.phase === "ready" && blockedCheck.isReady;
  const showAlreadyCheckedOut =
    cardState === CardState.CHECKED_OUT && state.phase === "ready" && blockedCheck.isReady;
  const showBlocked = blockedCheck.isBlocked && state.phase === "ready" && !blockedCheck.isChecking;
  const showInsufficientBalance = !!insufficientBalance && state.phase === "ready";

  // Memoize the "should auto-reset" condition
  const shouldAutoReset = useMemo(
    () => showNotCheckedIn || showAlreadyCheckedOut || showBlocked || showInsufficientBalance,
    [showNotCheckedIn, showAlreadyCheckedOut, showBlocked, showInsufficientBalance],
  );

  useEffect(() => {
    if (shouldAutoReset) {
      const timer = setTimeout(() => {
        reset();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [shouldAutoReset, reset]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
      {grantLoading && (
        <LoadingState variant="inline" text="Memuat sesi..." className="text-white/70" />
      )}
      {!grant && !grantLoading && (
        <div className="w-full max-w-xs rounded-xl bg-signal-bg-error border border-signal-error/30 p-4">
          <p className="type-body1 text-signal-error text-center">
            {grantError ? `Error: ${grantError}` : "Tidak ada sesi aktif. Hubungi petugas."}
          </p>
        </div>
      )}

      {/* Idle — waiting for auto-scan */}
      {state.phase === "idle" && (
        <div className="flex flex-col items-center gap-4">
          <NfcTapArea phase="scanning" />
          <NfcStatusLabel phase="scanning" />
        </div>
      )}

      {/* Scanning */}
      {(state.phase === "scanning" || state.phase === "validating") && (
        <div className="flex flex-col items-center gap-4">
          <NfcTapArea phase={state.phase} />
          <NfcStatusLabel phase={state.phase} />
        </div>
      )}

      {/* Ready — auto-checkout in progress or blocked */}
      {(state.phase === "ready" || state.phase === "writing") && state.payload && (
        <div className="flex flex-col items-center gap-4 w-full max-w-xs">
          <NfcTapArea phase={state.phase === "writing" ? "writing" : "validating"} />
          {blockedCheck.isChecking && state.phase === "ready" ? (
            <p className="type-body2 text-muted-foreground animate-pulse">Memproses...</p>
          ) : blockedCheck.isBlocked && state.phase === "ready" ? (
            <FeedbackCard
              variant="blocked"
              title="Checkout Ditolak"
              subtitle={state.payload.identity.name}
              details={
                blockedCheck.blockedReason
                  ? [{ label: "Alasan", value: blockedCheck.blockedReason }]
                  : undefined
              }
              actions={[{ label: "Selesai", onClick: reset, variant: "outline" }]}
            />
          ) : insufficientBalance && state.phase === "ready" ? (
            <FeedbackCard
              variant="warning"
              title="Saldo Tidak Cukup"
              subtitle={state.payload.identity.name}
              details={[
                {
                  label: "Saldo saat ini",
                  value: `Rp ${insufficientBalance.currentBalance.toLocaleString("id-ID")}`,
                },
                {
                  label: "Biaya parkir",
                  value: `Rp ${insufficientBalance.fee.toLocaleString("id-ID")}`,
                },
                {
                  label: "Perlu top-up minimal",
                  value: `Rp ${insufficientBalance.deficit.toLocaleString("id-ID")}`,
                },
              ]}
              actions={[{ label: "Selesai", onClick: reset, variant: "outline" }]}
            />
          ) : cardState === CardState.IDLE && state.phase === "ready" && blockedCheck.isReady ? (
            <FeedbackCard
              variant="warning"
              title="Belum Check-in"
              subtitle={`${state.payload.identity.name} belum melakukan check-in.`}
              actions={[{ label: "Selesai", onClick: reset, variant: "outline" }]}
            />
          ) : cardState === CardState.CHECKED_OUT &&
            state.phase === "ready" &&
            blockedCheck.isReady ? (
            <FeedbackCard
              variant="warning"
              title="Sudah Checkout"
              subtitle={`${state.payload.identity.name} sudah dalam status keluar.`}
              actions={[{ label: "Selesai", onClick: reset, variant: "outline" }]}
            />
          ) : (
            <p className="type-body2 text-muted-foreground animate-pulse">Memproses checkout...</p>
          )}
        </div>
      )}

      {/* Success */}
      {state.phase === "success" && state.payload && lastTx && (
        <div className="flex flex-col items-center gap-4 w-full max-w-xs">
          <NfcTapArea phase="success" />
          <FeedbackCard
            variant="success"
            title="Checkout Berhasil"
            subtitle={state.payload.identity.name}
            details={[
              { label: "Durasi", value: formatDuration(lastTx.durationSeconds) },
              { label: "Biaya", value: `Rp ${lastTx.fee.toLocaleString("id-ID")}` },
              {
                label: "Saldo",
                value: `Rp ${state.payload.wallet.balance.toLocaleString("id-ID")}`,
              },
            ]}
            autoClose={3000}
            onClose={reset}
          />
        </div>
      )}

      {/* Error */}
      {state.phase === "error" && (
        <div className="flex flex-col items-center gap-4 w-full max-w-xs">
          <NfcTapArea phase="error" tamperDetected={state.tamperDetected} />
          <FeedbackCard
            variant="error"
            title={state.tamperDetected ? "Kartu Terdeteksi Rusak" : "Terjadi Kesalahan"}
            subtitle={state.error ?? undefined}
            actions={[{ label: "Coba Lagi", onClick: handleRetry, variant: "primary" }]}
          />
        </div>
      )}
    </div>
  );
}
