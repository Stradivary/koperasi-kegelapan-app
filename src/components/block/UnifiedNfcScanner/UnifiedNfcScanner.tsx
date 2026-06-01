/**
 * UnifiedNfcScanner - Main NFC scanning component.
 *
 * Consolidates multiple NFC implementations into a single, flexible component
 * that supports both drawer (modal) and inline display modes.
 *
 * This component integrates the useUnifiedNfc hook with sub-components
 * (NfcTapArea, StepIndicator, CardInfoDisplay, ActionButtons, RawDataInspector)
 * to provide a complete NFC scanning experience.
 *
 * @module components/block/UnifiedNfcScanner
 * @see Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 20.1, 20.2, 20.3
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, WifiOff, Wrench, XCircle } from "lucide-react";

import type { NfcError } from "#/hooks/types.ts";
import type { PayloadError, OperationHandler } from "#/hooks/types.ts";
import type { NfcPhase } from "#/hooks/types.ts";
import type { RawNfcResult, CardClassification } from "#/hooks/types.ts";
import type { CardPayload, SessionGrant } from "#/hooks/types.ts";
import { useUnifiedNfc } from "#/hooks/useUnifiedNfc.ts";
import { Button } from "#/components/ui/button.tsx";
import { Drawer, DrawerContent } from "#/components/ui/drawer.tsx";

import {
  NfcTapArea,
  StepIndicator,
  CardInfoDisplay,
  ActionButtons,
  RawDataInspector,
  type ActionRenderProps,
} from "./index.ts";

// ============================================================================
// NfcLabels Interface
// ============================================================================

/**
 * All customizable labels for the UnifiedNfcScanner component.
 *
 * Includes labels for phases, classifications, actions, and status messages.
 * All defaults are in Indonesian to match existing app localization.
 *
 * @see Requirements 22.1, 22.2, 22.3, 22.4
 */
export interface NfcLabels {
  // Phase labels
  idle: string;
  scanning: string;
  classifying: string;
  validating: string;
  ready: string;
  writing: string;
  success: string;
  error: string;

  // Classification labels
  empty: string;
  foreign: string;
  invalidFormat: string;
  unknown: string;

  // Action labels
  checkin: string;
  checkout: string;
  retry: string;
  skip: string;
  cancel: string;
  close: string;
  initializeCard: string;
  fixCard: string;
  viewRawData: string;

  // Status labels
  checkedIn: string;
  notCheckedIn: string;
  tamperDetected: string;
  nfcNotSupported: string;
  sessionExpired: string;

  // Continuous scan labels
  continuousScanCountdown: string;
  scanNow: string;
}

// ============================================================================
// Default Labels (Indonesian)
// ============================================================================

/**
 * Default labels in Indonesian for all text content in the scanner.
 *
 * @see Requirements 22.2
 */
export const DEFAULT_LABELS: NfcLabels = {
  // Phase labels
  idle: "Tempelkan Kartu",
  scanning: "Menunggu kartu...",
  classifying: "Mengidentifikasi kartu...",
  validating: "Memvalidasi kartu...",
  ready: "Kartu Siap",
  writing: "Menulis kartu...",
  success: "Berhasil!",
  error: "Gagal",

  // Classification labels
  empty: "Kartu Kosong",
  foreign: "Kartu Tidak Dikenal",
  invalidFormat: "Format Kartu Rusak",
  unknown: "Kartu Tidak Dikenal",

  // Action labels
  checkin: "Masuk",
  checkout: "Keluar",
  retry: "Coba Lagi",
  skip: "Lewati",
  cancel: "Batalkan",
  close: "Tutup",
  initializeCard: "Inisialisasi Kartu",
  fixCard: "Perbaiki Kartu",
  viewRawData: "Lihat Data Mentah",

  // Status labels
  checkedIn: "Sudah Masuk",
  notCheckedIn: "Belum Masuk",
  tamperDetected: "Kartu Terdeteksi Rusak",
  nfcNotSupported: "NFC tidak tersedia di perangkat ini",
  sessionExpired: "Sesi telah berakhir",

  // Continuous scan labels
  continuousScanCountdown: "Scan ulang dalam {countdown} detik...",
  scanNow: "Scan Sekarang",
};

