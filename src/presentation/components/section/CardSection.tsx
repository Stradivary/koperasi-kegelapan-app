import { useSessionGrant } from "#/presentation/hooks/useSessionGrant";
import { useTenantSync } from "#/presentation/hooks/useTenantSync";
import {
  useCardDrawers,
  useCardData,
  useCardIssuance,
  useCardRecovery,
  useCardOperations,
  useCardSync,
} from "#/presentation/hooks/useCardSection";
import { useCallback, useRef } from "react";
import { StationCardsPanel, type StationCardsPanelHandle } from "../block/StationCardsPanel";
import { StationFixCardPanel } from "../block/StationFixCardPanel";
import { CardNotBlankDrawer } from "../block/dialogs/CardNotBlankDrawer";
import { CardOverwriteDrawer } from "../block/dialogs/CardOverwriteDrawer";
import { IssuanceScanDrawer } from "../block/dialogs/IssuanceScanDrawer";
import { IssueCardDrawer } from "../block/dialogs/IssueCardDrawer";
import { NfcScanDrawer } from "../block/dialogs/NfcScanDrawer";
import { SyncConflictDialog } from "../block/dialogs/SyncConflictDialog";
import { TopupDrawer } from "../block/dialogs/TopupDrawer";
import { CardAlreadyRegisteredError, type CardSectionProps } from "./CardSection.utils";

