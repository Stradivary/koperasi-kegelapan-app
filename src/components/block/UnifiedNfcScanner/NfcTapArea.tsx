import { Wifi } from "lucide-react";

import { cn } from "#/lib/utils.ts";
import type { NfcPhase } from "#/core/nfc/stateMachine.ts";
import tapNfcImg from "#/assets/images/nfc/tap_nfc.jpeg";

// ============================================================================
// Types
// ============================================================================

export interface NfcTapAreaProps {
  /** Current NFC operation phase */
  phase: NfcPhase;
  /** Custom labels for each phase */
  labels?: {
    idle?: string;
    scanning?: string;
    classifying?: string;
    validating?: string;
    writing?: string;
    write_pending_retry?: string;
  };
}

// ============================================================================
// Phase Configuration
// ============================================================================

const DEFAULT_LABELS: Record<string, string> = {
  idle: "Tempelkan Kartu",
  scanning: "Menunggu kartu...",
  classifying: "Mengidentifikasi kartu...",
  validating: "Memvalidasi kartu...",
  writing: "Menulis kartu...",
  write_pending_retry: "Tempelkan kartu lagi...",
};

interface PhaseVisualConfig {
  border: string;
  bg: string;
  iconColor: string;
  ringClass: string;
  iconAnimation: string;
}

const phaseVisuals: Record<string, PhaseVisualConfig> = {
  idle: {
    border: "border-brand/30 border-dashed",
    bg: "bg-white",
    iconColor: "text-brand",
    ringClass: "",
    iconAnimation: "",
  },
  scanning: {
    border: "border-brand",
    bg: "bg-brand/5",
    iconColor: "text-brand",
    ringClass: "nfc-ring-pulse",
    iconAnimation: "animate-pulse",
  },
  classifying: {
    border: "border-brand",
    bg: "bg-brand/5",
    iconColor: "text-brand",
    ringClass: "nfc-ring-pulse",
    iconAnimation: "animate-spin",
  },
  validating: {
    border: "border-brand",
    bg: "bg-brand/5",
    iconColor: "text-brand",
    ringClass: "nfc-ring-pulse",
    iconAnimation: "animate-spin",
  },
  writing: {
    border: "border-signal-warning",
    bg: "bg-signal-bg-warning",
    iconColor: "text-signal-warning",
    ringClass: "nfc-ring-spin",
    iconAnimation: "animate-pulse",
  },
  write_pending_retry: {
    border: "border-signal-warning",
    bg: "bg-signal-bg-warning",
    iconColor: "text-signal-warning",
    ringClass: "nfc-ring-pulse",
    iconAnimation: "animate-bounce",
  },
  ready: {
    border: "border-signal-valid",
    bg: "bg-signal-bg-valid",
    iconColor: "text-signal-valid",
    ringClass: "",
    iconAnimation: "",
  },
  success: {
    border: "border-signal-valid",
    bg: "bg-signal-bg-valid",
    iconColor: "text-signal-valid",
    ringClass: "",
    iconAnimation: "",
  },
  error: {
    border: "border-signal-error",
    bg: "bg-signal-bg-error",
    iconColor: "text-signal-error",
    ringClass: "nfc-shake",
    iconAnimation: "",
  },
};

// ============================================================================
// Component
// ============================================================================

/**
 * NfcTapArea — Circular tap area for the Unified NFC Scanner.
 *
 * Displays an NFC icon with phase-specific animations and text.
 * - idle: Dashed border, prompts user to tap
 * - scanning: Pulse animation indicating active scan
 * - classifying: Spin animation while identifying card type
 * - validating: Spin animation during payload validation
 * - writing: Warning-colored pulse, prompts user to hold card steady
 *
 * @see Requirements 9.2, 9.3
 */
export function NfcTapArea({ phase, labels }: Readonly<NfcTapAreaProps>) {
  const config = phaseVisuals[phase] ?? phaseVisuals.idle;
  const label = labels?.[phase as keyof typeof labels] ?? DEFAULT_LABELS[phase] ?? "";

  // Only show the label for phases that have tap-area text
  const showLabel =
    phase === "idle" ||
    phase === "scanning" ||
    phase === "classifying" ||
    phase === "validating" ||
    phase === "writing" ||
    phase === "write_pending_retry";

  // ── Idle: full-size illustration, no circle ─────────────────────────────
  if (phase === "idle") {
    return (
      <div
        role="status"
        aria-label={label}
        aria-live="polite"
        className="flex flex-col items-center gap-3"
      >
        <img
          src={tapNfcImg}
          alt="Tap kartu NFC"
          className="w-40 h-40 object-cover rounded-2xl shadow-md"
        />
        {showLabel && (
          <span className={cn("type-body1-bold text-center", config.iconColor)}>{label}</span>
        )}
      </div>
    );
  }

  // ── Active phases: circle indicator ────────────────────────────────────
  return (
    <div
      role="status"
      aria-label={label}
      aria-live="polite"
      className={cn(
        "relative flex flex-col items-center justify-center gap-3",
        "w-48 h-48 rounded-full border-2 transition-all duration-300",
        config.bg,
        config.border,
      )}
    >
      {/* Outer pulse/spin ring */}
      {config.ringClass && (
        <span
          className={cn("absolute inset-0 rounded-full border-2 border-brand/20", config.ringClass)}
          aria-hidden="true"
        />
      )}

      {/* NFC Icon */}
      <span className={cn("transition-colors", config.iconColor)} aria-hidden="true">
        <Wifi size={48} className={config.iconAnimation || undefined} />
      </span>

      {/* Phase label */}
      {showLabel && (
        <span className={cn("type-body2-bold text-center px-2", config.iconColor)}>{label}</span>
      )}
    </div>
  );
}
