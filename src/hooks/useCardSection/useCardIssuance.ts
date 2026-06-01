import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSyncEngineContext } from "#/hooks/SyncEngineContext";
import { encodeTenantBind, isNfcSupported, prepareWrite } from "#/hooks/domain";
import {
  CARD_SCHEMA_VERSION,
  CardState,
  CardStatus,
  MAGIC,
  type CardPayload,
  type SessionGrant,
} from "#/hooks/types";
import {
  CardAlreadyRegisteredError,
  CardNotBlankError,
  generateCardId,
  handleForceOverwrite,
  handleFreshNfcSession,
  type IssuancePhase,
} from "#/components/section/CardSection.utils";

export interface UseCardIssuanceOptions {
  tenantId: string;
  grant: SessionGrant | null;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  onShowOverwriteDialog: (data: {
    existingCard: any;
    pendingIssue: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    };
  }) => void;
  onShowNotBlankDialog: (data: {
    cardSerial: string;
    pendingIssue: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    };
  }) => void;
}

export function useCardIssuance({
  tenantId,
  grant,
  onOpenDrawer,
  onCloseDrawer,
  onShowOverwriteDialog,
  onShowNotBlankDialog,
}: UseCardIssuanceOptions) {
  const [issuancePhase, setIssuancePhase] = useState<IssuancePhase>("idle");
  const [issuanceError, setIssuanceError] = useState<string | null>(null);
  const [issuancePayload, setIssuancePayload] = useState<CardPayload | null>(null);

  const issuanceAbortRef = useRef<AbortController | null>(null);
  const issuanceReaderRef = useRef<NDEFReader | null>(null);
  const issuanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const issuancePreparedRef = useRef<{
    bytes: Uint8Array;
    serial: string;
    payload: CardPayload;
    issueData: { name: string; userId: string | null; balance: number; expiresAt: number | null };
  } | null>(null);

  const qc = useQueryClient();
  const syncEngineCtx = useSyncEngineContext();

  const cleanupIssuanceSession = useCallback(() => {
    if (issuanceTimeoutRef.current) {
      clearTimeout(issuanceTimeoutRef.current);
      issuanceTimeoutRef.current = null;
    }
    issuanceAbortRef.current?.abort();
    issuanceAbortRef.current = null;
    issuanceReaderRef.current = null;
    issuancePreparedRef.current = null;
  }, []);

  const issueCard = useMutation({
    mutationFn: async ({
      name,
      userId,
      balance,
      expiresAt,
      forceOverwrite,
    }: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
      forceOverwrite?: boolean;
    }) => {
      if (!grant) throw new Error("Sesi tidak aktif untuk membuat kartu");
      if (!isNfcSupported()) throw new Error("NFC tidak didukung di perangkat ini");

      const now = Math.floor(Date.now() / 1000);
      const cardId = generateCardId();

      const payload: CardPayload = {
        header: {
          magic: MAGIC,
          version: CARD_SCHEMA_VERSION,
          type: 0,
          cardId,
          tenantBind: encodeTenantBind(tenantId),
        },
        identity: {
          name: name || "Anggota",
          userId: userId || "",
          gender: 0,
          status: CardStatus.ACTIVE,
          createdAt: now,
        },
        wallet: {
          balance,
          lastBalance: 0,
          counter: 1n,
          lastTimestamp: now,
          state: CardState.IDLE,
          flags: 0,
        },
        session: { startTime: 0, endTime: 0, terminalId: 0 },
        logEntries: [],
        trailer: {
          expiresAt: expiresAt ?? 9_999_999_999,
          keyVersion: grant.keyVersion,
          rootHash: new Uint8Array(6),
          counterBind: 1,
          hmac: new Uint8Array(8),
          activePtr: 0,
        },
      };

      const { bytes } = await prepareWrite(payload, payload, grant);

      // If forceOverwrite with a prepared session, write immediately
      if (forceOverwrite && issuancePreparedRef.current) {
        const done = await handleForceOverwrite({
          bytes,
          issuancePreparedRef,
          issuanceReaderRef,
          issuanceAbortRef,
          setIssuancePhase,
          tenantId,
          userId,
          balance,
          expiresAt,
          name,
          grant,
          qc,
        });
        if (done) {
          setIssuancePayload(payload);
          await new Promise((r) => setTimeout(r, 1500));
          return;
        }
      }

      // Fresh NFC session - open drawer and scan
      await handleFreshNfcSession({
        bytes,
        payload,
        issuanceAbortRef,
        issuanceReaderRef,
        issuanceTimeoutRef,
        issuancePreparedRef,
        setIssueCardDrawerOpen: onOpenDrawer,
        setIssuancePhase,
        setIssuanceError,
        setIssuancePayload,
        tenantId,
        userId,
        balance,
        expiresAt,
        name,
        grant,
        forceOverwrite,
        qc,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      syncEngineCtx?.notifyMutation();
    },
  });

  const handleIssuanceDrawerClose = useCallback(() => {
    cleanupIssuanceSession();
    onCloseDrawer();
    setIssuancePhase("idle");
    setIssuanceError(null);
    setIssuancePayload(null);
  }, [cleanupIssuanceSession, onCloseDrawer]);

  // Auto-close issuance drawer after success
  useEffect(() => {
    if (issuancePhase === "done") {
      const timer = setTimeout(() => {
        handleIssuanceDrawerClose();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [issuancePhase, handleIssuanceDrawerClose]);

  const handleIssueCard = useCallback(
    async (data: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    }) => {
      try {
        await issueCard.mutateAsync(data);
      } catch (e) {
        if (e instanceof CardAlreadyRegisteredError) {
          if (issuanceTimeoutRef.current) {
            clearTimeout(issuanceTimeoutRef.current);
            issuanceTimeoutRef.current = null;
          }
          onShowOverwriteDialog({ existingCard: e.existingCard, pendingIssue: data });
        } else if (e instanceof CardNotBlankError) {
          if (issuanceTimeoutRef.current) {
            clearTimeout(issuanceTimeoutRef.current);
            issuanceTimeoutRef.current = null;
          }
          onShowNotBlankDialog({ cardSerial: e.cardSerial, pendingIssue: data });
        }
      }
    },
    [issueCard, onShowOverwriteDialog, onShowNotBlankDialog],
  );

  const handleRetryIssuance = useCallback(() => {
    const prepared = issuancePreparedRef.current;
    if (prepared) {
      cleanupIssuanceSession();
      issueCard.mutate(prepared.issueData);
    } else {
      setIssuancePhase("idle");
    }
  }, [cleanupIssuanceSession, issueCard]);

  const handleForceOverwriteConfirm = useCallback(
    async (pendingIssue: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    }) => {
      try {
        await issueCard.mutateAsync({
          ...pendingIssue,
          forceOverwrite: true,
        });
        toast.success("Kartu berhasil dicetak dan didaftarkan");
      } catch (e) {
        if (!(e instanceof CardNotBlankError) && !(e instanceof CardAlreadyRegisteredError)) {
          toast.error(e instanceof Error ? e.message : "Gagal menulis kartu");
          cleanupIssuanceSession();
          setIssuancePhase("error");
          setIssuanceError(e instanceof Error ? e.message : "Gagal menulis kartu");
        }
      }
    },
    [issueCard, cleanupIssuanceSession],
  );

  const issueCardDrawerPhase: "form" | "scanning" | "writing" | "done" | "error" =
    issuancePhase === "idle"
      ? "form"
      : issuancePhase === "scanning"
        ? "scanning"
        : issuancePhase === "writing"
          ? "writing"
          : issuancePhase === "done"
            ? "done"
            : "error";

  return {
    issuancePhase,
    issuanceError,
    issuancePayload,
    issueCardDrawerPhase,
    isIssuing: issueCard.isPending,
    handleIssueCard,
    handleIssuanceDrawerClose,
    handleRetryIssuance,
    handleForceOverwriteConfirm,
    cleanupIssuanceSession,
  };
}
