import { useState, useEffect, useRef, useCallback } from "react";
import { Clock } from "lucide-react";
import { useNfcCard } from "../../hooks/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { useSyncEngineContext } from "../../hooks/SyncEngineContext";
import { validateTransition, applyCheckin } from "../../core/state-machine/engine";
import { CardState, CardStatus } from "../../core/payload/types";
import { checkLocalBlockedStatus } from "../../core/nfc/localStatusCheck";
import { notifyCheckin } from "../../lib/peerSyncCoordinator";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { LoadingState } from "../block/LoadingState";
import { KioskLayout } from "../layout/KioskLayout";
import { NfcTapArea, NfcStatusLabel } from "../block/NfcTapArea";

interface GateSectionProps {
  tenantId: string;
  tenantName: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
}

export function GateSection({
  tenantId,
  tenantName,
  accountId,
  deviceId,
  terminalId,
}: GateSectionProps) {
  const { grant, loading } = useSessionGrant(tenantId, accountId, deviceId, "gate");
  const { state, scan, write, reset } = useNfcCard(grant, tenantId, terminalId);
  const syncEngine = useSyncEngineContext();

  // Simulation mode: date+time picker
  const [simulationMode, setSimulationMode] = useState(false);
  const [simulatedDateTime, setSimulatedDateTime] = useState(() => {
    const now = new Date();
    // Format: YYYY-MM-DDTHH:MM for datetime-local input
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  // 24-hour max checkout enforcement (default: enabled)
  const [enforce24hLimit, setEnforce24hLimit] = useState(true);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  // Track whether we already triggered auto-checkin for this scan cycle
  const autoCheckinTriggered = useRef(false);

  // Get the current timestamp (real or simulated)
  const getNowSeconds = useCallback(() => {
    if (simulationMode && simulatedDateTime) {
      const simDate = new Date(simulatedDateTime);
      if (!isNaN(simDate.getTime())) {
        return Math.floor(simDate.getTime() / 1000);
      }
    }
    return Math.floor(Date.now() / 1000);
  }, [simulationMode, simulatedDateTime]);

  // Auto check-in when card is ready — no confirmation needed
  useEffect(() => {
    if (state.phase !== "ready" || !state.payload || autoCheckinTriggered.current) return;

    const payload = state.payload;
    const nowSeconds = getNowSeconds();

    // Check card status from payload (on-card status)
    if (payload.identity.status !== CardStatus.ACTIVE) {
      autoCheckinTriggered.current = true;
      const statusNames: Record<number, string> = {
        [CardStatus.BLOCKED_TAMPER]: "Kartu diblokir: terdeteksi manipulasi",
        [CardStatus.BLOCKED_FRAUD]: "Kartu diblokir: terdeteksi penipuan",
        [CardStatus.BLOCKED_EXPIRED]: "Kartu diblokir: kadaluarsa",
        [CardStatus.BLOCKED_ADMIN]: "Kartu diblokir oleh admin",
      };
      setBlockedReason(statusNames[payload.identity.status] ?? "Kartu tidak aktif");
      return;
    }

    // Also check local DB for blocked card or suspended member
    // Uses hardware serial number (state.serialNumber) as the correct lookup key
    // serialNumber is always present when phase is "ready" (set during scan)
    if (!state.serialNumber) return;

    checkLocalBlockedStatus(tenantId, state.serialNumber, payload.identity.userId).then(
      (statusResult) => {
        if (statusResult.blocked) {
          autoCheckinTriggered.current = true;
          setBlockedReason(statusResult.reason);
          return;
        }

        // Proceed with normal transition validation
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
          return;
        }

        // Minimum balance check: reject check-in if balance < 10,000
        if (payload.wallet.balance < 10_000) {
          autoCheckinTriggered.current = true;
          setBlockedReason("Saldo anda dibawah 10rb, harap isi topup dahulu di station");
          return;
        }

        autoCheckinTriggered.current = true;
        setBlockedReason(null);
        write(applyCheckin(payload, terminalId, nowSeconds), "checkin");
      },
    );
  }, [
    state.phase,
    state.payload,
    state.serialNumber,
    write,
    terminalId,
    getNowSeconds,
    tenantId,
    enforce24hLimit,
  ]);

  // Keep a ref to syncEngine so the auto-reset effect doesn't re-run when it changes
  const syncEngineRef = useRef(syncEngine);
  useEffect(() => {
    syncEngineRef.current = syncEngine;
  }, [syncEngine]);

  // Auto-reset after success
  useEffect(() => {
    if (state.phase !== "success") return;

    // Notify sync engine that an Outbox write occurred (triggers debounced sync)
    syncEngineRef.current?.notifyMutation();

    // Trigger immediate sync push for check-in (bypass 5s debounce) — Req 9.1, 9.2
    if (state.payload) {
      const cardIdHex = Array.from(state.payload.header.cardId)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      notifyCheckin(cardIdHex, Date.now());
    }

    const timer = setTimeout(() => {
      reset();
    }, 2500);
    return () => clearTimeout(timer);
  }, [state.phase, state.payload, reset]);

  // Reset the auto-checkin flag when going back to idle
  useEffect(() => {
    if (state.phase === "idle") {
      autoCheckinTriggered.current = false;
      setBlockedReason(null);
    }
  }, [state.phase]);

  function handleScan() {
    autoCheckinTriggered.current = false;
    setBlockedReason(null);
    scan();
  }

  const cardState = state.payload?.wallet.state;
  const isAlreadyCheckedIn =
    cardState === CardState.CHECKED_IN || cardState === CardState.STATION_OPERATION;

  return (
    <KioskLayout
      title="Gerbang Masuk"
      subtitle="Check-in"
      tenantName={tenantName}
      tenantId={tenantId}
      currentMode="gate"
    >
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        {!grant && !loading && (
          <div className="w-full max-w-xs rounded-xl bg-signal-bg-error border border-signal-error/30 p-4">
            <p className="type-body1 text-signal-error text-center">Tidak ada sesi aktif.</p>
          </div>
        )}

        {/* Idle — tap to scan */}
        {state.phase === "idle" && (
          <div className="flex flex-col items-center gap-6">
            <NfcTapArea
              phase="idle"
              onClick={handleScan}
              disabled={!grant || loading}
              label="Tap untuk Masuk"
            />
            <Button
              onClick={handleScan}
              disabled={!grant || loading}
              className="w-full max-w-xs h-12 bg-brand-dark hover:bg-brand-dark/90 text-white type-title-bold"
            >
              {loading ? (
                <LoadingState variant="button" text="Memuat sesi..." />
              ) : (
                "Tap Kartu untuk Check-in"
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

        {/* Ready — auto-checkin in progress or card already checked in */}
        {(state.phase === "ready" || state.phase === "writing") && state.payload && (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            <NfcTapArea phase={state.phase === "writing" ? "writing" : "validating"} />
            {blockedReason && state.phase === "ready" ? (
              <div className="bg-white rounded-2xl border border-destructive/30 p-4 space-y-3 text-center w-full">
                <p className="type-body1-bold text-destructive">⛔ Akses Ditolak</p>
                <p className="type-body2 text-muted-foreground">{blockedReason}</p>
                <p className="type-body2 text-muted-foreground">{state.payload.identity.name}</p>
                <Button variant="outline" onClick={reset} className="w-full">
                  Selesai
                </Button>
              </div>
            ) : isAlreadyCheckedIn && state.phase === "ready" ? (
              <div className="bg-white rounded-2xl border p-4 space-y-3 text-center w-full">
                <p className="type-body1-bold text-signal-warning">Sudah Check-in</p>
                <p className="type-body2 text-muted-foreground">
                  {state.payload.identity.name} sudah dalam status masuk.
                </p>
                <Button variant="outline" onClick={reset} className="w-full">
                  Selesai
                </Button>
              </div>
            ) : (
              <p className="type-body2 text-muted-foreground animate-pulse">
                Memproses check-in...
              </p>
            )}
          </div>
        )}

        {/* Success */}
        {state.phase === "success" && state.payload && (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            <NfcTapArea phase="success" />
            <div className="bg-white rounded-2xl border p-4 space-y-2 text-center w-full">
              <p className="type-title-bold text-signal-valid">✓ Check-in Berhasil</p>
              <p className="type-body1 text-foreground">{state.payload.identity.name}</p>
              <p className="type-body2 text-muted-foreground">Selamat datang!</p>
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
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={enforce24hLimit}
                onChange={(e) => setEnforce24hLimit(e.target.checked)}
                className="rounded border-gray-300"
              />
              Batasi maks 24 jam checkout
            </label>
          </div>
        )}
      </div>
    </KioskLayout>
  );
}
