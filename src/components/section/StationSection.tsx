import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "../../lib/utils";
import { localDb, type Card, type User } from "../../db/local-db";
import { useNfcCard } from "../../hooks/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { applyTopup } from "../../core/state-machine/engine";
import { prepareWrite } from "../../core/nfc/pipelineEngine";
import {
  MAGIC,
  CARD_SCHEMA_VERSION,
  CardState,
  CardStatus,
  type CardPayload,
} from "../../core/payload/types";
import { encodeTenantBind } from "../../core/payload/tenantBind";
import { NfcScanDrawer } from "../block/NfcScanDrawer";
import { StationFixCardPanel } from "../block/StationFixCardPanel";
import {
  StationCardsPanel,
  type StationCardRow,
  type StationUserRow,
} from "../block/StationCardsPanel";
import { StationMembersPanel } from "../block/StationMembersPanel";

interface StationSectionProps {
  tenantId: string;
  tenantName: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
  role: string;
}

type Tab = "cards" | "members" | "fix-card";

async function getCardsWithUsers(tenantId: string): Promise<StationCardRow[]> {
  const [cardRows, userRows] = await Promise.all([
    localDb.cards.where("tenantId").equals(tenantId).toArray(),
    localDb.users.where("tenantId").equals(tenantId).toArray(),
  ]);
  const userMap = new Map<number, string>(userRows.map((u) => [u.userId, u.name]));
  return cardRows.map((c) => ({
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

function generateCardId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(6));
}

export function StationSection({ tenantId, accountId, deviceId, terminalId }: StationSectionProps) {
  const [tab, setTab] = useState<Tab>("cards");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [fixCardId, setFixCardId] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState<number | null>(null);
  const [syncDone, setSyncDone] = useState(false);
  const qc = useQueryClient();

  const { grant } = useSessionGrant(tenantId, accountId, deviceId, "station");
  const { state, scan, write, reset, cancel } = useNfcCard(grant, tenantId, terminalId);

  // Auto-close drawer after success and sync local DB
  useEffect(() => {
    if (state.phase === "success" && state.payload) {
      const payload = state.payload;
      const cardIdHex = Array.from(payload.header.cardId)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      // Sync balance to local DB after successful write
      localDb.cards.get([tenantId, cardIdHex]).then((existing) => {
        if (existing) {
          localDb.cards.update([tenantId, cardIdHex], {
            balance: payload.wallet.balance,
            counter: Number(payload.wallet.counter),
            lastActivityAt: Math.floor(Date.now() / 1000),
          });
        }
        qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      });

      const timer = setTimeout(() => {
        reset();
        setIsDrawerOpen(false);
        setTopupAmount(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [state.phase, state.payload, reset, tenantId, qc]);

  // Auto-sync card data to local DB when scanned (non-topup flow)
  useEffect(() => {
    if (state.phase !== "ready" || !state.payload || topupAmount != null) return;

    const payload = state.payload;
    const cardIdHex = Array.from(payload.header.cardId)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Sync the on-card values to local DB
    localDb.cards.get([tenantId, cardIdHex]).then((existing) => {
      if (existing) {
        localDb.cards.update([tenantId, cardIdHex], {
          balance: payload.wallet.balance,
          counter: Number(payload.wallet.counter),
          lastActivityAt: Math.floor(Date.now() / 1000),
        });
      } else {
        // Card exists on NFC but not in local DB — register it
        localDb.cards.put({
          tenantId,
          cardId: cardIdHex,
          userId: payload.identity.userId || null,
          status: "active",
          balance: payload.wallet.balance,
          counter: Number(payload.wallet.counter),
          keyVersion: payload.trailer.keyVersion,
          createdAt: payload.identity.createdAt,
          lastActivityAt: Math.floor(Date.now() / 1000),
          expiresAt: payload.trailer.expiresAt < 9_999_999_999 ? payload.trailer.expiresAt : null,
          notes: payload.identity.name,
        });
      }
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      setSyncDone(true);
    });
  }, [state.phase, state.payload, topupAmount, tenantId, qc]);

  const handleScan = useCallback(() => {
    setIsDrawerOpen(true);
    setTopupAmount(null);
    setSyncDone(false);
    scan();
  }, [scan]);

  const handleDrawerClose = useCallback(() => {
    if (state.phase === "scanning" || state.phase === "validating") {
      cancel();
    } else {
      reset();
    }
    setIsDrawerOpen(false);
    setTopupAmount(null);
    setSyncDone(false);
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
    setTab("fix-card");
  }, [state.serialNumber, handleDrawerClose]);

  // Top-up: once card is scanned and amount is set, write to card
  const handleTopupWrite = useCallback(
    async (amount: number) => {
      if (!state.payload || !grant) return;
      const now = Math.floor(Date.now() / 1000);
      const updated = applyTopup(state.payload, amount, now);
      await write(updated, "topup");
    },
    [state.payload, grant, write],
  );

  // Queries
  const cards = useQuery<StationCardRow[]>({
    queryKey: ["station-cards", tenantId],
    queryFn: () => getCardsWithUsers(tenantId),
  });

  const members = useQuery<StationUserRow[]>({
    queryKey: ["users", tenantId],
    queryFn: () =>
      localDb.users.where("tenantId").equals(tenantId).toArray() as Promise<StationUserRow[]>,
  });

  // Mutations
  const registerCard = useMutation({
    mutationFn: async ({
      cardId,
      userId,
      balance,
      expiresAt,
    }: {
      cardId: string;
      userId: number | null;
      balance: number;
      expiresAt: number | null;
    }) => {
      const now = Math.floor(Date.now() / 1000);
      await localDb.cards.put({
        tenantId,
        cardId,
        userId,
        status: "active",
        balance,
        counter: 0,
        keyVersion: 1,
        createdAt: now,
        lastActivityAt: null,
        expiresAt,
        notes: null,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["station-cards", tenantId] }),
  });

  const updateCardStatus = useMutation({
    mutationFn: async ({ card, status }: { card: StationCardRow; status: string }) => {
      await localDb.cards.update([tenantId, card.cardId], { status: status as Card["status"] });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["station-cards", tenantId] }),
  });

  const deleteCard = useMutation({
    mutationFn: async ({ card }: { card: StationCardRow }) => {
      await localDb.cards.delete([tenantId, card.cardId]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["station-cards", tenantId] }),
  });

  const issueCard = useMutation({
    mutationFn: async ({
      name,
      userId,
      balance,
      expiresAt,
    }: {
      name: string;
      userId: number | null;
      balance: number;
      expiresAt: number | null;
    }) => {
      if (!grant) throw new Error("Sesi tidak aktif");

      const now = Math.floor(Date.now() / 1000);
      const cardId = generateCardId();
      const cardIdHex = Array.from(cardId)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Build fresh CardPayload
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
          userId: userId ?? 0,
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

      // Encrypt and sign the payload
      const { bytes } = await prepareWrite(payload, payload, grant);

      // Write to NFC card using scan-then-write pattern
      // NDEFReader.write() handles waiting for a tag automatically
      const reader = new NDEFReader();
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 30_000);
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
      } finally {
        clearTimeout(timeout);
      }

      // Register in local DB
      await localDb.cards.put({
        tenantId,
        cardId: cardIdHex,
        userId,
        status: "active",
        balance,
        counter: 1,
        keyVersion: grant.keyVersion,
        createdAt: now,
        lastActivityAt: now,
        expiresAt,
        notes: name,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["station-cards", tenantId] }),
  });

  const fixCard = useMutation({
    mutationFn: async ({
      cardId,
      userId,
      balance,
      expiresAt,
    }: {
      cardId: string;
      userId: number | null;
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
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["station-cards", tenantId] }),
  });

  const createMember = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const existing = await localDb.users.where("tenantId").equals(tenantId).toArray();
      const nextId = existing.length > 0 ? Math.max(...existing.map((u) => u.userId)) + 1 : 1001;
      const now = Math.floor(Date.now() / 1000);
      await localDb.users.add({
        tenantId,
        userId: nextId,
        name: name.trim(),
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users", tenantId] }),
  });

  const toggleMemberStatus = useMutation({
    mutationFn: async ({ userId, status }: { userId: number; status: string }) => {
      await localDb.users.update([tenantId, userId], {
        status: status as User["status"],
        updatedAt: Math.floor(Date.now() / 1000),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users", tenantId] }),
  });

  // Top-up flow handler: scan card via NfcScanDrawer, then write topup
  const handleTopupCard = useCallback(
    async (_cardId: string, amount: number) => {
      setTopupAmount(amount);
      // If card is already scanned and ready, write immediately
      if (state.phase === "ready" && state.payload) {
        await handleTopupWrite(amount);
      } else {
        // Open drawer to scan card first
        setIsDrawerOpen(true);
        scan();
      }
    },
    [state.phase, state.payload, handleTopupWrite, scan],
  );

  // Auto-close drawer after sync (non-topup scan)
  useEffect(() => {
    if (syncDone && topupAmount == null && state.phase === "ready") {
      const timer = setTimeout(() => {
        reset();
        setIsDrawerOpen(false);
        setSyncDone(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [syncDone, topupAmount, state.phase, reset]);

  // When card becomes ready and we have a pending topup amount, trigger write
  useEffect(() => {
    if (state.phase === "ready" && topupAmount != null && state.payload) {
      handleTopupWrite(topupAmount);
    }
  }, [state.phase, topupAmount, state.payload, handleTopupWrite]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Station</h1>
        <div className="flex rounded-lg border overflow-hidden">
          <button
            onClick={() => setTab("cards")}
            className={cn(
              "px-4 py-1.5 text-sm transition-colors",
              tab === "cards"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            Kartu
          </button>
          <button
            onClick={() => setTab("members")}
            className={cn(
              "px-4 py-1.5 text-sm transition-colors border-l",
              tab === "members"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            Anggota
          </button>
        </div>
      </div>

      {tab === "cards" && (
        <StationCardsPanel
          cards={cards.data ?? []}
          members={members.data ?? []}
          isLoading={cards.isLoading}
          isRegistering={registerCard.isPending}
          isTopping={state.phase === "writing"}
          isIssuing={issueCard.isPending}
          isUpdatingStatus={updateCardStatus.isPending}
          isDeleting={deleteCard.isPending}
          hasGrant={!!grant}
          onRegisterCard={(data) => registerCard.mutateAsync(data)}
          onTopupCard={handleTopupCard}
          onIssueCard={(data) => issueCard.mutateAsync(data)}
          onUpdateCardStatus={(card, newStatus) =>
            updateCardStatus.mutate({ card, status: newStatus })
          }
          onDeleteCard={(card) => deleteCard.mutate({ card })}
          onNfcScan={handleScan}
        />
      )}
      {tab === "members" && (
        <StationMembersPanel
          members={members.data ?? []}
          isLoading={members.isLoading}
          isCreating={createMember.isPending}
          isToggling={toggleMemberStatus.isPending}
          onCreateMember={(name) => createMember.mutateAsync({ name })}
          onToggleStatus={(userId, currentStatus) =>
            toggleMemberStatus.mutate({
              userId,
              status: currentStatus === "active" ? "suspended" : "active",
            })
          }
        />
      )}
      {tab === "fix-card" && (
        <StationFixCardPanel
          cardId={fixCardId}
          cards={cards.data ?? []}
          members={members.data ?? []}
          isFixing={fixCard.isPending}
          hasGrant={!!grant}
          onFixCard={(data) => fixCard.mutateAsync(data)}
          onBack={() => {
            setFixCardId(null);
            setTab("cards");
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
        syncMode={topupAmount == null}
        syncSuccess={syncDone}
      />
    </div>
  );
}
