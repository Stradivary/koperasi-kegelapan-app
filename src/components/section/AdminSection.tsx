import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { localDb, type Card, type User } from "../../db/local-db";
import { useNfcCard } from "../../hooks/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { useTenantSync } from "../../hooks/useTenantSync";
import { localTenantConfigStore, localAccountStore } from "../../lib/indexeddb";
import { AdminLayout, type AdminView } from "../layout/AdminLayout";
import { useSyncEngineContext } from "../../hooks/SyncEngineContext";
import { validateUID } from "../../core/validation/uidGlobalValidator";
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
import { extractCardBytes } from "../../core/nfc/engine";
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
  initialView?: AdminView;
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
  initialView,
}: AdminSectionProps) => {
  const [view, setView] = useState<AdminView>(initialView ?? "cards");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [topupDrawerOpen, setTopupDrawerOpen] = useState(false);
  const [fixCardId, setFixCardId] = useState<string | null>(null);
  const [showFixCard, setShowFixCard] = useState(false);
  const [resetCardPending, setResetCardPending] = useState(false);
  const [overwriteDialog, setOverwriteDialog] = useState<{
    existingCard: CardOwnerInfo;
    pendingIssue: {
      name: string;
      userId: number | null;
      balance: number;
      expiresAt: number | null;
    };
  } | null>(null);
  const [isOverwriting, setIsOverwriting] = useState(false);
  const [notBlankDialog, setNotBlankDialog] = useState<{
    cardSerial: string;
    pendingIssue: {
      name: string;
      userId: number | null;
      balance: number;
      expiresAt: number | null;
    };
  } | null>(null);
  const [tenantMode, setTenantMode] = useState<"local" | "synced" | null>(null);
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
  // Uses the shared context from the tenant layout
  const syncEngineCtx = useSyncEngineContext();
  const engineSyncStatus = syncEngineCtx?.syncStatus ?? "idle";
  const engineLastSyncedAt = syncEngineCtx?.lastSyncedAt ?? null;
  const enginePendingCount = syncEngineCtx?.pendingCount ?? 0;
  const engineTriggerSync = syncEngineCtx?.triggerSync ?? (() => {});

  // Normalize hardware serial number to consistent hex format
  const normalizeSerial = (sn: string | null): string | null => {
    if (!sn) return null;
    const normalized = sn.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
    return normalized || null;
  };

  // Load tenant mode on mount to determine if "Sync ke Server" button should show
  useEffect(() => {
    localTenantConfigStore.get(tenantId).then((config) => {
      setTenantMode(config?.mode ?? null);
    });
  }, [tenantId]);

  // Show toast on sync success
  useEffect(() => {
    if (syncStatus === "success") {
      toast.success("Tenant berhasil disinkronkan ke server");
      // Update local mode to synced after successful sync
      setTenantMode("synced");
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
    // If tenant is already synced (e.g. logged in from server), no need to push again
    if (config.mode === "synced") {
      toast.info("Tenant sudah tersinkronisasi dengan server");
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

      // Notify sync engine that an Outbox write occurred (triggers debounced sync)
      syncEngineCtx?.notifyMutation();

      const timer = setTimeout(() => {
        reset();
        setIsDrawerOpen(false);
        setTopupDrawerOpen(false);
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
      let cardHasData = false;

      try {
        // Start scanning to capture the serial number on tap
        const scanResult = new Promise<{ serial: string; hasData: boolean }>((resolve, reject) => {
          reader.addEventListener("reading", (event: NDEFReadingEvent) => {
            const serial = event.serialNumber?.replace(/[^a-fA-F0-9]/g, "").toLowerCase() || null;
            if (serial) {
              // Check if card already contains valid data
              const existingBytes = extractCardBytes(event.message);
              resolve({ serial, hasData: existingBytes !== null });
            } else {
              reject(new Error("Kartu tidak memiliki serial number"));
            }
          });
          abort.signal.addEventListener("abort", () => reject(new Error("Waktu habis")));
        });

        await reader.scan({ signal: abort.signal });

        // Wait for the card to be tapped (reading event fires)
        const { serial, hasData } = await scanResult;
        capturedSerial = serial;
        cardHasData = hasData;

        // ── Check if card already contains data (not blank) ──
        if (cardHasData && !forceOverwrite) {
          abort.abort();
          throw new CardNotBlankError(capturedSerial);
        }

        // ── Global UID validation (cross-tenant + cloud) ──
        const uidResult = await validateUID(capturedSerial, tenantId);
        if (!uidResult.valid) {
          // If forceOverwrite is set and the UID is registered in the current tenant, skip
          if (forceOverwrite && uidResult.reason === "UID_ALREADY_REGISTERED") {
            // Allow overwrite for same-tenant re-registration
          } else {
            abort.abort();
            const uidErrorMessages: Record<string, string> = {
              UID_ALREADY_REGISTERED: "UID kartu sudah terdaftar di tenant ini",
              UID_REGISTERED_OTHER_TENANT: "UID kartu sudah terdaftar di tenant lain",
              NETWORK_ERROR: "Gagal memvalidasi UID: kesalahan jaringan",
              INVALID_UID_FORMAT: "Format UID tidak valid",
            };
            throw new Error(uidErrorMessages[uidResult.reason!] ?? "Validasi UID gagal");
          }
        }

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

  const deleteMember = useMutation({
    mutationFn: async ({ userId }: { userId: number }) => {
      await localDb.users.delete([tenantId, userId]);
    },
    onSuccess: () => {
      toast.success("Anggota berhasil dihapus");
      qc.invalidateQueries({ queryKey: ["users", tenantId] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal menghapus anggota. Silakan coba lagi.",
      );
    },
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
      onSyncToServer={tenantMode === "local" ? handleSync : undefined}
      isSyncingToServer={syncStatus === "syncing"}
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
          isDeleting={deleteMember.isPending}
          onCreateMember={(name) => createMember.mutateAsync({ name })}
          onToggleStatus={(userId, currentStatus) =>
            toggleMemberStatus.mutate({
              userId,
              status: currentStatus === "active" ? "suspended" : "active",
            })
          }
          onDeleteMember={(userId) => deleteMember.mutate({ userId })}
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

      {/* Card Not Blank Warning Dialog */}
      {notBlankDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl border p-6 max-w-sm mx-4 space-y-4">
            <h3 className="font-medium text-destructive">⚠️ Kartu Tidak Kosong</h3>
            <p className="text-sm text-muted-foreground">
              Kartu ini sudah berisi data (kemungkinan dari tenant lain atau penulisan sebelumnya).
              Melanjutkan akan menimpa semua data yang ada di kartu.
            </p>
            <p className="text-xs text-muted-foreground">
              Serial: <code className="bg-muted px-1 rounded">{notBlankDialog.cardSerial}</code>
            </p>
            <div className="flex gap-2 pt-2">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={async () => {
                  const pending = notBlankDialog.pendingIssue;
                  setNotBlankDialog(null);
                  try {
                    await issueCard.mutateAsync({
                      ...pending,
                      forceOverwrite: true,
                    });
                  } catch (e) {
                    if (e instanceof CardAlreadyRegisteredError) {
                      setOverwriteDialog({ existingCard: e.existingCard, pendingIssue: pending });
                    }
                    // Other errors handled by mutation error state
                  }
                }}
              >
                Timpa &amp; Lanjutkan
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setNotBlankDialog(null)}>
                Batal
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};
