import { useState, useEffect, useRef, useCallback } from "react";
import { Clock } from "lucide-react";
import { useNfcCard } from "#/hooks/nfc/useNfcCard";
import { useSessionGrant } from "#/hooks/useSessionGrant";
import { useBlockedCheck } from "#/hooks/useBlockedCheck";
import { useKioskAutoScan } from "#/hooks/useKioskAutoScan";
import { useSyncEngineContext } from "#/hooks/SyncEngineContext";
import { validateTransition, applyCheckin, applyBlockStatus } from "#/core/state-machine/engine";
import { CardState, CardStatus } from "#/core/payload/types";
import { notifyCheckin } from "#/lib/peerSyncCoordinator";
import { updateLocalCardRecord } from "#/hooks/nfc/updateLocalCardRecord";
import { Input } from "../ui/input";
import { NfcTapArea, NfcStatusLabel } from "../block/NfcTapArea";
import { FeedbackCard } from "../block/FeedbackCard";
import type { CardPayload } from "#/core/payload/types";
import type { BlockedCheckResult } from "#/hooks/useBlockedCheck";

interface GateSectionProps {
  tenantId: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
}

/**
 * Returns a rejection reason string if the card should be rejected,
 * or null if the card passes the on-card status and blocked checks.
 */
function getCardRejectionReason(
  payload: CardPayload,
  blockedCheck: BlockedCheckResult,
): string | null {
  if (payload.identity.status !== CardStatus.ACTIVE) {
    const statusNames: Record<number, string> = {
      [CardStatus.BLOCKED_TAMPER]: "Kartu diblokir: terdeteksi manipulasi",
      [CardStatus.BLOCKED_FRAUD]: "Kartu diblokir: terdeteksi penipuan",
      [CardStatus.BLOCKED_EXPIRED]: "Kartu diblokir: kadaluarsa",
      [CardStatus.BLOCKED_ADMIN]: "Kartu diblokir oleh admin",
    };
    return statusNames[payload.identity.status] ?? "Kartu tidak aktif";
  }
  if (blockedCheck.isBlocked) {
    return blockedCheck.blockedReason ?? null;
  }
  return null;
}

