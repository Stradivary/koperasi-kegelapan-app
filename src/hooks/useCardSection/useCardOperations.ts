import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSyncEngineContext } from "#/hooks/SyncEngineContext";
import {
  applyResetState,
  applyTopup,
  checkLocalBlockedStatus,
  validateTopup,
} from "#/hooks/domain";
import { useNfcCard } from "#/hooks/nfc";
import type { SessionGrant } from "#/hooks/types";
import { localDb } from "#/hooks/useLocalDb";
import { cardRepo, userRepo } from "#/hooks/useRepositories";
import type { StationCardRow } from "#/components/block/StationCardsPanel";

export interface UseCardOperationsOptions {
  tenantId: string;
  grant: SessionGrant | null;
  terminalId: number;
  onOpenTopupDrawer: (cardId: string) => void;
  onCloseDrawer: () => void;
}

export function useCardOperations({
  tenantId,
  grant,
  terminalId,
  onOpenTopupDrawer,
  onCloseDrawer,
}: UseCardOperationsOptions) {
  const [resetCardPending, setResetCardPending] = useState(false);
  const [topupTargetCardId, setTopupTargetCardId] = useState<string | null>(null);

  const qc = useQueryClient();
  const syncEngineCtx = useSyncEngineContext();
  const { state, scan, write, reset, cancel, retryScan } = useNfcCard(grant, tenantId, terminalId);

  // Normalize hardware serial number to consistent hex format
  const normalizeSerial = (sn: string | null): string | null => {
    if (!sn) return null;
    const normalized = sn.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();
    return normalized || null;
  };

  const deleteCard = useMutation({
    mutationFn: async ({ card }: { card: StationCardRow }) => {
      await localDb.cards.update([tenantId, card.cardId], {
        status: "deleted",
        lastActivityAt: Math.floor(Date.now() / 1000),
        syncStatus: "pending",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      syncEngineCtx?.notifyMutation();
    },
  });

  const fixCard = useMutation({
    mutationFn: async ({
      cardId,
      userId,
      balance,
      expiresAt,
    }: {
      cardId: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    }) => {
      const now = Math.floor(Date.now() / 1000);
      const existing = await localDb.cards.get([tenantId, cardId]);
      if (existing) {
        await localDb.cards.update([tenantId, cardId], {
          userId,
          status: "active",
          balance,
          expiresAt,
          lastActivityAt: now,
          syncStatus: "pending",
        });
      } else {
        await localDb.cards.put({
          tenantId,
          cardId,
          userId,
          status: "active",
          balance,
          counter: 0,
          keyVersion: 1,
          createdAt: now,
          lastActivityAt: now,
          expiresAt,
          notes: null,
          syncStatus: "pending",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      syncEngineCtx?.notifyMutation();
    },
  });

  // Reset: once card is scanned, write reset state to card
  const handleResetWrite = useCallback(async () => {
    if (!state.payload || !grant) return;
    const now = Math.floor(Date.now() / 1000);
    const updated = applyResetState(state.payload, now);
    await write(updated, "admin_reset");
  }, [state.payload, grant, write]);

  // Top-up flow handler
  const handleTopupCard = useCallback(
    (cardId: string) => {
      setTopupTargetCardId(cardId);
      onOpenTopupDrawer(cardId);
      scan();
    },
    [scan, onOpenTopupDrawer],
  );

  // Top-up: validate card/user status immediately after scan (before nominal input)
  useEffect(() => {
    if (state.phase !== "ready" || !topupTargetCardId) return;

    const scannedId = normalizeSerial(state.serialNumber);

    // Validate scanned card matches the selected card
    if (topupTargetCardId && scannedId && scannedId !== topupTargetCardId) {
      toast.error("Kartu yang di-scan tidak sesuai dengan kartu yang dipilih");
      onCloseDrawer();
      setTopupTargetCardId(null);
      return;
    }

    // Check if card/user is blocked
    if (state.serialNumber) {
      checkLocalBlockedStatus(tenantId, state.serialNumber, { cardRepo, userRepo }).then(
        (statusResult) => {
          if (statusResult.blocked) {
            toast.error(statusResult.reason ?? "Kartu diblokir", { duration: 5000 });
            onCloseDrawer();
            setTopupTargetCardId(null);
          }
        },
      );
    }
  }, [state.phase, topupTargetCardId, state.serialNumber, tenantId, onCloseDrawer]);

  // Top-up: user confirmed amount in the drawer
  const handleTopupConfirm = useCallback(
    async (amount: number) => {
      if (!state.payload || !grant) return;

      const validation = validateTopup(state.payload, amount);
      if (!validation.valid) {
        toast.error(validation.reason ?? "Nominal top-up tidak valid");
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const updated = applyTopup(state.payload, amount, now);
      await write(updated, "topup");
    },
    [state.payload, grant, write],
  );

  // When card becomes ready and we have a pending reset, trigger write
  useEffect(() => {
    if (state.phase === "ready" && resetCardPending && state.payload) {
      handleResetWrite();
    }
  }, [state.phase, resetCardPending, state.payload, handleResetWrite]);

  return {
    state,
    resetCardPending,
    setResetCardPending,
    deleteCard,
    fixCard,
    handleTopupCard,
    handleTopupConfirm,
    handleResetWrite,
    scan,
    reset,
    cancel,
    retryScan,
  };
}
