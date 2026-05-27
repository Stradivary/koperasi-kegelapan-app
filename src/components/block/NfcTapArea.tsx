import { useEffect, useRef } from "react";
import { triggerHaptic } from "#/lib/haptics";
import tapNfcImg from "#/assets/images/nfc/tap_nfc.jpeg";
import successPhoneImg from "#/assets/images/landing/success_phone.png";
import failedImg from "#/assets/images/nfc/failed.svg";
import tamperImg from "#/assets/images/nfc/tamper.svg";

type NfcPhase = "idle" | "scanning" | "validating" | "ready" | "writing" | "success" | "error";

interface NfcTapAreaProps {
  phase: NfcPhase;
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
  sublabel?: string;
  tamperDetected?: boolean;
}

const phaseConfig = {
  idle: {
    border: "border-brand/30 border-dashed",
    bg: "bg-white",
    iconColor: "text-brand",
    ringClass: "",
    label: "Tempelkan Kartu",
    sublabel: "Dekatkan ke area NFC",
  },
  scanning: {
    border: "border-brand",
    bg: "bg-brand/5",
    iconColor: "text-brand",
    ringClass: "nfc-ring-pulse",
    label: "Menunggu kartu...",
    sublabel: "Jangan pindahkan perangkat",
  },
  validating: {
    border: "border-brand",
    bg: "bg-brand/5",
    iconColor: "text-brand",
    ringClass: "nfc-ring-pulse",
    label: "Memvalidasi...",
    sublabel: "Jangan pindahkan kartu",
  },
  ready: {
    border: "border-signal-valid",
    bg: "bg-signal-bg-valid",
    iconColor: "text-signal-valid",
    ringClass: "",
    label: "Kartu Siap",
    sublabel: "Pilih tindakan",
  },
  writing: {
    border: "border-signal-warning",
    bg: "bg-signal-bg-warning",
    iconColor: "text-signal-warning",
    ringClass: "nfc-ring-spin",
    label: "Memproses...",
    sublabel: "Jangan pindahkan kartu",
  },
  success: {
    border: "border-signal-valid",
    bg: "bg-signal-bg-valid",
    iconColor: "text-signal-valid",
    ringClass: "",
    label: "Berhasil",
    sublabel: "",
  },
  error: {
    border: "border-signal-error",
    bg: "bg-signal-bg-error",
    iconColor: "text-signal-error",
    ringClass: "nfc-shake",
    label: "Gagal",
    sublabel: "Coba lagi",
  },
};

/** Maps NFC phase to the aria-label text describing the current action */
function getAriaLabel(phase: NfcPhase, label?: string): string {
  if (label) return label;
  switch (phase) {
    case "idle":
      return "Tempelkan Kartu";
    case "scanning":
      return "Menunggu kartu";
    case "validating":
      return "Memvalidasi";
    case "ready":
      return "Kartu Siap";
    case "writing":
      return "Memproses";
    case "success":
      return "Berhasil";
    case "error":
      return "Gagal";
  }
}

