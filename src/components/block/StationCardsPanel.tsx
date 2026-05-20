import { useState } from "react";
import { StationCardListPanel } from "./StationCardListPanel";
import { StationCardIssuePanel } from "./StationCardIssuePanel";

export interface StationCardRow {
  cardId: string;
  userId: string | null;
  userName: string | null;
  status: string;
  balance: number;
  counter: number;
  expiresAt: string | null;
}

export interface StationUserRow {
  userId: string;
  name: string;
  status: string;
}

type CardView = "list" | "issue";

interface StationCardsPanelProps {
  cards: StationCardRow[];
  members: StationUserRow[];
  isLoading: boolean;
  isTopping: boolean;
  isIssuing: boolean;
  isUpdatingStatus: boolean;
  isDeleting: boolean;
  isResetting: boolean;
  hasGrant: boolean;
  onTopupCard: (cardId: string) => void;
  onIssueCard: (data: {
    name: string;
    userId: string | null;
    balance: number;
    expiresAt: number | null;
  }) => Promise<void>;
  onUpdateCardStatus: (card: StationCardRow, newStatus: string) => void;
  onDeleteCard: (card: StationCardRow) => void;
  onResetCard: (card: StationCardRow) => void;
}

export function StationCardsPanel({
  cards,
  members,
  isLoading,
  isTopping: _isTopping,
  isIssuing,
  isUpdatingStatus,
  isDeleting,
  isResetting,
  hasGrant: _hasGrant,
  onTopupCard,
  onIssueCard,
  onUpdateCardStatus,
  onDeleteCard,
  onResetCard,
}: StationCardsPanelProps) {
  const [cardView, setCardView] = useState<CardView>("list");
  const [success, setSuccess] = useState<string | null>(null);

  async function handleIssueCard(data: {
    name: string;
    userId: string | null;
    balance: number;
    expiresAt: number | null;
  }) {
    await onIssueCard(data);
    setSuccess("Kartu berhasil dicetak dan didaftarkan");
    setCardView("list");
  }

  return (
    <div className="space-y-4">
      {success && <p className="text-sm text-green-600">{success}</p>}

      {cardView === "list" && (
        <StationCardListPanel
          cards={cards}
          isLoading={isLoading}
          isUpdatingStatus={isUpdatingStatus}
          isDeleting={isDeleting}
          isResetting={isResetting}
          onTopupCard={onTopupCard}
          onUpdateCardStatus={onUpdateCardStatus}
          onDeleteCard={onDeleteCard}
          onResetCard={onResetCard}
          onIssueNew={() => {
            setSuccess(null);
            setCardView("issue");
          }}
        />
      )}

      {cardView === "issue" && (
        <StationCardIssuePanel
          members={members}
          isIssuing={isIssuing}
          onIssueCard={handleIssueCard}
          onCancel={() => setCardView("list")}
        />
      )}
    </div>
  );
}
