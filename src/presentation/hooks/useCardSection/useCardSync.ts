import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSyncEngineContext } from "#/presentation/hooks/SyncEngineContext";
import { localDb, type Card } from "#/presentation/hooks/useLocalDb";
import type { NfcCardState } from "#/presentation/hooks/nfc";

export interface UseCardSyncOptions {
  tenantId: string;
  state: NfcCardState;
  resetCardPending: boolean;
  onResetState: () => void;
  onCloseDrawers: () => void;
}

export function useCardSync({
  tenantId,
  state,
  resetCardPending,
  onResetState,
  onCloseDrawers,
}: UseCardSyncOptions) {
  const qc = useQueryClient();
  const syncEngineCtx = useSyncEngineContext();

  // Derive card identifier from the payload's header.cardId (6-byte random ID written during issuance).
  // This MUST match the key used by updateLocalCardRecord and recordCardWrite.
  // Previously used normalizeSerial(state.serialNumber) which is the NFC hardware UID (7 bytes)
  // and differs from the payload-embedded cardId, causing duplicate entries.
  const getCardIdFromPayload = (payload: NfcCardState["payload"]): string | null => {
    if (!payload) return null;
    return Array.from(payload.header.cardId)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  // Auto-close drawer after success and sync local DB
  useEffect(() => {
    if (state.phase === "success" && state.payload) {
      const payload = state.payload;
      const cardId = getCardIdFromPayload(payload);
      if (!cardId) return;
      localDb.cards.get([tenantId, cardId]).then((existing) => {
        if (existing) {
          const updates: Partial<Card> = {
            balance: payload.wallet.balance,
            counter: Number(payload.wallet.counter),
            lastActivityAt: Math.floor(Date.now() / 1000),
          };
          if (resetCardPending) {
            updates.status = "active";
          }
          localDb.cards.update([tenantId, cardId], updates);
        }
        qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      });

      syncEngineCtx?.notifyMutation();

      const timer = setTimeout(() => {
        onResetState();
        onCloseDrawers();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [
    state.phase,
    state.payload,
    tenantId,
    qc,
    resetCardPending,
    syncEngineCtx,
    onResetState,
    onCloseDrawers,
  ]);

  // Auto-sync card data to local DB when scanned
  useEffect(() => {
    if (state.phase !== "ready" || !state.payload) return;

    const payload = state.payload;
    const cardId = getCardIdFromPayload(payload);
    if (!cardId) return;

    localDb.cards.get([tenantId, cardId]).then((existing) => {
      if (existing) {
        localDb.cards.update([tenantId, cardId], {
          balance: payload.wallet.balance,
          counter: Number(payload.wallet.counter),
          lastActivityAt: Math.floor(Date.now() / 1000),
          syncStatus: "pending",
        });
      } else {
        localDb.cards.put({
          tenantId,
          cardId,
          userId: null,
          status: "active",
          balance: payload.wallet.balance,
          counter: Number(payload.wallet.counter),
          keyVersion: payload.trailer.keyVersion,
          createdAt: payload.identity.createdAt,
          lastActivityAt: Math.floor(Date.now() / 1000),
          expiresAt: payload.trailer.expiresAt < 9_999_999_999 ? payload.trailer.expiresAt : null,
          notes: payload.identity.name,
          syncStatus: "pending",
        });
      }
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
    });
  }, [state.phase, state.payload, tenantId, qc]);
}
