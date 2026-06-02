import { LogIn, LogOut, CreditCard } from "lucide-react";

import { cn } from "#/presentation/lib/utils";
import { Button } from "#/presentation/components/ui/button.tsx";
import {
  CardStatus,
  type CardPayload,
  type NfcPhase,
  type CardClassification,
} from "#/presentation/hooks/types.ts";

// ============================================================================
// Types
// ============================================================================

export interface ActionRenderProps {
  phase: NfcPhase;
  classification: CardClassification | null;
  payload: CardPayload | null;
  isCheckedIn: boolean;
  onCheckin: () => void;
  onCheckout: () => void;
}

export interface ActionButtonsProps {
  /** Current NFC operation phase */
  phase: NfcPhase;
  /** Classification of the scanned card */
  classification: CardClassification | null;
  /** Decoded card payload (for valid_payload cards) */
  payload: CardPayload | null;
  /** Whether the card is currently checked in */
  isCheckedIn: boolean;
  /** Callback for check-in action */
  onCheckin?: () => void;
  /** Callback for check-out action */
  onCheckout?: () => void;
  /** Callback for card initialization action */
  onInitializeCard?: () => void;
  /** Custom render function for action buttons */
  renderActions?: (props: ActionRenderProps) => React.ReactNode;
  /** Custom labels */
  labels?: {
    checkin?: string;
    checkout?: string;
    initializeCard?: string;
  };
}

// ============================================================================
// Default Labels
// ============================================================================

const DEFAULT_LABELS = {
  checkin: "Masuk",
  checkout: "Keluar",
  initializeCard: "Inisialisasi Kartu",
};

// ============================================================================
// Component
// ============================================================================

/**
 * ActionButtons - Contextual action buttons for the Unified NFC Scanner.
 *
 * Displays check-in/check-out buttons for valid payload cards,
 * or initialization actions for empty cards.
 *
 * Behavior:
 * - If renderActions is provided, renders custom content instead of defaults
 * - For valid_payload cards: shows check-in/check-out buttons
 *   - Check-in disabled if already checked in or card status != ACTIVE
 *   - Check-out disabled if not checked in or card status != ACTIVE
 * - For empty cards: shows "Inisialisasi Kartu" button if onInitializeCard provided
 *
 * @see Requirements 17.1, 17.2, 17.3, 17.4, 17.5, 17.6
 */
export function ActionButtons({
  phase,
  classification,
  payload,
  isCheckedIn,
  onCheckin,
  onCheckout,
  onInitializeCard,
  renderActions,
  labels,
}: Readonly<ActionButtonsProps>) {
  const mergedLabels = { ...DEFAULT_LABELS, ...labels };

  // If custom renderActions is provided, use it instead of default buttons
  if (renderActions) {
    return (
      <>
        {renderActions({
          phase,
          classification,
          payload,
          isCheckedIn,
          onCheckin: onCheckin ?? (() => {}),
          onCheckout: onCheckout ?? (() => {}),
        })}
      </>
    );
  }

  // For empty cards, show initialization action
  if (classification === "empty") {
    if (!onInitializeCard) return null;

    return (
      <div className="flex flex-col gap-2 w-full">
        <Button
          variant="default"
          size="lg"
          className="w-full"
          onClick={onInitializeCard}
          aria-label={mergedLabels.initializeCard}
        >
          <CreditCard className="size-4" />
          {mergedLabels.initializeCard}
        </Button>
      </div>
    );
  }

  // For valid_payload cards, show check-in/check-out buttons
  if (classification === "valid_payload" && payload) {
    const isCardActive = payload.identity.status === CardStatus.ACTIVE;
    const checkinDisabled = isCheckedIn || !isCardActive;
    const checkoutDisabled = !isCheckedIn || !isCardActive;

    return (
      <div className={cn("flex gap-2 w-full")}>
        {onCheckin && (
          <Button
            variant="default"
            size="lg"
            className="flex-1"
            disabled={checkinDisabled}
            onClick={onCheckin}
            aria-label={mergedLabels.checkin}
          >
            <LogIn className="size-4" />
            {mergedLabels.checkin}
          </Button>
        )}
        {onCheckout && (
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            disabled={checkoutDisabled}
            onClick={onCheckout}
            aria-label={mergedLabels.checkout}
          >
            <LogOut className="size-4" />
            {mergedLabels.checkout}
          </Button>
        )}
      </div>
    );
  }

  // For other classifications, no default actions
  return null;
}
