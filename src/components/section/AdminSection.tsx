import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { localDb, type Card, type User } from "../../db/local-db";
import { useNfcCard } from "../../hooks/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { useTenantSync } from "../../hooks/useTenantSync";
import { localTenantConfigStore, localAccountStore } from "../../lib/indexeddb";
import { AdminLayout, type AdminView } from "../layout/AdminLayout";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import {
  StationCardsPanel,
  type StationCardRow,
  type StationUserRow,
} from "../block/StationCardsPanel";
import { StationMembersPanel } from "../block/StationMembersPanel";
import { StationFixCardPanel } from "../block/StationFixCardPanel";
import { SyncConflictDialog } from "../block/SyncConflictDialog";
import { CardOverwriteDialog, type CardOwnerInfo } from "../block/CardOverwriteDialog";
import { NfcScanDrawer } from "../block/NfcScanDrawer";
import { TopupDrawer } from "../block/TopupDrawer";
import { Button } from "../ui/button";
import { applyTopup, applyResetState } from "../../core/state-machine/engine";
import { prepareWrite } from "../../core/nfc/pipelineEngine";
import {
  MAGIC,
  CARD_SCHEMA_VERSION,
  CardState,
  CardStatus,
  type CardPayload,
} from "../../core/payload/types";
import { encodeTenantBind } from "../../core/payload/tenantBind";

