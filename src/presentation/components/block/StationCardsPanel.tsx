import { useImperativeHandle, forwardRef } from "react";
import { StationCardListPanel } from "./StationCardListPanel";
import type { StationCardRow, StationUserRow } from "#/presentation/hooks/useStationData";

export type { StationCardRow, StationUserRow };

export interface StationCardsPanelHandle {
  goToList: () => void;
}

interface StationCardsPanelProps {
  cards: StationCardRow[];
  members: StationUserRow[];
  isLoading: boolean;
  isTopping: boolean;
  isIssuing: boolean;
  isRecovering: boolean;
  isDeleting: boolean;
  hasGrant: boolean;
  onTopupCard: (cardId: string) => void;
  onRecoverCard: (card: StationCardRow) => void;
  onIssueNew: () => void;
  onDeleteCard: (card: StationCardRow) => void;
  /** @deprecated Not used - kept for API compatibility */
  isUpdatingStatus?: boolean;
  /** @deprecated Not used - kept for API compatibility */
  isResetting?: boolean;
  /** @deprecated Not used - kept for API compatibility */
  onUpdateCardStatus?: (card: StationCardRow, status: string) => void;
  /** @deprecated Not used - kept for API compatibility */
  onResetCard?: (card: StationCardRow) => void;
}

export const StationCardsPanel = forwardRef<StationCardsPanelHandle, StationCardsPanelProps>(
  function StationCardsPanel(
    {
      cards,
      members: _members,
      isLoading,
      isTopping: _isTopping,
      isIssuing: _isIssuing,
      isRecovering,
      isDeleting,
      hasGrant: _hasGrant,
      onTopupCard,
      onRecoverCard,
      onIssueNew,
      onDeleteCard,
    }: Readonly<StationCardsPanelProps>,
    ref,
  ) {
    useImperativeHandle(ref, () => ({
      goToList: () => {},
    }));

    return (
      <div className="space-y-4">
        <StationCardListPanel
          cards={cards}
          isLoading={isLoading}
          isRecovering={isRecovering}
          isDeleting={isDeleting}
          onTopupCard={onTopupCard}
          onRecoverCard={onRecoverCard}
          onDeleteCard={onDeleteCard}
          onIssueNew={onIssueNew}
        />
      </div>
    );
  },
);
