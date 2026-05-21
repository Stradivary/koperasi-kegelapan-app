import { useCallback, useEffect, useRef, useState } from "react";
import { CardState } from "../../core/payload/types";
import {
  applyCheckout,
  PARKING_RATE_PER_HOUR,
  validateCheckoutBalance,
  validateTransition,
} from "../../core/state-machine/engine";
import { useSyncEngineContext } from "../../hooks/SyncEngineContext";
import { useBlockedCheck } from "../../hooks/useBlockedCheck";
import { useKioskAutoScan } from "../../hooks/useKioskAutoScan";
import { useNfcCard } from "../../hooks/useNfcCard";
import { useReconciliation } from "../../hooks/useReconciliation";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { formatDuration } from "../../lib/formatters";
import { FeedbackCard } from "../block/FeedbackCard";
import { LoadingState } from "../block/LoadingState";
import { NfcStatusLabel, NfcTapArea } from "../block/NfcTapArea";
import { OfflineIndicator } from "../block/OfflineIndicator";
import { KioskLayout } from "../layout/KioskLayout";
import { Button } from "../ui/button";

interface TerminalSectionProps {
  tenantId: string;
  tenantName: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
}

export function TerminalSection({
  tenantId,
  tenantName,
  accountId,
  deviceId,
  terminalId,
}: TerminalSectionProps) {
  const {
    grant,
    loading: grantLoading,
    error: grantError,
  } = useSessionGrant(tenantId, accountId, deviceId, "terminal");
  const { state, scan, write, reset } = useNfcCard(grant, tenantId, terminalId, { lenient: true });
  const { status: syncStatus, pendingCount, sync } = useReconciliation(tenantId, terminalId);
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

    const trigger =
      cardState === CardState.STATION_OPERATION ? "force_checkout" : "gate_checkout";
    const result = validateTransition(payload, trigger, nowSeconds);
    if (!result.valid) {
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

  function handleScan() {
    autoCheckoutTriggered.current = false;
    setInsufficientBalance(null);
    setTamperDisableAutoScan(false);
    scan();
  }

  const cardState = state.payload?.wallet.state;

  const syncTrailing = (
    <OfflineIndicator pendingCount={pendingCount} onSync={sync} syncStatus={syncStatus} />
  );

  return (
    <KioskLayout
      title="Terminal"
      tenantName={tenantName}
      tenantId={tenantId}
      currentMode="terminal"
      trailing={syncTrailing}
    >
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

        {/* Idle — tap to scan */}
        {state.phase === "idle" && (
          <div className="flex flex-col items-center gap-6">
            <NfcTapArea
              phase="idle"
              onClick={handleScan}
              disabled={!grant || grantLoading}
              label="Tap untuk Checkout"
            />
            <Button
              onClick={handleScan}
              disabled={!grant || grantLoading}
              className="w-full max-w-xs h-12 bg-brand hover:bg-brand/90 text-white type-title-bold"
            >
              {grantLoading ? (
                <LoadingState variant="button" text="Memuat sesi..." />
              ) : (
                "Tap Kartu untuk Checkout"
              )}
            </Button>
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
              <p className="type-body2 text-muted-foreground animate-pulse">
                Memproses...
              </p>
            ) : blockedCheck.isBlocked && state.phase === "ready" ? (
              <FeedbackCard
                variant="blocked"
                title="Checkout Ditolak"
                subtitle={state.payload.identity.name}
                details={blockedCheck.blockedReason ? [{ label: "Alasan", value: blockedCheck.blockedReason }] : undefined}
                actions={[{ label: "Selesai", onClick: reset, variant: "outline" }]}
              />
            ) : insufficientBalance && state.phase === "ready" ? (
              <FeedbackCard
                variant="warning"
                title="Saldo Tidak Cukup"
                subtitle={state.payload.identity.name}
                details={[
                  { label: "Saldo saat ini", value: `Rp ${insufficientBalance.currentBalance.toLocaleString("id-ID")}` },
                  { label: "Biaya parkir", value: `Rp ${insufficientBalance.fee.toLocaleString("id-ID")}` },
                  { label: "Perlu top-up minimal", value: `Rp ${insufficientBalance.deficit.toLocaleString("id-ID")}` },
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
            ) : cardState === CardState.CHECKED_OUT && state.phase === "ready" && blockedCheck.isReady ? (
              <FeedbackCard
                variant="warning"
                title="Sudah Checkout"
                subtitle={`${state.payload.identity.name} sudah dalam status keluar.`}
                actions={[{ label: "Selesai", onClick: reset, variant: "outline" }]}
              />
            ) : (
              <p className="type-body2 text-muted-foreground animate-pulse">
                Memproses checkout...
              </p>
            )}
          </div>
        )}

        {/* Success */}
        {state.phase === "success" && state.payload && lastTx && (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            <NfcTapArea phase="success" />
            {(blockedCheck.notInLocalDb || state.warning) && (
              <div className="rounded-xl bg-amber-50 border border-amber-300/50 p-3 w-full">
                <p className="type-body2 text-amber-700 text-center">
                  ⚠️{" "}
                  {state.warning ??
                    "Kartu tidak terdaftar di database lokal. Data mungkin belum tersinkronisasi."}
                </p>
              </div>
            )}
            <FeedbackCard
              variant="success"
              title="Checkout Berhasil"
              subtitle={state.payload.identity.name}
              details={[
                { label: "Durasi", value: formatDuration(lastTx.durationSeconds) },
                { label: "Biaya", value: `Rp ${lastTx.fee.toLocaleString("id-ID")}` },
                { label: "Saldo", value: `Rp ${state.payload.wallet.balance.toLocaleString("id-ID")}` },
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
              actions={[{ label: "Coba Lagi", onClick: handleScan, variant: "primary" }]}
            />
          </div>
        )}
      </div>
    </KioskLayout>
  );
}