interface AdminSectionProps {
  tenantId: string;
  tenantName: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
  role: string;
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

export const AdminSection = ({
  tenantId,
  tenantName,
  accountId,
  deviceId,
  terminalId,
  role,
}: AdminSectionProps) => {
  const [view, setView] = useState<AdminView>("cards");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [topupDrawerOpen, setTopupDrawerOpen] = useState(false);
  const [fixCardId, setFixCardId] = useState<string | null>(null);
  const [showFixCard, setShowFixCard] = useState(false);
  const [resetCardPending, setResetCardPending] = useState(false);
  const [overwriteDialog, setOverwriteDialog] = useState<{
    existingCard: CardOwnerInfo;
    pendingIssue: { name: string; userId: number | null; balance: number; expiresAt: number | null };
  } | null>(null);
  const [isOverwriting, setIsOverwriting] = useState(false);
  const qc = useQueryClient();

  const { grant } = useSessionGrant(tenantId, accountId, deviceId);
  const { state, scan, write, reset, cancel } = useNfcCard(grant, tenantId, terminalId);
  const {
    status: syncStatus,
    conflict,
    error: syncError,
    syncToServer,
    retryWithChanges,
    reset: resetSync,
  } = useTenantSync();

  // Sync engine for status indicator (Req 11.1, 11.2, 11.7, 11.8)
  const {
    syncStatus: engineSyncStatus,
    lastSyncedAt: engineLastSyncedAt,
    pendingCount: enginePendingCount,
    triggerSync: engineTriggerSync,
  } = useSyncEngine(tenantId, true);

  // Normalize hardware serial number to consistent hex format
  const normalizeSerial = (sn: string | null): string | null => {
    if (!sn) return null;
    const normalized = sn.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
    return normalized || null;
  };

  // Show toast on sync success
  useEffect(() => {
    if (syncStatus === "success") {
      toast.success("Tenant berhasil disinkronkan ke server");
    }
  }, [syncStatus]);

  // Show toast on sync error
  useEffect(() => {
    if (syncStatus === "error" && syncError) {
      toast.error(syncError);
    }
  }, [syncStatus, syncError]);

  const handleSync = useCallback(async () => {
    const [config, accounts] = await Promise.all([
      localTenantConfigStore.get(tenantId),
      localAccountStore.getByTenant(tenantId),
    ]);
    if (!config) {
      toast.error("Konfigurasi tenant lokal tidak ditemukan");
      return;
    }
    const admin = accounts.find((a) => a.role === "admin");
    if (!admin) {
      toast.error("Akun admin tidak ditemukan");
      return;
    }
    await syncToServer(config, admin.passwordHash);
  }, [tenantId, syncToServer]);

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
          // If this was a reset operation, also update the status in local DB
          if (resetCardPending) {
            updates.status = "active";
          }
          localDb.cards.update([tenantId, cardId], updates);
        }
        qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      });

      const timer = setTimeout(() => {
        reset();
        setIsDrawerOpen(false);
        setTopupDrawerOpen(false);
        setResetCardPending(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [state.phase, state.payload, state.serialNumber, reset, tenantId, qc, resetCardPending]);

  // Auto-sync card data to local DB when scanned (always, including topup)
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
        });
      } else {
        localDb.cards.put({
          tenantId,
          cardId,
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
    queryFn: () =>
      localDb.users.where("tenantId").equals(tenantId).toArray() as Promise<StationUserRow[]>,
  });

  // Mutations
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
      forceOverwrite,
    }: {
      name: string;
      userId: number | null;
      balance: number;
      expiresAt: number | null;
      forceOverwrite?: boolean;
    }) => {
      if (!grant) throw new Error("Sesi tidak aktif");

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

      const { bytes } = await prepareWrite(payload, payload, grant);

      // Write to NFC card and capture hardware serial number
      const reader = new NDEFReader();
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 30_000);

      let capturedSerial: string | null = null;

      try {
        // Start scanning to capture the serial number on tap
        const serialPromise = new Promise<string>((resolve, reject) => {
          reader.addEventListener("reading", (event: NDEFReadingEvent) => {
            const serial = event.serialNumber?.replace(/[^a-fA-F0-9]/g, "").toLowerCase() || null;
            if (serial) {
              resolve(serial);
            } else {
              reject(new Error("Kartu tidak memiliki serial number"));
            }
          });
          abort.signal.addEventListener("abort", () => reject(new Error("Waktu habis")));
        });

        await reader.scan({ signal: abort.signal });

        // Wait for the card to be tapped (reading event fires)
        capturedSerial = await serialPromise;

        // ── Check if card is already registered ──
        if (!forceOverwrite) {
          const existing = await localDb.cards.get([tenantId, capturedSerial]);
          if (existing) {
            // Look up owner name
            let ownerName: string | null = existing.notes;
            if (existing.userId != null && !ownerName) {
              const user = await localDb.users.get([tenantId, existing.userId]);
              ownerName = user?.name ?? null;
            }
            // Abort the NFC session before throwing
            abort.abort();
            throw new CardAlreadyRegisteredError({
              cardId: capturedSerial,
              ownerName,
              userId: existing.userId,
              balance: existing.balance,
              status: existing.status,
            });
          }
        }

        // Now write to the card that's still in range
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
        abort.abort();
      }

      if (!capturedSerial) {
        throw new Error("Gagal membaca serial kartu");
      }

      // Register in local DB using hardware serial as the stable card ID
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

  // Top-up flow handler — opens topup drawer and starts scanning
  const handleTopupCard = useCallback(
    (_cardId: string) => {
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
    <AdminLayout
      tenantId={tenantId}
      tenantName={tenantName}
      role={role}
      activeSection={view}
      onSectionChange={setView}
      syncStatus={engineSyncStatus}
      lastSyncedAt={engineLastSyncedAt}
      pendingCount={enginePendingCount}
      onTriggerSync={engineTriggerSync}
    >
      {state.error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {view === "cards" && !showFixCard && (
        <StationCardsPanel
          cards={cards.data ?? []}
          members={members.data ?? []}
          isLoading={cards.isLoading}
          isTopping={state.phase === "writing"}
          isIssuing={issueCard.isPending}
          isUpdatingStatus={updateCardStatus.isPending}
          isDeleting={deleteCard.isPending}
          isResetting={resetCardPending && (state.phase === "scanning" || state.phase === "writing")}
          hasGrant={!!grant}
          onTopupCard={handleTopupCard}
          onIssueCard={async (data) => {
            try {
              await issueCard.mutateAsync(data);
            } catch (e) {
              if (e instanceof CardAlreadyRegisteredError) {
                setOverwriteDialog({ existingCard: e.existingCard, pendingIssue: data });
              } else {
                throw e;
              }
            }
          }}
          onUpdateCardStatus={(card, newStatus) =>
            updateCardStatus.mutate({ card, status: newStatus })
          }
          onDeleteCard={(card) => deleteCard.mutate({ card })}
          onResetCard={handleResetCard}
        />
      )}

      {view === "cards" && showFixCard && (
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

      {view === "members" && (
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

      {/* Sync to Server */}
      {view === "cards" && !showFixCard && (
        <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-10">
          <Button onClick={handleSync} disabled={syncStatus === "syncing"}>
            {syncStatus === "syncing" ? "Menyinkronkan..." : "Sync ke Server"}
          </Button>
        </div>
      )}

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

      {/* Card Overwrite Confirmation Dialog */}
      <CardOverwriteDialog
        open={overwriteDialog != null}
        existingCard={overwriteDialog?.existingCard ?? null}
        newOwnerName={overwriteDialog?.pendingIssue.name ?? ""}
        isProcessing={isOverwriting}
        onCancel={() => setOverwriteDialog(null)}
        onConfirm={async () => {
          if (!overwriteDialog) return;
          setIsOverwriting(true);
          try {
            await issueCard.mutateAsync({
              ...overwriteDialog.pendingIssue,
              forceOverwrite: true,
            });
            setOverwriteDialog(null);
          } catch {
            // Error will be shown by the mutation's error state
          } finally {
            setIsOverwriting(false);
          }
        }}
      />
    </AdminLayout>
  );
};
