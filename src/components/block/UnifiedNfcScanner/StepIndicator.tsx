import { Check } from "lucide-react";

import { cn } from "#/lib/utils.ts";
import type { NfcPhase } from "#/core/nfc/stateMachine.ts";

// ============================================================================
// Types
// ============================================================================

interface StepIndicatorProps {
  /** Current NFC operation phase */
  phase: NfcPhase;
  /** Custom labels for each step */
  labels?: {
    step1?: string;
    step2?: string;
    step3?: string;
    step4?: string;
  };
  className?: string;
}

// ============================================================================
// Step Configuration
// ============================================================================

interface StepConfig {
  label: string;
  key: string;
}

const DEFAULT_STEPS: StepConfig[] = [
  { label: "Tap Kartu", key: "step1" },
  { label: "Kartu Ditemukan", key: "step2" },
  { label: "Tulis Kartu", key: "step3" },
  { label: "Selesai", key: "step4" },
];

/**
 * Maps NfcPhase to the active step index (0-based).
 *
 * Step 0: "Tap Kartu" → active during idle/scanning
 * Step 1: "Kartu Ditemukan" → active during classifying/validating/ready
 * Step 2: "Tulis Kartu" → active during writing
 * Step 3: "Selesai" → active during success
 */
function getActiveStepIndex(phase: NfcPhase): number {
  switch (phase) {
    case "idle":
    case "scanning":
      return 0;
    case "classifying":
    case "validating":
    case "ready":
      return 1;
    case "writing":
    case "write_pending_retry":
      return 2;
    case "success":
      return 3;
    case "error":
      // On error, keep the last active step highlighted
      return -1;
    default:
      return 0;
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * StepIndicator displays progress through multi-step NFC operations.
 *
 * Shows a horizontal step indicator with numbered circles, connecting lines,
 * checkmarks for completed steps, and highlights for the current step.
 *
 * @see Requirements 15.1, 15.2, 15.3, 15.4, 15.5
 */
function StepIndicator({ phase, labels, className }: Readonly<StepIndicatorProps>) {
  const activeIndex = getActiveStepIndex(phase);

  const steps = DEFAULT_STEPS.map((step) => ({
    ...step,
    label: labels?.[step.key as keyof typeof labels] ?? step.label,
  }));

  return (
    <nav
      aria-label="Langkah operasi NFC"
      className={cn("flex items-center justify-between w-full", className)}
    >
      {steps.map((step, index) => {
        const isCompleted = activeIndex > index;
        const isCurrent = activeIndex === index;

        let stepAriaLabel: string;
        if (isCompleted) {
          stepAriaLabel = `${step.label} - selesai`;
        } else if (isCurrent) {
          stepAriaLabel = `${step.label} - sedang berlangsung`;
        } else {
          stepAriaLabel = `${step.label} - belum dimulai`;
        }

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1">
              <div
                aria-current={isCurrent ? "step" : undefined}
                aria-label={stepAriaLabel}
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-all duration-300",
                  isCompleted && "bg-signal-valid text-white",
                  isCurrent && "bg-brand text-white ring-2 ring-brand/30",
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground",
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-xs text-center whitespace-nowrap transition-colors duration-300",
                  isCompleted && "text-signal-valid font-medium",
                  isCurrent && "text-brand font-medium",
                  !isCompleted && !isCurrent && "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connecting line (not after last step) */}
            {index < steps.length - 1 && (
              <div
                aria-hidden="true"
                className={cn(
                  "flex-1 h-0.5 mx-2 mb-5 transition-colors duration-300",
                  activeIndex > index ? "bg-signal-valid" : "bg-muted",
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

export { StepIndicator };
export type { StepIndicatorProps };
