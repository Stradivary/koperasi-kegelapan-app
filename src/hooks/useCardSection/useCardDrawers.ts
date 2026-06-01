import { useCallback, useState } from "react";
import type { CardOwnerInfo } from "#/components/block/dialogs/CardOverwriteDialog";

export interface DrawerStates {
  isDrawerOpen: boolean;
  topupDrawerOpen: boolean;
  topupTargetCardId: string | null;
  recoveryDrawerOpen: boolean;
  fixCardId: string | null;
  showFixCard: boolean;
  issueCardDrawerOpen: boolean;
}

export interface ConflictDialogStates {
  overwriteDialog: {
    existingCard: CardOwnerInfo;
    pendingIssue: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    };
  } | null;
  notBlankDialog: {
    cardSerial: string;
    pendingIssue: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    };
  } | null;
}

export function useCardDrawers() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [topupDrawerOpen, setTopupDrawerOpen] = useState(false);
  const [topupTargetCardId, setTopupTargetCardId] = useState<string | null>(null);
  const [recoveryDrawerOpen, setRecoveryDrawerOpen] = useState(false);
  const [fixCardId, setFixCardId] = useState<string | null>(null);
  const [showFixCard, setShowFixCard] = useState(false);
  const [issueCardDrawerOpen, setIssueCardDrawerOpen] = useState(false);

  const [overwriteDialog, setOverwriteDialog] =
    useState<ConflictDialogStates["overwriteDialog"]>(null);
  const [notBlankDialog, setNotBlankDialog] =
    useState<ConflictDialogStates["notBlankDialog"]>(null);

  const openTopupDrawer = useCallback((cardId: string) => {
    setTopupTargetCardId(cardId);
    setTopupDrawerOpen(true);
  }, []);

  const closeTopupDrawer = useCallback(() => {
    setTopupDrawerOpen(false);
    setTopupTargetCardId(null);
  }, []);

  const openRecoveryDrawer = useCallback(() => {
    setRecoveryDrawerOpen(true);
  }, []);

  const closeRecoveryDrawer = useCallback(() => {
    setRecoveryDrawerOpen(false);
  }, []);

  const openFixCard = useCallback((cardId: string | null) => {
    setFixCardId(cardId);
    setShowFixCard(true);
  }, []);

  const closeFixCard = useCallback(() => {
    setFixCardId(null);
    setShowFixCard(false);
  }, []);

  const openIssueCardDrawer = useCallback(() => {
    setIssueCardDrawerOpen(true);
  }, []);

  const closeIssueCardDrawer = useCallback(() => {
    setIssueCardDrawerOpen(false);
  }, []);

  return {
    // States
    isDrawerOpen,
    topupDrawerOpen,
    topupTargetCardId,
    recoveryDrawerOpen,
    fixCardId,
    showFixCard,
    issueCardDrawerOpen,
    overwriteDialog,
    notBlankDialog,

    // Setters
    setIsDrawerOpen,
    setTopupDrawerOpen,
    setTopupTargetCardId,
    setRecoveryDrawerOpen,
    setFixCardId,
    setShowFixCard,
    setIssueCardDrawerOpen,
    setOverwriteDialog,
    setNotBlankDialog,

    // Actions
    openTopupDrawer,
    closeTopupDrawer,
    openRecoveryDrawer,
    closeRecoveryDrawer,
    openFixCard,
    closeFixCard,
    openIssueCardDrawer,
    closeIssueCardDrawer,
  };
}
