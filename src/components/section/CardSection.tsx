import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { localDb, type Card } from "../../db/local-db";
import { useNfcCard } from "../../hooks/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { useTenantSync } from "../../hooks/useTenantSync";
import { useSyncEngineContext } from "../../hooks/SyncEngineContext";
import { checkLocalBlockedStatus } from "../../core/nfc/localStatusCheck";
import { validateUID } from "../../core/validation/uidGlobalValidator";
import {
  StationCardsPanel,
  type StationCardRow,
  type StationUserRow,
  type StationCardsPanelHandle,
} from "../block/StationCardsPanel";
import { StationFixCardPanel } from "../block/StationFixCardPanel";
import { SyncConflictDialog } from "../block/dialogs/SyncConflictDialog";
import { type CardOwnerInfo } from "../block/dialogs/CardOverwriteDialog";
import { CardOverwriteDrawer } from "../block/dialogs/CardOverwriteDrawer";
import { CardNotBlankDrawer } from "../block/dialogs/CardNotBlankDrawer";
import { NfcScanDrawer } from "../block/dialogs/NfcScanDrawer";
import { IssuanceScanDrawer } from "../block/dialogs/IssuanceScanDrawer";
import { TopupDrawer } from "../block/dialogs/TopupDrawer";
import { applyTopup, applyResetState } from "../../core/state-machine/engine";
import { prepareWrite } from "../../core/nfc/pipelineEngine";
import { extractCardBytes, isNfcSupported } from "../../core/nfc/engine";
import {
  MAGIC,
  CARD_SCHEMA_VERSION,
  CardState,
  CardStatus,
  type CardPayload,
} from "../../core/payload/types";
import { encodeTenantBind } from "../../core/payload/tenantBind";

interface CardSectionProps {
  tenantId: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
}

function generateCardId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(6));
}

/** Thrown when a card serial is already registered to another owner */
class CardAlreadyRegisteredError extends Error {
  constructor(public existingCard: CardOwnerInfo) {
    super("Kartu sudah terdaftar");
    this.name = "CardAlreadyRegisteredError";
  }
}

/** Thrown when the NFC card already contains data (not blank) */
class CardNotBlankError extends Error {
  constructor(public cardSerial: string) {
    super("Kartu sudah berisi data");
    this.name = "CardNotBlankError";
  }
}

async function getCardsWithUsers(tenantId: string): Promise<StationCardRow[]> {
  const [cardRows, userRows] = await Promise.all([
    localDb.cards.where("tenantId").equals(tenantId).toArray(),
    localDb.users.where("tenantId").equals(tenantId).toArray(),
  ]);
  const userMap = new Map<string, string>(userRows.map((u) => [u.userId, u.name]));
  return cardRows
    .filter((c) => c.status !== "deleted")
    .map((c) => ({
      cardId: c.cardId,
      userId: c.userId,
      userName: c.userId != null ? (userMap.get(c.userId) ?? null) : null,
      status: c.status,
      balance: c.balance,
      counter: c.counter,
      expiresAt:
        c.expiresAt != null ? new Date(c.expiresAt * 1000).toISOString().split("T")[0] : null,
    }));
}

