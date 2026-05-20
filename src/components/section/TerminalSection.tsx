import { useCallback, useEffect, useRef, useState } from "react";
import { checkLocalBlockedStatus } from "../../core/nfc/localStatusCheck";
import { CardState } from "../../core/payload/types";
import {
  applyCheckout,
  PARKING_RATE_PER_HOUR,
  validateTransition,
} from "../../core/state-machine/engine";
import { useSyncEngineContext } from "../../hooks/SyncEngineContext";
import { useNfcCard } from "../../hooks/useNfcCard";
import { useReconciliation } from "../../hooks/useReconciliation";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { formatDuration } from "../../lib/formatters";
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

const enforce24hLimit = true;

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
  const { state, scan, write, reset } = useNfcCard(grant, tenantId, terminalId);
  const { status: syncStatus, pendingCount, sync } = useReconciliation(tenantId, terminalId);
  const syncEngine = useSyncEngineContext();
  const [lastTx, setLastTx] = useState<{ durationSeconds: number; fee: number } | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  // Track whether we already triggered auto-checkout for this scan cycle
  const autoCheckoutTriggered = useRef(false);

  // Get the current timestamp (real or simulated)
  const getNowSeconds = useCallback(() => {
    return Math.floor(Date.now() / 1000);
  }, []);

  // Auto-checkout when card is ready — no confirmation needed (like gate)
  useEffect(() => {
    if (state.phase !== "ready" || !state.payload || autoCheckoutTriggered.current) return;

    const payload = state.payload;
    const nowSeconds = getNowSeconds();
    const cardState = payload.wallet.state;

    // Card not checked in — nothing to checkout
    if (cardState !== CardState.CHECKED_IN && cardState !== CardState.STATION_OPERATION) {
      autoCheckoutTriggered.current = true;
      // IDLE or CHECKED_OUT — no action needed, render handles the message
      return;
    }

    // Check 24-hour session limit (only if enforced)
    if (enforce24hLimit) {
      const SESSION_TIMEOUT_SECONDS = 24 * 60 * 60;
      const CLOCK_DRIFT_TOLERANCE = 60 * 60;
      const durationSinceCheckin = nowSeconds - payload.wallet.lastTimestamp;
      if (durationSinceCheckin > SESSION_TIMEOUT_SECONDS + CLOCK_DRIFT_TOLERANCE) {
        autoCheckoutTriggered.current = true;
        setBlockedReason("Sesi melebihi 24 jam. Hubungi admin untuk reset.");
        return;
      }
    }

    // Check local DB for blocked card or suspended member
    // Uses hardware serial number (state.serialNumber) as the correct lookup key
    if (!state.serialNumber) return;

    checkLocalBlockedStatus(tenantId, state.serialNumber, payload.identity.userId).then(
      (statusResult) => {
        if (statusResult.blocked) {
          autoCheckoutTriggered.current = true;
          setBlockedReason(statusResult.reason);
          return;
        }

        const trigger =
          cardState === CardState.STATION_OPERATION ? "force_checkout" : "gate_checkout";
        const result = validateTransition(payload, trigger, nowSeconds);
        if (!result.valid) {
          autoCheckoutTriggered.current = true;
          setBlockedReason("Transisi tidak valid");
          return;
        }

        const durationSeconds = nowSeconds - payload.session.startTime;
        const hours = Math.ceil(durationSeconds / 3600);
        const fee = hours * PARKING_RATE_PER_HOUR;

        // Insufficient balance
        if (payload.wallet.balance < fee) {
          autoCheckoutTriggered.current = true;
          setBlockedReason("Saldo anda kurang untuk checkout, harap isi Saldo terlebih dahulu");
          return;
        }

        autoCheckoutTriggered.current = true;
        setBlockedReason(null);
        const actualFee = Math.min(fee, payload.wallet.balance);
        setLastTx({ durationSeconds, fee: actualFee });
        write(applyCheckout(payload, nowSeconds));
      },
    );
  }, [
    state.phase,
    state.payload,
    state.serialNumber,
    write,
    getNowSeconds,
    enforce24hLimit,
    tenantId,
  ]);

  // Auto-reset after success
  useEffect(() => {
    if (state.phase === "success") {
      // Notify sync engine that an Outbox write occurred (triggers debounced sync)
      syncEngine?.notifyMutation();
      const timer = setTimeout(() => {
        reset();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.phase, reset, syncEngine]);

  // Reset the auto-checkout flag when going back to idle
  useEffect(() => {
    if (state.phase === "idle") {
      autoCheckoutTriggered.current = false;
      setBlockedReason(null);
      setLastTx(null);
    }
  }, [state.phase]);

  function handleScan() {
    autoCheckoutTriggered.current = false;
    setBlockedReason(null);
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
            {blockedReason && state.phase === "ready" ? (
              <div className="bg-white rounded-2xl border border-destructive/30 p-4 space-y-3 text-center w-full">
                <p className="type-body1-bold text-destructive">⛔ Checkout Ditolak</p>
                <p className="type-body2 text-muted-foreground">{blockedReason}</p>
                <p className="type-body2 text-muted-foreground">{state.payload.identity.name}</p>
                <Button variant="outline" onClick={reset} className="w-full">
                  Selesai
                </Button>
              </div>
            ) : cardState === CardState.IDLE && state.phase === "ready" ? (
              <div className="bg-white rounded-2xl border p-4 space-y-3 text-center w-full">
                <p className="type-body1-bold text-signal-warning">Belum Check-in</p>
                <p className="type-body2 text-muted-foreground">
                  {state.payload.identity.name} belum melakukan check-in.
                </p>
                <Button variant="outline" onClick={reset} className="w-full">
                  Selesai
                </Button>
              </div>
            ) : cardState === CardState.CHECKED_OUT && state.phase === "ready" ? (
              <div className="bg-white rounded-2xl border p-4 space-y-3 text-center w-full">
                <p className="type-body1-bold text-signal-warning">Sudah Checkout</p>
                <p className="type-body2 text-muted-foreground">
                  {state.payload.identity.name} sudah dalam status keluar.
                </p>
                <Button variant="outline" onClick={reset} className="w-full">
                  Selesai
                </Button>
              </div>
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
            <div className="bg-white rounded-2xl border p-4 space-y-3 text-center w-full">
              <p className="type-title-bold text-signal-valid">✓ Checkout Berhasil</p>
              <p className="type-body1 text-foreground">{state.payload.identity.name}</p>
              <div className="space-y-1">
                <div className="flex justify-between type-body2">
                  <span className="text-muted-foreground">Durasi</span>
                  <span>{formatDuration(lastTx.durationSeconds)}</span>
                </div>
                <div className="flex justify-between type-body2">
                  <span className="text-muted-foreground">Biaya</span>
                  <span>Rp {lastTx.fee.toLocaleString("id-ID")}</span>
                </div>
                <div className="flex justify-between type-body2">
                  <span className="text-muted-foreground">Saldo</span>
                  <span className="text-brand font-medium">
                    Rp {state.payload.wallet.balance.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground animate-pulse">Menutup otomatis...</p>
          </div>
        )}

        {/* Error */}
        {state.phase === "error" && (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            <NfcTapArea phase="error" tamperDetected={state.tamperDetected} />
            <NfcStatusLabel
              phase="error"
              error={state.error}
              tamperDetected={state.tamperDetected}
            />
            <Button variant="outline" onClick={reset} className="w-full">
              Coba Lagi
            </Button>
          </div>
        )}
      </div>
    </KioskLayout>
  );
}