export function CardSection({
  tenantId,
  accountId,
  deviceId,
  terminalId,
}: Readonly<CardSectionProps>) {
  const cardsPanelRef = useRef<StationCardsPanelHandle>(null);
  const isConfirmingOverwriteRef = useRef(false);
  const isConfirmingNotBlankRef = useRef(false);

  const { grant } = useSessionGrant(tenantId, accountId, deviceId);
  const { status: syncStatus, conflict, retryWithChanges, reset: resetSync } = useTenantSync();

  // Drawer states
  const {
    isDrawerOpen,
    topupDrawerOpen,
    recoveryDrawerOpen,
    fixCardId,
    showFixCard,
    issueCardDrawerOpen,
    overwriteDialog,
    notBlankDialog,
    setIsDrawerOpen,
    setOverwriteDialog,
    setNotBlankDialog,
    openTopupDrawer,
    closeTopupDrawer,
    openRecoveryDrawer,
    closeRecoveryDrawer,
    openFixCard,
    closeFixCard,
    openIssueCardDrawer,
    closeIssueCardDrawer,
  } = useCardDrawers();

  // Card data queries
  const { cards, members } = useCardData(tenantId);

  // Card operations (topup, delete, fix, reset)
  const {
    state,
    resetCardPending,
    setResetCardPending,
    deleteCard,
    fixCard,
    handleTopupCard,
    handleTopupConfirm,
    scan,
    reset,
    cancel,
    retryScan,
  } = useCardOperations({
    tenantId,
    grant,
    terminalId,
    onOpenTopupDrawer: openTopupDrawer,
    onCloseDrawer: () => {
      setIsDrawerOpen(false);
      closeTopupDrawer();
      setResetCardPending(false);
    },
  });

  // Card issuance flow
  const {
    issuancePhase,
    issuanceError,
    issuancePayload,
    issueCardDrawerPhase,
    isIssuing,
    handleIssueCard,
    handleIssuanceDrawerClose,
    handleRetryIssuance,
    handleForceOverwriteConfirm,
    cleanupIssuanceSession,
  } = useCardIssuance({
    tenantId,
    grant,
    onOpenDrawer: openIssueCardDrawer,
    onCloseDrawer: closeIssueCardDrawer,
    onShowOverwriteDialog: setOverwriteDialog,
    onShowNotBlankDialog: setNotBlankDialog,
  });

  // Card recovery flow
  const {
    recoveryPhase,
    recoveryError,
    recoveryPayload,
    recoverySerial,
    isRecovering,
    startCardRecovery,
    handleRecoveryDrawerClose,
    handleRetryRecovery,
  } = useCardRecovery({
    tenantId,
    grant,
    onOpenDrawer: openRecoveryDrawer,
    onCloseDrawer: closeRecoveryDrawer,
  });

  // Sync effects
  useCardSync({
    tenantId,
    state,
    resetCardPending,
    onResetState: () => {
      reset();
      setResetCardPending(false);
    },
    onCloseDrawers: () => {
      setIsDrawerOpen(false);
      closeTopupDrawer();
    },
  });

  const handleDrawerClose = useCallback(() => {
    if (state.phase === "scanning" || state.phase === "validating") {
      cancel();
    } else {
      reset();
    }
    setIsDrawerOpen(false);
    closeTopupDrawer();
    setResetCardPending(false);
  }, [state.phase, cancel, reset, closeTopupDrawer]);

  const handleDrawerOpenChange = useCallback(
    (open: boolean) => {
      if (!open) handleDrawerClose();
    },
    [handleDrawerClose],
  );

  // Normalize hardware serial number to consistent hex format
  const normalizeSerial = (sn: string | null): string | null => {
    if (!sn) return null;
    const normalized = sn.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();
    return normalized || null;
  };

  const handleFixCard = useCallback(() => {
    const scannedSerial = normalizeSerial(state.serialNumber);
    if (scannedSerial) {
      handleDrawerClose();
      startCardRecovery(scannedSerial);
      return;
    }

    openFixCard(state.serialNumber);
    handleDrawerClose();
  }, [state.serialNumber, handleDrawerClose, startCardRecovery, openFixCard]);

  return (
    <>
      {!showFixCard && (
        <StationCardsPanel
          ref={cardsPanelRef}
          cards={cards.data ?? []}
          members={members.data ?? []}
          isLoading={cards.isLoading}
          isTopping={state.phase === "writing"}
          isIssuing={isIssuing}
          isRecovering={isRecovering}
          isDeleting={deleteCard.isPending}
          hasGrant={!!grant}
          onTopupCard={handleTopupCard}
          onRecoverCard={(card) => startCardRecovery(card.cardId)}
          onIssueNew={openIssueCardDrawer}
          onDeleteCard={(card) => deleteCard.mutate({ card })}
        />
      )}

      {showFixCard && (
        <StationFixCardPanel
          cardId={fixCardId}
          cards={cards.data ?? []}
          members={members.data ?? []}
          isFixing={fixCard.isPending}
          hasGrant={!!grant}
          onFixCard={(data) => fixCard.mutateAsync(data)}
          onBack={closeFixCard}
        />
      )}

      <NfcScanDrawer
        open={isDrawerOpen}
        onOpenChange={handleDrawerOpenChange}
        phase={state.phase}
        payload={state.payload}
        isCheckedIn={false}
        error={state.error}
        tamperDetected={state.tamperDetected}
        onCheckin={() => {}}
        onCheckout={() => {}}
        onClose={handleDrawerClose}
        onRetry={scan}
        onFixCard={handleFixCard}
      />

      <TopupDrawer
        open={topupDrawerOpen}
        onOpenChange={(open) => {
          if (!open) handleDrawerClose();
        }}
        phase={state.phase}
        payload={state.payload}
        error={state.error}
        onTopup={handleTopupConfirm}
        onClose={handleDrawerClose}
        onRetry={retryScan}
      />

      <IssueCardDrawer
        open={issueCardDrawerOpen}
        onOpenChange={(open) => {
          if (!open) handleIssuanceDrawerClose();
        }}
        phase={issueCardDrawerPhase}
        payload={issuancePayload}
        error={issuanceError}
        members={members.data ?? []}
        onIssue={handleIssueCard}
        onClose={handleIssuanceDrawerClose}
        onRetry={handleRetryIssuance}
      />

      <IssuanceScanDrawer
        open={recoveryDrawerOpen}
        onOpenChange={(open) => {
          if (!open) handleRecoveryDrawerClose();
        }}
        phase={recoveryPhase}
        mode="write"
        payload={recoveryPayload}
        serialNumber={recoverySerial}
        error={recoveryError}
        minimal
        onClose={handleRecoveryDrawerClose}
        onRetry={handleRetryRecovery}
      />

      <CardOverwriteDrawer
        open={overwriteDialog != null}
        existingCard={overwriteDialog?.existingCard ?? null}
        newOwnerName={overwriteDialog?.pendingIssue.name ?? ""}
        newUserId={overwriteDialog?.pendingIssue.userId ?? null}
        isProcessing={issuancePhase === "writing"}
        onCancel={() => {
          if (isConfirmingOverwriteRef.current) return;
          setOverwriteDialog(null);
          cleanupIssuanceSession();
          closeIssueCardDrawer();
        }}
        onConfirm={async () => {
          if (!overwriteDialog) return;
          const pending = overwriteDialog.pendingIssue;
          isConfirmingOverwriteRef.current = true;
          setOverwriteDialog(null);
          try {
            await handleForceOverwriteConfirm(pending);
          } catch (e) {
            if (e instanceof CardAlreadyRegisteredError) {
              setOverwriteDialog({ existingCard: e.existingCard, pendingIssue: pending });
            }
          } finally {
            isConfirmingOverwriteRef.current = false;
          }
        }}
      />

      <CardNotBlankDrawer
        open={notBlankDialog != null}
        cardSerial={notBlankDialog?.cardSerial ?? null}
        isProcessing={issuancePhase === "writing"}
        onCancel={() => {
          if (isConfirmingNotBlankRef.current) return;
          setNotBlankDialog(null);
          cleanupIssuanceSession();
          closeIssueCardDrawer();
        }}
        onConfirm={async () => {
          if (!notBlankDialog) return;
          const pending = notBlankDialog.pendingIssue;
          isConfirmingNotBlankRef.current = true;
          setNotBlankDialog(null);
          try {
            await handleForceOverwriteConfirm(pending);
          } catch (e) {
            if (e instanceof CardAlreadyRegisteredError) {
              setOverwriteDialog({ existingCard: e.existingCard, pendingIssue: pending });
            }
          } finally {
            isConfirmingNotBlankRef.current = false;
          }
        }}
      />

      {/* Sync Conflict Dialog */}
      {conflict && (
        <SyncConflictDialog
          open={syncStatus === "conflict"}
          conflict={conflict}
          onDismiss={resetSync}
          onRetryWithChanges={(newSlug, newAdminUsername) => {
            retryWithChanges(newSlug, newAdminUsername);
          }}
          isRetrying={syncStatus === "syncing"}
        />
      )}
    </>
  );
}