export function CardSection({ tenantId, accountId, deviceId, terminalId }: CardSectionProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [topupDrawerOpen, setTopupDrawerOpen] = useState(false);
  const [topupTargetCardId, setTopupTargetCardId] = useState<string | null>(null);
  const [fixCardId, setFixCardId] = useState<string | null>(null);
  const [showFixCard, setShowFixCard] = useState(false);
  const [resetCardPending, setResetCardPending] = useState(false);

  // ── Issuance flow state ──
  type IssuancePhase = "idle" | "scanning" | "writing" | "done" | "error";
  const [issuanceDrawerOpen, setIssuanceDrawerOpen] = useState(false);
  const [issuancePhase, setIssuancePhase] = useState<IssuancePhase>("idle");
  const [issuanceError, setIssuanceError] = useState<string | null>(null);
  const [issuancePayload, setIssuancePayload] = useState<CardPayload | null>(null);
  const [issuanceSerial, setIssuanceSerial] = useState<string | null>(null);

  const [overwriteDialog, setOverwriteDialog] = useState<{
    existingCard: CardOwnerInfo;
    pendingIssue: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    };
  } | null>(null);
  const [notBlankDialog, setNotBlankDialog] = useState<{
    cardSerial: string;
    pendingIssue: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    };
  } | null>(null);

  // Refs for the issuance NFC session — kept alive across conflict dialogs
  const issuanceAbortRef = useRef<AbortController | null>(null);
  const issuanceReaderRef = useRef<NDEFReader | null>(null);
  const issuanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const issuancePreparedRef = useRef<{
    bytes: Uint8Array;
    serial: string;
    payload: CardPayload;
    issueData: { name: string; userId: string | null; balance: number; expiresAt: number | null };
  } | null>(null);
  const cardsPanelRef = useRef<StationCardsPanelHandle>(null);

  const qc = useQueryClient();

  const { grant } = useSessionGrant(tenantId, accountId, deviceId);
  const { state, scan, write, reset, cancel } = useNfcCard(grant, tenantId, terminalId);
  const { status: syncStatus, conflict, retryWithChanges, reset: resetSync } = useTenantSync();

  const syncEngineCtx = useSyncEngineContext();

  // Normalize hardware serial number to consistent hex format
  const normalizeSerial = (sn: string | null): string | null => {
    if (!sn) return null;
    const normalized = sn.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
    return normalized || null;
  };

  // Auto-close drawer after success and sync local DB
  useEffect(() => {
    if (state.phase === "success" && state.payload) {
      const payload = state.payload;
      const cardId = normalizeSerial(state.serialNumber);
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
        reset();
        setIsDrawerOpen(false);
        setTopupDrawerOpen(false);
        setTopupTargetCardId(null);
        setResetCardPending(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [
    state.phase,
    state.payload,
    state.serialNumber,
    reset,
    tenantId,
    qc,
    resetCardPending,
    syncEngineCtx,
  ]);

  // Auto-sync card data to local DB when scanned
  useEffect(() => {
    if (state.phase !== "ready" || !state.payload) return;

    const payload = state.payload;
    const cardId = normalizeSerial(state.serialNumber);
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
  }, [state.phase, state.payload, state.serialNumber, tenantId, qc]);

  const handleDrawerClose = useCallback(() => {
    if (state.phase === "scanning" || state.phase === "validating") {
      cancel();
    } else {
      reset();
    }
    setIsDrawerOpen(false);
    setTopupDrawerOpen(false);
    setTopupTargetCardId(null);
    setResetCardPending(false);
  }, [state.phase, cancel, reset]);

  const handleDrawerOpenChange = useCallback(
    (open: boolean) => {
      if (!open) handleDrawerClose();
    },
    [handleDrawerClose],
  );

  const handleFixCard = useCallback(() => {
    const scannedSerial = state.serialNumber;
    setFixCardId(scannedSerial);
    handleDrawerClose();
    setShowFixCard(true);
  }, [state.serialNumber, handleDrawerClose]);

  // Reset: once card is scanned, write reset state to card
  const handleResetWrite = useCallback(async () => {
    if (!state.payload || !grant) return;
    const now = Math.floor(Date.now() / 1000);
    const updated = applyResetState(state.payload, now);
    await write(updated, "admin_reset");
  }, [state.payload, grant, write]);

  // Queries
  const cards = useQuery<StationCardRow[]>({
    queryKey: ["station-cards", tenantId],
    queryFn: () => getCardsWithUsers(tenantId),
  });

  const members = useQuery<StationUserRow[]>({
    queryKey: ["users", tenantId],
    queryFn: async () => {
      const all = await localDb.users.where("tenantId").equals(tenantId).toArray();
      return all.filter((u) => u.status !== "deleted") as StationUserRow[];
    },
  });

  // Mutations
  const updateCardStatus = useMutation({
    mutationFn: async ({ card, status }: { card: StationCardRow; status: string }) => {
      await localDb.cards.update([tenantId, card.cardId], {
        status: status as Card["status"],
        syncStatus: "pending",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      syncEngineCtx?.notifyMutation();
    },
  });

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

      // ── If forceOverwrite with a prepared session, write immediately ──
      if (forceOverwrite && issuancePreparedRef.current) {
        const prepared = issuancePreparedRef.current;
        const reader = issuanceReaderRef.current;
        const abort = issuanceAbortRef.current;

        if (!reader || !abort || abort.signal.aborted) {
          issuancePreparedRef.current = null;
          throw new Error("Sesi NFC terputus. Silakan tap kartu lagi.");
        }

        setIssuancePhase("writing");

        try {
          await reader.write(
            {
              records: [
                {
                  recordType: "unknown",
                  data: bytes.buffer.slice(
                    bytes.byteOffset,
                    bytes.byteOffset + bytes.byteLength,
                  ) as ArrayBuffer,
                },
              ],
            },
            { signal: abort.signal, overwrite: true },
          );
        } catch {
          throw new Error("Gagal menulis kartu. Pastikan kartu tetap menempel.");
        }

        const capturedSerial = prepared.serial;

        await localDb.cards.put({
          tenantId,
          cardId: capturedSerial,
          userId,
          status: "active",
          balance,
          counter: 1,
          keyVersion: grant.keyVersion,
          createdAt: now,
          lastActivityAt: now,
          expiresAt,
          notes: name,
          syncStatus: "pending",
        });

        await qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
        setIssuancePayload(payload);
        setIssuanceSerial(capturedSerial);
        setIssuancePhase("done");
        issuancePreparedRef.current = null;
        return;
      }

      // ── Fresh NFC session — open drawer and scan ──
      setIssuanceDrawerOpen(true);
      setIssuancePhase("scanning");
      setIssuanceError(null);
      setIssuancePayload(null);
      setIssuanceSerial(null);

      // Clean up any previous session
      issuanceAbortRef.current?.abort();
      if (issuanceTimeoutRef.current) clearTimeout(issuanceTimeoutRef.current);

      const abort = new AbortController();
      issuanceAbortRef.current = abort;
      const reader = new NDEFReader();
      issuanceReaderRef.current = reader;

      const timeout = setTimeout(() => abort.abort(), 30_000);
      issuanceTimeoutRef.current = timeout;

      let capturedSerial: string | null = null;

      try {
        const scanResult = new Promise<{ serial: string; hasData: boolean }>((resolve, reject) => {
          reader.addEventListener("reading", (event: NDEFReadingEvent) => {
            const serial = event.serialNumber?.replace(/[^a-fA-F0-9]/g, "").toLowerCase() || null;
            if (serial) {
              const existingBytes = extractCardBytes(event.message);
              resolve({ serial, hasData: existingBytes !== null });
            } else {
              reject(new Error("Kartu tidak memiliki serial number"));
            }
          });
          abort.signal.addEventListener("abort", () => reject(new Error("Waktu habis")));
        });

        await reader.scan({ signal: abort.signal });

        const { serial, hasData } = await scanResult;
        capturedSerial = serial;

        issuancePreparedRef.current = {
          bytes,
          serial,
          payload,
          issueData: { name, userId, balance, expiresAt },
        };

        if (hasData && !forceOverwrite) {
          throw new CardNotBlankError(capturedSerial);
        }

        const uidResult = await validateUID(capturedSerial, tenantId);
        if (!uidResult.valid) {
          if (
            forceOverwrite &&
            (uidResult.reason === "UID_ALREADY_REGISTERED" ||
              uidResult.reason === "UID_REGISTERED_OTHER_TENANT")
          ) {
            // Allow overwrite for same-tenant or cross-tenant re-registration
          } else if (uidResult.reason === "UID_ALREADY_REGISTERED") {
            // Keep the NFC session alive — the write might fail, so preserve
            // issuancePreparedRef for the overwrite dialog retry flow.
            const existing = await localDb.cards.get([tenantId, capturedSerial]);
            throw new CardAlreadyRegisteredError({
              cardId: capturedSerial,
              ownerName: existing?.notes ?? null,
              userId: existing?.userId ?? null,
              balance: existing?.balance ?? 0,
              status: existing?.status ?? "active",
            });
          } else if (uidResult.reason === "UID_REGISTERED_OTHER_TENANT") {
            // Keep the NFC session alive for override flow (same as same-tenant)
            throw new CardAlreadyRegisteredError({
              cardId: capturedSerial,
              ownerName: `Tenant lain (${uidResult.existingTenantId ?? "unknown"})`,
              userId: null,
              balance: 0,
              status: "active",
            });
          } else {
            abort.abort();
            issuancePreparedRef.current = null;
            const uidErrorMessages: Record<string, string> = {
              NETWORK_ERROR: "Gagal memvalidasi UID: kesalahan jaringan",
              INVALID_UID_FORMAT: "Format UID tidak valid",
            };
            throw new Error(uidErrorMessages[uidResult.reason!] ?? "Validasi UID gagal");
          }
        }

        if (!forceOverwrite) {
          const existing = await localDb.cards.get([tenantId, capturedSerial]);
          if (existing) {
            let ownerName: string | null = existing.notes;
            if (existing.userId != null && !ownerName) {
              const user = await localDb.users.get([tenantId, existing.userId]);
              ownerName = user?.name ?? null;
            }
            throw new CardAlreadyRegisteredError({
              cardId: capturedSerial,
              ownerName,
              userId: existing.userId,
              balance: existing.balance,
              status: existing.status,
            });
          }
        }

        // ── All checks passed — write to card ──
        setIssuancePhase("writing");
        await reader.write(
          {
            records: [
              {
                recordType: "unknown",
                data: bytes.buffer.slice(
                  bytes.byteOffset,
                  bytes.byteOffset + bytes.byteLength,
                ) as ArrayBuffer,
              },
            ],
          },
          { signal: abort.signal, overwrite: true },
        );

        await localDb.cards.put({
          tenantId,
          cardId: capturedSerial,
          userId,
          status: "active",
          balance,
          counter: 1,
          keyVersion: grant.keyVersion,
          createdAt: now,
          lastActivityAt: now,
          expiresAt,
          notes: name,
          syncStatus: "pending",
        });

        await qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
        setIssuancePayload(payload);
        setIssuanceSerial(capturedSerial);
        setIssuancePhase("done");
        issuancePreparedRef.current = null;
      } catch (e) {
        if (issuanceTimeoutRef.current) {
          clearTimeout(issuanceTimeoutRef.current);
          issuanceTimeoutRef.current = null;
        }

        if (e instanceof CardNotBlankError || e instanceof CardAlreadyRegisteredError) {
          throw e;
        }

        abort.abort();
        issuancePreparedRef.current = null;
        setIssuancePhase("error");
        setIssuanceError(e instanceof Error ? e.message : "Gagal menerbitkan kartu");
        throw e;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      syncEngineCtx?.notifyMutation();
      cardsPanelRef.current?.goToList();
    },
  });

  // Helper to clean up the issuance NFC session
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

  const handleIssuanceDrawerClose = useCallback(() => {
    cleanupIssuanceSession();
    setIssuanceDrawerOpen(false);
    setIssuancePhase("idle");
    setIssuanceError(null);
    setIssuancePayload(null);
    setIssuanceSerial(null);
  }, [cleanupIssuanceSession]);

  // Auto-close issuance drawer after success
  useEffect(() => {
    if (issuancePhase === "done") {
      const timer = setTimeout(() => {
        handleIssuanceDrawerClose();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [issuancePhase, handleIssuanceDrawerClose]);

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

  // Top-up flow handler
  const handleTopupCard = useCallback(
    (cardId: string) => {
      setTopupTargetCardId(cardId);
      setTopupDrawerOpen(true);
      scan();
    },
    [scan],
  );

  // Reset card flow handler
  const handleResetCard = useCallback(
    (_card: StationCardRow) => {
      setResetCardPending(true);
      setIsDrawerOpen(true);
      scan();
    },
    [scan],
  );

  // Top-up: validate card/user status immediately after scan (before nominal input)
  useEffect(() => {
    if (state.phase !== "ready" || !topupDrawerOpen) return;

    const scannedId = normalizeSerial(state.serialNumber);

    // Validate scanned card matches the selected card
    if (topupTargetCardId && scannedId && scannedId !== topupTargetCardId) {
      toast.error("Kartu yang di-scan tidak sesuai dengan kartu yang dipilih");
      handleDrawerClose();
      return;
    }

    // Check if card/user is blocked
    if (state.serialNumber) {
      checkLocalBlockedStatus(tenantId, state.serialNumber).then((statusResult) => {
        if (statusResult.blocked) {
          toast.error(statusResult.reason ?? "Kartu diblokir", { duration: 5000 });
          handleDrawerClose();
        }
      });
    }
  }, [
    state.phase,
    topupDrawerOpen,
    state.serialNumber,
    topupTargetCardId,
    tenantId,
    handleDrawerClose,
  ]);

  // Top-up: user confirmed amount in the drawer
  const handleTopupConfirm = useCallback(
    async (amount: number) => {
      if (!state.payload || !grant) return;

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

  return (
    <>
      {state.error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {!showFixCard && (
        <StationCardsPanel
          ref={cardsPanelRef}
          cards={cards.data ?? []}
          members={members.data ?? []}
          isLoading={cards.isLoading}
          isTopping={state.phase === "writing"}
          isIssuing={issueCard.isPending}
          isUpdatingStatus={updateCardStatus.isPending}
          isDeleting={deleteCard.isPending}
          isResetting={
            resetCardPending && (state.phase === "scanning" || state.phase === "writing")
          }
          hasGrant={!!grant}
          onTopupCard={handleTopupCard}
          onIssueCard={async (data) => {
            try {
              await issueCard.mutateAsync(data);
            } catch (e) {
              if (e instanceof CardAlreadyRegisteredError) {
                setOverwriteDialog({ existingCard: e.existingCard, pendingIssue: data });
              } else if (e instanceof CardNotBlankError) {
                setNotBlankDialog({ cardSerial: e.cardSerial, pendingIssue: data });
              }
              throw e;
            }
          }}
          onUpdateCardStatus={(card, newStatus) =>
            updateCardStatus.mutate({ card, status: newStatus })
          }
          onDeleteCard={(card) => deleteCard.mutate({ card })}
          onResetCard={handleResetCard}
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
          onBack={() => {
            setFixCardId(null);
            setShowFixCard(false);
          }}
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
        onRetry={scan}
      />

      <IssuanceScanDrawer
        open={issuanceDrawerOpen}
        onOpenChange={(open) => {
          if (!open) handleIssuanceDrawerClose();
        }}
        phase={issuancePhase}
        mode="write"
        payload={issuancePayload}
        serialNumber={issuanceSerial}
        error={issuanceError}
        minimal
        onClose={handleIssuanceDrawerClose}
        onRetry={() => {
          const prepared = issuancePreparedRef.current;
          if (prepared) {
            cleanupIssuanceSession();
            issueCard.mutate(prepared.issueData);
          } else {
            handleIssuanceDrawerClose();
          }
        }}
      />

      <CardOverwriteDrawer
        open={overwriteDialog != null}
        existingCard={overwriteDialog?.existingCard ?? null}
        newOwnerName={overwriteDialog?.pendingIssue.name ?? ""}
        newUserId={overwriteDialog?.pendingIssue.userId ?? null}
        isProcessing={issuancePhase === "writing"}
        onCancel={() => {
          setOverwriteDialog(null);
          cleanupIssuanceSession();
          setIssuanceDrawerOpen(false);
          setIssuancePhase("idle");
        }}
        onConfirm={async () => {
          if (!overwriteDialog) return;
          const pending = overwriteDialog.pendingIssue;
          // Close override drawer immediately — IssuanceScanDrawer will show write progress
          setOverwriteDialog(null);
          try {
            await issueCard.mutateAsync({
              ...pending,
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
        }}
      />

      <CardNotBlankDrawer
        open={notBlankDialog != null}
        cardSerial={notBlankDialog?.cardSerial ?? null}
        isProcessing={issuancePhase === "writing"}
        onCancel={() => {
          setNotBlankDialog(null);
          cleanupIssuanceSession();
          setIssuanceDrawerOpen(false);
          setIssuancePhase("idle");
        }}
        onConfirm={async () => {
          if (!notBlankDialog) return;
          const pending = notBlankDialog.pendingIssue;
          setNotBlankDialog(null);
          try {
            await issueCard.mutateAsync({
              ...pending,
              forceOverwrite: true,
            });
            toast.success("Kartu berhasil dicetak dan didaftarkan");
          } catch (e) {
            if (e instanceof CardAlreadyRegisteredError) {
              setOverwriteDialog({ existingCard: e.existingCard, pendingIssue: pending });
            } else if (!(e instanceof CardNotBlankError)) {
              toast.error(e instanceof Error ? e.message : "Gagal menulis kartu");
              cleanupIssuanceSession();
              setIssuancePhase("error");
              setIssuanceError(e instanceof Error ? e.message : "Gagal menulis kartu");
            }
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