// ============================================================================
// Render Props Interfaces
// ============================================================================

/**
 * Common state passed to all render prop functions.
 * Provides access to scanner state and control functions.
 */
export interface ScannerRenderContext {
  /** Current phase of the NFC state machine */
  phase: NfcPhase;
  /** Decoded card payload (null if not yet read or invalid) */
  payload: CardPayload | null;
  /** Raw NFC scan result */
  rawResult: RawNfcResult | null;
  /** Whether the card is currently checked in */
  isCheckedIn: boolean;
  /** Card classification result */
  classification: CardClassification | null;
  /** Serial number from the raw scan */
  serialNumber: string | null;
  /** Whether tamper was detected */
  tamperDetected: boolean;
  /** Current error (if in error phase) */
  error: (NfcError | PayloadError) | null;
  /** Trigger a new scan */
  scan: () => Promise<void>;
  /** Reset to idle state */
  reset: () => void;
  /** Cancel the current operation */
  cancel: () => void;
}

/**
 * Props passed to renderReady - shown when a card is scanned and ready for action.
 * Use this to render custom card info, balance displays, amount inputs, etc.
 */
export interface ReadyRenderProps extends ScannerRenderContext {
  /** Default card info content (can be rendered alongside custom content) */
  defaultCardInfo: React.ReactNode;
  /** Default action buttons (can be rendered alongside custom content) */
  defaultActions: React.ReactNode;
}

/**
 * Props passed to renderSuccess - shown after a successful operation.
 * Use this to render custom success messages, card details, sync status, etc.
 */
export interface SuccessRenderProps extends ScannerRenderContext {
  /** Default success content (icon + label + countdown) */
  defaultContent: React.ReactNode;
}

/**
 * Props passed to renderError - shown when an error occurs.
 * Use this to render custom error UI, recovery options, etc.
 */
export interface ErrorRenderProps extends ScannerRenderContext {
  /** Default error content (icon + message + action buttons) */
  defaultContent: React.ReactNode;
  /** Retry handler (reset + rescan) */
  onRetry: () => void;
  /** Skip handler (if allowSkip is enabled) */
  onSkip: () => void;
  /** Fix card handler (if onFixCard is provided) */
  onFixCard: () => void;
}

/**
 * Props passed to renderHeader - shown at the top of the drawer.
 * Use this to render custom titles, descriptions, badges, etc.
 */
export interface HeaderRenderProps extends ScannerRenderContext {
  /** Merged labels for reference */
  labels: NfcLabels;
}

/**
 * Props passed to renderFooter - shown at the bottom of the drawer.
 * Use this to render custom footer buttons (cancel, close, retry, etc.)
 */
export interface FooterRenderProps extends ScannerRenderContext {
  /** Merged labels for reference */
  labels: NfcLabels;
  /** Close/cancel handler */
  onClose: () => void;
  /** Retry handler (reset + rescan) */
  onRetry: () => void;
}

// ============================================================================
// Props Interface
// ============================================================================

/**
 * Props for the UnifiedNfcScanner component.
 *
 * @see Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */
export interface UnifiedNfcScannerProps {
  // Display configuration
  /** Display mode: "drawer" for modal, "inline" for embedded */
  displayMode: "drawer" | "inline";
  /** Whether the drawer is open (drawer mode only) */
  open?: boolean;
  /** Callback when drawer open state changes */
  onOpenChange?: (open: boolean) => void;

  // Scan configuration
  /** Scan mode: "raw" for basic scanning, "payload" for full validation */
  scanMode?: "raw" | "payload";
  /** Whether to start scanning automatically on mount/open */
  autoScan?: boolean;
  /** Whether to auto-reset to scanning after success */
  continuousScan?: boolean;
  /** Delay in ms before auto-reset in continuous mode (default: 3000) */
  continuousScanDelay?: number;

  // Session and context
  /** Session grant for encryption/decryption operations */
  sessionGrant?: SessionGrant | null;
  /** Tenant ID for validation */
  tenantId?: string;
  /** Terminal ID for session tracking */
  terminalId?: number;

