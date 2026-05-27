import { useImperativeHandle, forwardRef } from "react";
import { StationCardListPanel } from "./StationCardListPanel";
import type { StationCardRow, StationUserRow } from "#/lib/stationQueries";

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
  isUpdatingStatus: boolean;
  isDeleting: boolean;
  isResetting: boolean;
  hasGrant: boolean;
  onTopupCard: (cardId: string) => void;
  onRecoverCard: (card: StationCardRow) => void;
  onIssueNew: () => void;
  onUpdateCardStatus: (card: StationCardRow, newStatus: string) => void;
  onDeleteCard: (card: StationCardRow) => void;
  onResetCard: (card: StationCardRow) => void;
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
    },
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