export function GateSection({
  tenantId,
  accountId,
  deviceId,
  terminalId,
}: Readonly<GateSectionProps>) {
  const { grant, loading } = useSessionGrant(tenantId, accountId, deviceId, "gate");
  const { state, scan, write, reset, retryScan } = useNfcCard(grant, tenantId, terminalId, {
    lenient: true,
  });
  const syncEngine = useSyncEngineContext();

  // Simulation mode: date+time picker
  const [simulationMode, setSimulationMode] = useState(false);
  const [simulatedDateTime, setSimulatedDateTime] = useState(() => {
    const now = new Date();
    // Format: YYYY-MM-DDTHH:MM for datetime-local input
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  // 24-hour max checkout enforcement (default: disabled)
  const enforce24hLimit = false;

  // --- Blocked check hook (replaces manual checkLocalBlockedStatus + state) ---
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

  // --- Kiosk auto-scan hook (replaces manual hasCompletedCycle + idle-phase scan restart) ---
  useKioskAutoScan({
    enabled: !tamperDisableAutoScan,
    grant,
    loading,
    phase: state.phase,
    scan,
    resetDelay: 2000,
    autoStart: true,
  });

  // Track whether we already triggered auto-checkin for this scan cycle (duplicate-write prevention)
  const autoCheckinTriggered = useRef(false);

  // Additional blocked reason for on-card status or insufficient balance (not from local DB)
  const [cardRejectionReason, setCardRejectionReason] = useState<string | null>(null);

  // Get the current timestamp (real or simulated)
  const getNowSeconds = useCallback(() => {
    if (simulationMode && simulatedDateTime) {
      const simDate = new Date(simulatedDateTime);
      if (!Number.isNaN(simDate.getTime())) {
        return Math.floor(simDate.getTime() / 1000);
      }
    }
    return Math.floor(Date.now() / 1000);
  }, [simulationMode, simulatedDateTime]);

  // Auto check-in when blocked check completes and card is eligible
  useEffect(() => {
    if (state.phase !== "ready" || !state.payload || autoCheckinTriggered.current) return;

    const payload = state.payload;

    // Step 1: Check on-card status and blocked check (immediate, no async needed)
    if (payload.identity.status !== CardStatus.ACTIVE) {
      autoCheckinTriggered.current = true;
      setCardRejectionReason(getCardRejectionReason(payload, blockedCheck));
      return;
    }

    // Step 2: Wait for blocked check to complete (eliminates race condition)
    // blockedCheck.isReady is true only when check is complete AND card is not blocked
    if (blockedCheck.isChecking) return; // Still checking — don't proceed yet

    if (blockedCheck.isBlocked) {
      autoCheckinTriggered.current = true;
      // blockedReason is already available via blockedCheck.blockedReason

      // Write blocked status back to the physical card if on-card status is still ACTIVE.
      // This ensures the card itself becomes the authoritative source of truth,
      // enabling offline enforcement on subsequent taps without needing local DB.
      if (payload.identity.status === CardStatus.ACTIVE) {
        const blockedPayload = applyBlockStatus(payload, CardStatus.BLOCKED_ADMIN, getNowSeconds());
        write(blockedPayload, "admin");
        void updateLocalCardRecord(tenantId, blockedPayload);
      }
      return;
    }

    // Step 3: Blocked check passed — proceed with state validation
    const nowSeconds = getNowSeconds();

    // When enforce24hLimit is disabled, skip session expiry check by using
    // a "fresh" nowSeconds that won't trigger the expiry logic
    let validationNow = nowSeconds;
    if (!enforce24hLimit && payload.wallet.state !== CardState.IDLE) {
      // Use a timestamp just after lastTimestamp to bypass expiry check
      validationNow = payload.wallet.lastTimestamp + 1;
    }
    const result = validateTransition(payload, "gate_checkin", validationNow);
    if (!result.valid) {
      autoCheckinTriggered.current = true;
      if (result.reason?.includes("Insufficient balance")) {
        setCardRejectionReason("Saldo anda dibawah 10rb, harap isi topup dahulu di station");
      } else if (payload.wallet.state === CardState.CHECKED_IN) {
        setCardRejectionReason("Anda sudah melakukan check in");
      } else if (payload.wallet.state === CardState.STATION_OPERATION) {
        setCardRejectionReason("Anda sedang dalam operasi di station");
      } else if (result.reason?.includes("Session expired")) {
        setCardRejectionReason("Sesi telah berakhir");
      } else {
        setCardRejectionReason(result.reason ?? "Tidak dapat check-in");
      }
      return;
    }

    // Step 4: All checks passed — perform check-in write
    autoCheckinTriggered.current = true;
    setCardRejectionReason(null);
    write(applyCheckin(payload, terminalId, nowSeconds), "checkin");
  }, [
    state.phase,
    state.payload,
    blockedCheck.isChecking,
    blockedCheck.isBlocked,
    blockedCheck.isReady,
    write,
    terminalId,
    getNowSeconds,
    enforce24hLimit,
  ]);

  // Keep a ref to syncEngine so the auto-reset effect doesn't re-run when it changes
  const syncEngineRef = useRef(syncEngine);
  useEffect(() => {
    syncEngineRef.current = syncEngine;
  }, [syncEngine]);

  // Notify sync engine on success (auto-reset is handled by FeedbackCard autoClose)
  useEffect(() => {
    if (state.phase !== "success") return;

    // Notify sync engine that an Outbox write occurred (triggers debounced sync)
    syncEngineRef.current?.notifyMutation();

    // Trigger immediate sync push for check-in (bypass 5s debounce)
    if (state.payload) {
      const cardIdHex = Array.from(state.payload.header.cardId)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      notifyCheckin(cardIdHex, Date.now());
    }
  }, [state.phase, state.payload]);

  // Auto-reset after transient post-write read errors (shorter delay)
  useEffect(() => {
    if (state.phase !== "error") return;
    // Only auto-reset for the specific transient read error message
    if (state.error?.includes("Lepas kartu sebentar")) {
      const timer = setTimeout(() => {
        reset();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.phase, state.error, reset]);

  // Reset per-cycle state when going back to idle
  useEffect(() => {
    if (state.phase === "idle") {
      autoCheckinTriggered.current = false;
      setCardRejectionReason(null);
    }
  }, [state.phase]);

  function handleRetry() {
    autoCheckinTriggered.current = false;
    setCardRejectionReason(null);
    setTamperDisableAutoScan(false);
    retryScan();
  }

  // Derive the effective blocked reason (from on-card status/balance OR from local DB check)
  // Exclude "already checked in" reasons — those get their own friendly UI path
  const effectiveBlockedReason =
    cardRejectionReason === "Anda sudah melakukan check in" ||
    cardRejectionReason === "Anda sedang dalam operasi di station"
      ? null
      : (cardRejectionReason ?? blockedCheck.blockedReason);

  const cardState = state.payload?.wallet.state;
  const isAlreadyCheckedIn =
    cardState === CardState.CHECKED_IN || cardState === CardState.STATION_OPERATION;

  // blockedCheckDone equivalent: the check is no longer in progress
  const blockedCheckDone = !blockedCheck.isChecking && state.phase === "ready";

  // Auto-reset when card is already checked in (no write needed) so auto-scan loop continues
  const showAlreadyCheckedIn = isAlreadyCheckedIn && state.phase === "ready" && blockedCheckDone;
  const showBlocked =
    !!effectiveBlockedReason && state.phase === "ready" && !blockedCheck.isChecking;

  useEffect(() => {
    if (showAlreadyCheckedIn || showBlocked) {
      const timer = setTimeout(() => {
        reset();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showAlreadyCheckedIn, showBlocked, reset]);

  function renderReadyContent(payload: NonNullable<typeof state.payload>) {
    if (blockedCheck.isChecking && state.phase === "ready") {
      return <p className="type-body2 text-muted-foreground animate-pulse">Memproses...</p>;
    }
    if (effectiveBlockedReason && state.phase === "ready") {
      return (
        <FeedbackCard
          variant="blocked"
          title="Akses Ditolak"
          subtitle={payload.identity.name}
          actions={[{ label: "Selesai", onClick: reset, variant: "outline" }]}
        />
      );
    }
    if (isAlreadyCheckedIn && state.phase === "ready" && blockedCheckDone) {
      return (
        <FeedbackCard
          variant="warning"
          title="Sudah Check-in"
          subtitle={`${payload.identity.name} sudah dalam status masuk.`}
          actions={[{ label: "Selesai", onClick: reset, variant: "outline" }]}
        />
      );
    }
    return <p className="type-body2 text-muted-foreground animate-pulse">Memproses check-in...</p>;
  }

  return (
    <>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        {!grant && !loading && (
          <div className="w-full max-w-xs rounded-xl bg-signal-bg-error border border-signal-error/30 p-4">
            <p className="type-body1 text-signal-error text-center">Tidak ada sesi aktif.</p>
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

        {/* Ready — auto-checkin in progress or card already checked in */}
        {(state.phase === "ready" || state.phase === "writing") && state.payload && (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            <NfcTapArea phase={state.phase === "writing" ? "writing" : "validating"} />
            {renderReadyContent(state.payload)}
          </div>
        )}

        {/* Success */}
        {state.phase === "success" && state.payload && (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            <NfcTapArea phase="success" />

            <FeedbackCard
              variant="success"
              title="Check-in Berhasil"
              subtitle={state.payload.identity.name}
              details={[{ label: "Status", value: "Selamat datang!" }]}
              autoClose={2500}
              onClose={reset}
            />
            <p className="text-sm text-muted-foreground animate-pulse">Menutup otomatis...</p>
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
              actions={[{ label: "Coba Lagi", onClick: handleRetry }]}
            />
          </div>
        )}
      </div>

      {/* Simulation mode toggle & date+time picker */}
      <div className="border-t bg-white/80 px-4 py-3 space-y-2">
        <button
          type="button"
          onClick={() => setSimulationMode((v) => !v)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Clock className="size-4" />
          <span>{simulationMode ? "Mode Simulasi Aktif" : "Mode Simulasi"}</span>
        </button>
        {simulationMode && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label
                htmlFor="sim-datetime"
                className="text-sm text-muted-foreground whitespace-nowrap"
              >
                Waktu check-in:
              </label>
              <Input
                id="sim-datetime"
                type="datetime-local"
                value={simulatedDateTime}
                onChange={(e) => setSimulatedDateTime(e.target.value)}
                className="w-auto"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