  // Feature flags
  /** Whether to show the step indicator */
  showSteps?: boolean;
  /** Whether to show raw data inspector */
  showRawData?: boolean;
  /** Whether to show check-in status on card info */
  showCheckInStatus?: boolean;
  /** Whether to allow skipping errors */
  allowSkip?: boolean;
  /** Whether to auto-close drawer on success */
  autoCloseOnSuccess?: boolean;
  /** Delay in ms before auto-close (default: 2000) */
  autoCloseDelay?: number;

  // Callbacks
  /** Callback when a raw scan completes (before payload processing) */
  onRawScan?: (result: RawNfcResult) => void;
  /** Callback when a card is successfully read and validated */
  onCardRead?: (payload: CardPayload, result: RawNfcResult) => void;
  /** Callback when a write operation succeeds */
  onWriteSuccess?: (payload: CardPayload) => void;
  /** Callback when an error occurs */
  onError?: (error: NfcError | PayloadError) => void;
  /** Callback when user skips an error */
  onSkip?: (error: NfcError | PayloadError) => void;
  /** Callback when the scanner is closed */
  onClose?: () => void;

  // Card actions
  /** Callback for check-in operation */
  onCheckin?: (payload: CardPayload) => Promise<CardPayload>;
  /** Callback for check-out operation */
  onCheckout?: (payload: CardPayload) => Promise<CardPayload>;
  /** Callback for card initialization (empty cards) */
  onInitializeCard?: (result: RawNfcResult) => Promise<void>;
  /** Callback for card repair (tampered/invalid cards) */
  onFixCard?: (result: RawNfcResult, payload?: CardPayload) => Promise<void>;

  // Custom operations
  /** Custom operation handlers for extensible business operations */
  operations?: OperationHandler[];

  // Custom rendering
  /** Custom render function for action buttons (ready phase only) */
  renderActions?: (props: ActionRenderProps) => React.ReactNode;
  /** Custom render for the ready phase (replaces default card info + actions) */
  renderReady?: (props: ReadyRenderProps) => React.ReactNode;
  /** Custom render for the success phase (replaces default success UI) */
  renderSuccess?: (props: SuccessRenderProps) => React.ReactNode;
  /** Custom render for the error phase (replaces default error UI) */
  renderError?: (props: ErrorRenderProps) => React.ReactNode;
  /** Custom render for the drawer header (drawer mode only) */
  renderHeader?: (props: HeaderRenderProps) => React.ReactNode;
  /** Custom render for the drawer footer (drawer mode only) */
  renderFooter?: (props: FooterRenderProps) => React.ReactNode;

  // Labels customization
  /** Custom labels to override defaults (merged with DEFAULT_LABELS) */
  labels?: Partial<NfcLabels>;
}

// ============================================================================
// Phase Helpers
// ============================================================================

/** Phases where the NfcTapArea should be displayed */
const TAP_AREA_PHASES: ReadonlySet<NfcPhase> = new Set([
  "idle",
  "scanning",
  "classifying",
  "validating",
  "writing",
  "write_pending_retry",
]);

/** Phases where CardInfoDisplay should be shown */
const CARD_INFO_PHASES: ReadonlySet<NfcPhase> = new Set(["ready"]);

/** Phases where ActionButtons should be shown */
const ACTION_PHASES: ReadonlySet<NfcPhase> = new Set(["ready"]);

/** Phases where the cancel button should be shown */
const CANCEL_PHASES: ReadonlySet<NfcPhase> = new Set([
  "scanning",
  "classifying",
  "validating",
  "writing",
  "write_pending_retry",
]);

// ============================================================================
// Internal Content Component
// ============================================================================

interface ScannerContentProps {
  phase: NfcPhase;
  showSteps: boolean;
  showRawData: boolean;
  showCheckInStatus: boolean;
  isNfcSupported: boolean;
  mergedLabels: NfcLabels;
  state: ReturnType<typeof useUnifiedNfc>["state"];
  scan: () => Promise<void>;
  reset: () => void;
  cancel: () => void;
  retryWrite: () => Promise<boolean>;
  allowSkip: boolean;
  onSkip?: (error: NfcError | PayloadError) => void;
  continuousScan: boolean;
  continuousScanDelay: number;
  onCheckin?: (payload: CardPayload) => Promise<CardPayload>;
  onCheckout?: (payload: CardPayload) => Promise<CardPayload>;
  onInitializeCard?: (result: RawNfcResult) => Promise<void>;
  onFixCard?: (result: RawNfcResult, payload?: CardPayload) => Promise<void>;
  onError?: (error: NfcError | PayloadError) => void;
  renderActions?: (props: ActionRenderProps) => React.ReactNode;
  renderReady?: (props: ReadyRenderProps) => React.ReactNode;
  renderSuccess?: (props: SuccessRenderProps) => React.ReactNode;
  renderError?: (props: ErrorRenderProps) => React.ReactNode;
}

