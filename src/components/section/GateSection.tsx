import { useState, useEffect, useRef, useCallback } from "react";
import { Clock } from "lucide-react";
import { useNfcCard } from "../../hooks/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { validateTransition, applyCheckin } from "../../core/state-machine/engine";
import { CardState } from "../../core/payload/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
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

  // Simulation mode: time picker
  const [simulationMode, setSimulationMode] = useState(false);
  const [simulatedTime, setSimulatedTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  // Track whether we already triggered auto-checkin for this scan cycle
  const autoCheckinTriggered = useRef(false);

  // Get the current timestamp (real or simulated)
  const getNowSeconds = useCallback(() => {
    if (simulationMode && simulatedTime) {
      const [hours, minutes] = simulatedTime.split(":").map(Number);
      const simDate = new Date();
      simDate.setHours(hours, minutes, 0, 0);
      return Math.floor(simDate.getTime() / 1000);
    }
    return Math.floor(Date.now() / 1000);
  }, [simulationMode, simulatedTime]);

  // Auto check-in when card is ready — no confirmation needed
  useEffect(() => {
    if (state.phase !== "ready" || !state.payload || autoCheckinTriggered.current) return;

    const payload = state.payload;
    const nowSeconds = getNowSeconds();
    const result = validateTransition(payload, "gate_checkin", nowSeconds);

    if (!result.valid) {
      // Card can't check in (already checked in, or invalid state)
      autoCheckinTriggered.current = true;
      return;
    }

    autoCheckinTriggered.current = true;
    write(applyCheckin(payload, terminalId, nowSeconds));
  }, [state.phase, state.payload, write, terminalId, getNowSeconds]);

  // Auto-reset after success
  useEffect(() => {
    if (state.phase === "success") {
      const timer = setTimeout(() => {
        reset();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [state.phase, reset]);

  // Reset the auto-checkin flag when going back to idle
  useEffect(() => {
    if (state.phase === "idle") {
      autoCheckinTriggered.current = false;
    }
  }, [state.phase]);

  function handleScan() {
    autoCheckinTriggered.current = false;
    scan();
  }

  const cardState = state.payload?.wallet.state;
  const isAlreadyCheckedIn =
    cardState === CardState.CHECKED_IN || cardState === CardState.TERMINAL_OPERATION;

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
                <>
                  <Spinner size="sm" className="text-white" /> Memuat sesi...
                </>
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
            {isAlreadyCheckedIn && state.phase === "ready" ? (
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

      {/* Simulation mode toggle & time picker */}
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
          <div className="flex items-center gap-2">
            <label htmlFor="sim-time" className="text-sm text-muted-foreground whitespace-nowrap">
              Waktu check-in:
            </label>
            <Input
              id="sim-time"
              type="time"
              value={simulatedTime}
              onChange={(e) => setSimulatedTime(e.target.value)}
              className="w-auto"
            />
          </div>
        )}
      </div>
    </KioskLayout>
  );
}