export function NfcTapArea({
  phase,
  onClick,
  disabled,
  label,
  sublabel,
  tamperDetected,
}: Readonly<NfcTapAreaProps>) {
  const config = phaseConfig[phase];
  const displayLabel = tamperDetected ? "⚠ Kartu terdeteksi rusak" : (label ?? config.label);
  const displaySublabel = sublabel ?? config.sublabel;
  const prevPhaseRef = useRef<NfcPhase>(phase);

  // Haptic feedback on phase transitions
  useEffect(() => {
    if (prevPhaseRef.current === phase) return;
    prevPhaseRef.current = phase;

    switch (phase) {
      case "scanning":
      case "validating":
      case "writing":
        triggerHaptic("intermediate");
        break;
      case "success":
        triggerHaptic("success");
        break;
      case "error":
        triggerHaptic("error");
        break;
    }
  }, [phase]);

  const isBusy = phase === "scanning" || phase === "validating" || phase === "writing";

  // ── Illustration phases: full-size image, no circle container ──────────────
  if (phase === "idle") {
    return (
      <button
        aria-label={getAriaLabel(phase, label)}
        onClick={onClick}
        disabled={disabled}
        className={[
          "flex flex-col items-center gap-3 focus:outline-none transition-all duration-200",
          disabled ? "opacity-50 cursor-default" : "cursor-pointer active:scale-95",
        ].join(" ")}
      >
        <img
          src={tapNfcImg}
          alt="Tap kartu NFC"
          className="w-40 h-40 object-cover rounded-2xl shadow-md"
          aria-hidden="true"
        />
        <span className={["type-body1-bold text-center", config.iconColor].join(" ")}>
          {displayLabel}
        </span>
        {displaySublabel && (
          <span className="type-body2 text-signal-text-secondary text-center -mt-1">
            {displaySublabel}
          </span>
        )}
      </button>
    );
  }

  if (phase === "success") {
    return (
      <div className="flex flex-col items-center gap-3">
        <img
          src={successPhoneImg}
          alt="Berhasil"
          className="w-40 h-40 object-contain drop-shadow-md"
          aria-hidden="true"
        />
        <span className={["type-body1-bold text-center", config.iconColor].join(" ")}>
          {displayLabel}
        </span>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className={["flex flex-col items-center gap-3 nfc-shake"].join(" ")}>
        <img
          src={tamperDetected ? tamperImg : failedImg}
          alt={tamperDetected ? "Kartu rusak" : "Gagal"}
          className="w-40 h-40 object-contain drop-shadow-md"
          aria-hidden="true"
        />
        <span className={["type-body1-bold text-center", config.iconColor].join(" ")}>
          {displayLabel}
        </span>
        {displaySublabel && (
          <span className="type-body2 text-signal-text-secondary text-center -mt-1">
            {displaySublabel}
          </span>
        )}
      </div>
    );
  }

  // ── Active NFC phases: circle indicator with ring animation ────────────────
  return (
    <div
      aria-label={getAriaLabel(phase, label)}
      aria-busy={isBusy}
      className={[
        "relative flex flex-col items-center justify-center gap-3",
        "w-48 h-48 rounded-full border-2 transition-all duration-300",
        config.bg,
        config.border,
      ].join(" ")}
    >
      {/* Outer pulse ring */}
      {(phase === "scanning" || phase === "validating") && (
        <span
          className={[
            "absolute inset-0 rounded-full border-2 border-brand/20",
            config.ringClass,
          ].join(" ")}
        />
      )}
      {phase === "writing" && (
        <span className="absolute inset-0 rounded-full border-2 border-signal-warning/20 nfc-ring-spin" />
      )}

      {/* NFC wave icon */}
      <span className={["transition-colors", config.iconColor].join(" ")}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={
            phase === "scanning" || phase === "validating" || phase === "writing"
              ? "animate-pulse"
              : ""
          }
          aria-hidden="true"
        >
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M1.42 9a16 16 0 0 1 21.16 0" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <circle cx="12" cy="20" r="1" fill="currentColor" />
        </svg>
      </span>

      {/* Label */}
      <span className={["type-body2-bold text-center px-2", config.iconColor].join(" ")}>
        {displayLabel}
      </span>
      {displaySublabel && (
        <span className="type-body2 text-signal-text-secondary text-center px-2 -mt-1">
          {displaySublabel}
        </span>
      )}
    </div>
  );
}

interface NfcStatusLabelProps {
  phase: NfcPhase;
  error?: string | null;
  tamperDetected?: boolean;
}

export function NfcStatusLabel({ phase, error, tamperDetected }: Readonly<NfcStatusLabelProps>) {
  if (phase === "error") {
    return (
      <p className="type-body2 text-signal-error text-center">
        {tamperDetected ? "⚠ Kartu terdeteksi rusak" : (error ?? "Gagal membaca kartu")}
      </p>
    );
  }
  if (phase === "scanning") {
    return (
      <p className="type-body2 text-signal-text-secondary text-center animate-pulse">
        Menunggu kartu NFC...
      </p>
    );
  }
  if (phase === "writing") {
    return (
      <p className="type-body2 text-signal-warning text-center animate-pulse">
        Menulis kartu, jangan pindahkan...
      </p>
    );
  }
  return null;
}