/**
 * Internal content renderer shared between drawer and inline modes.
 * Renders phase-specific UI states.
 *
 * @see Requirements 9.1, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9
 */
function ScannerContent({
  phase,
  showSteps,
  showRawData,
  showCheckInStatus,
  isNfcSupported,
  mergedLabels,
  state,
  scan,
  reset,
  cancel,
  retryWrite,
  allowSkip,
  onSkip,
  continuousScan,
  continuousScanDelay,
  onCheckin,
  onCheckout,
  onInitializeCard,
  onFixCard,
  onError: _onErrorProp,
  renderActions,
  renderReady,
  renderSuccess,
  renderError,
}: Readonly<ScannerContentProps>) {
  const { rawResult, payload, classification, isCheckedIn, error, tamperDetected } = state;

  // Handlers for check-in/check-out actions
  const handleCheckin = () => {
    if (onCheckin && payload) {
      void onCheckin(payload);
    }
  };

  const handleCheckout = () => {
    if (onCheckout && payload) {
      void onCheckout(payload);
    }
  };

  // Handler for card initialization
  const handleInitializeCard = () => {
    if (onInitializeCard && rawResult) {
      void onInitializeCard(rawResult);
    }
  };

  // Handler for retry (reset + rescan)
  const handleRetry = () => {
    reset();
    void scan();
  };

  // Handler for fix card
  const handleFixCard = () => {
    if (onFixCard && rawResult) {
      void onFixCard(rawResult, payload ?? undefined);
    }
  };

  // Handler for skip (error skipping)
  const handleSkip = () => {
    if (onSkip && error) {
      onSkip(error);
    }
    reset();
  };

  // Handler for cancel
  const handleCancel = () => {
    cancel();
  };

  // ============================================================================
  // Shared render context - passed to all render prop functions
  // ============================================================================

  const renderContext: ScannerRenderContext = {
    phase,
    payload,
    rawResult,
    isCheckedIn,
    classification,
    serialNumber: rawResult?.serialNumber ?? null,
    tamperDetected,
    error,
    scan,
    reset,
    cancel,
  };

  // ============================================================================
  // Continuous Scan Mode - countdown and auto-reset
  // @see Requirements 24.1, 24.2, 24.3, 24.4
  // ============================================================================

  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Memoize the scan function to avoid stale closures in the effect
  const handleContinuousScanReset = useCallback(() => {
    setCountdown(null);
    reset();
    void scan();
  }, [reset, scan]);

  const handleManualResetDuringCountdown = useCallback(() => {
    // Clear countdown timers
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (autoResetTimerRef.current) {
      clearTimeout(autoResetTimerRef.current);
      autoResetTimerRef.current = null;
    }
    setCountdown(null);
    reset();
    void scan();
  }, [reset, scan]);

  useEffect(() => {
    if (phase === "success" && continuousScan) {
      const delaySeconds = Math.ceil(continuousScanDelay / 1000);
      setCountdown(delaySeconds);

      // Decrement countdown every second
      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) return null;
          return prev - 1;
        });
      }, 1000);

      // Auto-reset after the full delay
      autoResetTimerRef.current = setTimeout(() => {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        handleContinuousScanReset();
      }, continuousScanDelay);
    }

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      if (autoResetTimerRef.current) {
        clearTimeout(autoResetTimerRef.current);
        autoResetTimerRef.current = null;
      }
    };
  }, [phase, continuousScan, continuousScanDelay, handleContinuousScanReset]);

  // NFC not supported state
  if (!isNfcSupported) {
    return (
      <div className="flex flex-col items-center gap-3 py-6" role="alert" aria-live="polite">
        <WifiOff className="h-16 w-16 text-muted-foreground" aria-hidden="true" />
        <span className="type-body1-bold text-muted-foreground">
          {mergedLabels.nfcNotSupported}
        </span>
      </div>
    );
  }

  return (
    <section className="flex flex-col items-center gap-4 w-full" aria-label="NFC Scanner">
      {/* Step Indicator */}
      {showSteps && (
        <StepIndicator
          phase={phase}
          labels={{
            step1: mergedLabels.idle,
            step2: mergedLabels.ready,
            step3: mergedLabels.writing,
            step4: mergedLabels.success,
          }}
        />
      )}

      {/* NFC Tap Area - shown during scanning-related phases */}
      {TAP_AREA_PHASES.has(phase) && (
        <NfcTapArea
          phase={phase}
          labels={{
            idle: mergedLabels.idle,
            scanning: mergedLabels.scanning,
            classifying: mergedLabels.classifying,
            validating: mergedLabels.validating,
            writing: mergedLabels.writing,
          }}
        />
      )}

      {/* Cancel button - shown during active phases (scanning, classifying, validating, writing) */}
      {CANCEL_PHASES.has(phase) && phase !== "write_pending_retry" && (
        <Button variant="ghost" onClick={handleCancel} aria-label={mergedLabels.cancel}>
          {mergedLabels.cancel}
        </Button>
      )}

      {/* Write Pending Retry - shown when write failed and waiting for re-tap */}
      {phase === "write_pending_retry" && (
        <div className="flex flex-col items-center gap-3 py-4" role="alert" aria-live="assertive">
          <AlertTriangle className="h-12 w-12 text-signal-warning" aria-hidden="true" />
          <span className="type-body1-bold text-signal-warning text-center">
            Penulisan gagal - kartu dipindahkan terlalu cepat
          </span>
          <span className="type-body2 text-muted-foreground text-center">
            Tempelkan kartu lagi untuk menyelesaikan penulisan
          </span>
          <Button variant="default" onClick={() => void retryWrite()} aria-label="Tap ulang kartu">
            Tap Ulang Kartu
          </Button>
          <div className="flex flex-col items-center gap-1 mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              aria-label={mergedLabels.cancel}
            >
              {mergedLabels.cancel}
            </Button>
            <span className="type-caption text-signal-error text-center">
              ⚠️ Membatalkan saat ini dapat menyebabkan data kartu rusak
            </span>
          </div>
        </div>
      )}

      {/* Success State - shown during success phase */}
      {phase === "success" &&
        (() => {
          const defaultContent = (
            <div
              className="flex flex-col items-center gap-3 py-6"
              role="status"
              aria-live="polite"
              aria-label={mergedLabels.success}
            >
              <CheckCircle2 className="h-16 w-16 text-signal-valid" aria-hidden="true" />
              <span className="type-body1-bold text-signal-valid">{mergedLabels.success}</span>

              {/* Continuous scan countdown indicator */}
              {continuousScan && countdown !== null && (
                <div className="flex flex-col items-center gap-2">
                  <span
                    className="type-body2 text-muted-foreground"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {mergedLabels.continuousScanCountdown.replaceAll(
                      "{countdown}",
                      String(countdown),
                    )}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManualResetDuringCountdown}
                    aria-label={mergedLabels.scanNow}
                  >
                    {mergedLabels.scanNow}
                  </Button>
                </div>
              )}
            </div>
          );

          if (renderSuccess) {
            return renderSuccess({ ...renderContext, defaultContent });
          }
          return defaultContent;
        })()}

      {/* Error State - shown during error phase */}
      {phase === "error" &&
        (() => {
          const defaultContent = (
            <div
              className="flex flex-col items-center gap-3 py-6"
              role="alert"
              aria-live="assertive"
            >
              {/* Tamper detection warning */}
              {tamperDetected ? (
                <>
                  <AlertTriangle className="h-16 w-16 text-signal-error" aria-hidden="true" />
                  <span className="type-body1-bold text-signal-error">
                    {mergedLabels.tamperDetected}
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-16 w-16 text-signal-error" aria-hidden="true" />
                  <span className="type-body1-bold text-signal-error">
                    {error?.message ?? mergedLabels.error}
                  </span>
                </>
              )}

              {/* Action buttons for error recovery */}
              <div className="flex gap-2">
                {/* Retry button - only for recoverable errors */}
                {error?.recoverable && (
                  <Button variant="outline" onClick={handleRetry} aria-label={mergedLabels.retry}>
                    {mergedLabels.retry}
                  </Button>
                )}

                {/* Skip button - shown when allowSkip is enabled */}
                {allowSkip && (
                  <Button variant="ghost" onClick={handleSkip} aria-label={mergedLabels.skip}>
                    {mergedLabels.skip}
                  </Button>
                )}

                {/* Fix card button - shown when tamper detected and onFixCard provided */}
                {tamperDetected && onFixCard && (
                  <Button
                    variant="default"
                    onClick={handleFixCard}
                    aria-label={mergedLabels.fixCard}
                  >
                    <Wrench className="size-4" aria-hidden="true" />
                    {mergedLabels.fixCard}
                  </Button>
                )}
              </div>
            </div>
          );

          if (renderError) {
            return renderError({
              ...renderContext,
              defaultContent,
              onRetry: handleRetry,
              onSkip: handleSkip,
              onFixCard: handleFixCard,
            });
          }
          return defaultContent;
        })()}

      {/* Card Info + Actions - shown during ready phase */}
      {CARD_INFO_PHASES.has(phase) &&
        (() => {
          const defaultCardInfo = (
            <CardInfoDisplay
              classification={classification}
              payload={payload}
              serialNumber={rawResult?.serialNumber}
              isCheckedIn={isCheckedIn}
              showCheckInStatus={showCheckInStatus}
              labels={{
                empty: mergedLabels.empty,
                foreign: mergedLabels.foreign,
                invalidFormat: mergedLabels.invalidFormat,
                unknown: mergedLabels.unknown,
                checkedIn: mergedLabels.checkedIn,
                notCheckedIn: mergedLabels.notCheckedIn,
              }}
            />
          );

          const defaultActions = (
            <ActionButtons
              phase={phase}
              classification={classification}
              payload={payload}
              isCheckedIn={isCheckedIn}
              onCheckin={onCheckin ? handleCheckin : undefined}
              onCheckout={onCheckout ? handleCheckout : undefined}
              onInitializeCard={onInitializeCard ? handleInitializeCard : undefined}
              renderActions={renderActions}
              labels={{
                checkin: mergedLabels.checkin,
                checkout: mergedLabels.checkout,
                initializeCard: mergedLabels.initializeCard,
              }}
            />
          );

          if (renderReady) {
            return renderReady({ ...renderContext, defaultCardInfo, defaultActions });
          }

          return (
            <>
              {defaultCardInfo}
              {ACTION_PHASES.has(phase) && defaultActions}
            </>
          );
        })()}

      {/* Raw Data Inspector - shown when enabled and raw result exists */}
      {showRawData && rawResult && (
        <RawDataInspector
          rawResult={rawResult}
          labels={{
            viewRawData: mergedLabels.viewRawData,
          }}
        />
      )}
    </section>
  );
}

// ============================================================================
// Component
// ============================================================================

/**
 * UnifiedNfcScanner - Main NFC scanning component.
 *
 * Integrates the useUnifiedNfc hook with sub-components to provide
 * a complete NFC scanning experience. Supports drawer and inline display modes.
 *
 * - Drawer mode: Wraps content in a Vaul Drawer with open/close state management
 * - Inline mode: Renders content directly in the parent container
 * - Auto-close on success: Automatically closes the drawer after a configurable delay
 *
 * @see Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 20.1, 20.2, 20.3
 */
export function UnifiedNfcScanner({
  displayMode,
  open,
  onOpenChange,
  scanMode = "payload",
  autoScan = false,
  continuousScan = false,
  continuousScanDelay = 3000,
  sessionGrant = null,
  tenantId = "",
  terminalId = 0,
  showSteps = false,
  showRawData = false,
  showCheckInStatus = false,
  allowSkip = false,
  autoCloseOnSuccess = false,
  autoCloseDelay = 2000,
  onRawScan,
  onCardRead,
  onWriteSuccess,
  onError,
  onSkip,
  onClose,
  onCheckin,
  onCheckout,
  onInitializeCard,
  onFixCard,
  operations: _operations,
  renderActions,
  renderReady,
  renderSuccess,
  renderError,
  renderHeader,
  renderFooter,
  labels,
}: Readonly<UnifiedNfcScannerProps>) {
  // Merge custom labels with defaults
  const mergedLabels: NfcLabels = { ...DEFAULT_LABELS, ...labels };

  // Integrate with the useUnifiedNfc hook
  const { state, scan, reset, cancel, retryWrite, isNfcSupported } = useUnifiedNfc({
    sessionGrant,
    tenantId,
    terminalId,
    scanMode,
    onRawScan,
    onCardRead,
    onWriteSuccess,
    onError,
  });

  const { phase } = state;

  // ============================================================================
  // Auto-close on success (drawer mode only)
  // @see Requirements 20.1, 20.2, 20.3
  // ============================================================================

  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Only auto-close in drawer mode when enabled and phase is success
    if (displayMode === "drawer" && autoCloseOnSuccess && phase === "success") {
      autoCloseTimerRef.current = setTimeout(() => {
        onOpenChange?.(false);
        onClose?.();
      }, autoCloseDelay);
    }

    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, [displayMode, autoCloseOnSuccess, phase, autoCloseDelay, onOpenChange, onClose]);

  // ============================================================================
  // Auto-scan on mount/open
  // @see Requirements 11.1, 11.2, 11.3, 11.4
  // ============================================================================

  const autoScanTriggeredRef = useRef(false);

  useEffect(() => {
    if (!autoScan || !isNfcSupported) return;

    // For inline mode: scan on mount
    if (displayMode === "inline" && !autoScanTriggeredRef.current) {
      autoScanTriggeredRef.current = true;
      void scan();
      return;
    }

    // For drawer mode: scan when opened
    if (displayMode === "drawer" && open && !autoScanTriggeredRef.current) {
      autoScanTriggeredRef.current = true;
      void scan();
    }

    // Reset trigger when drawer closes so it can re-trigger on next open
    if (displayMode === "drawer" && !open) {
      autoScanTriggeredRef.current = false;
    }
  }, [autoScan, isNfcSupported, displayMode, open, scan]);

  // ============================================================================
  // Shared content props
  // ============================================================================

  const contentProps: ScannerContentProps = {
    phase,
    showSteps,
    showRawData,
    showCheckInStatus,
    isNfcSupported,
    mergedLabels,
    state,
    scan,
    reset,
    cancel,
    retryWrite,
    allowSkip,
    onSkip,
    continuousScan,
    continuousScanDelay,
    onCheckin,
    onCheckout,
    onInitializeCard,
    onFixCard,
    onError,
    renderActions,
    renderReady,
    renderSuccess,
    renderError,
  };

  // ============================================================================
  // Drawer display mode
  // @see Requirements 8.1, 8.3
  // ============================================================================

  if (displayMode === "drawer") {
    const handleOpenChange = (isOpen: boolean) => {
      onOpenChange?.(isOpen);
      if (!isOpen) {
        onClose?.();
      }
    };

    // Build render context for header/footer
    const drawerRenderContext: ScannerRenderContext = {
      phase,
      payload: state.payload,
      rawResult: state.rawResult,
      isCheckedIn: state.isCheckedIn,
      classification: state.classification,
      serialNumber: state.rawResult?.serialNumber ?? null,
      tamperDetected: state.tamperDetected,
      error: state.error,
      scan,
      reset,
      cancel,
    };

    const handleRetry = () => {
      reset();
      void scan();
    };

    const handleClose = () => {
      onOpenChange?.(false);
      onClose?.();
    };

    return (
      <Drawer open={open} onOpenChange={handleOpenChange} direction="bottom">
        <DrawerContent>
          {renderHeader && (
            <div className="px-4 pt-4 pb-2">
              {renderHeader({ ...drawerRenderContext, labels: mergedLabels })}
            </div>
          )}
          <div className="p-4">
            <ScannerContent {...contentProps} />
          </div>
          {renderFooter && (
            <div className="px-4 pb-4 pt-2">
              {renderFooter({
                ...drawerRenderContext,
                labels: mergedLabels,
                onClose: handleClose,
                onRetry: handleRetry,
              })}
            </div>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  // ============================================================================
  // Inline display mode
  // @see Requirements 8.2, 8.4
  // ============================================================================

  return <ScannerContent {...contentProps} />;
}
