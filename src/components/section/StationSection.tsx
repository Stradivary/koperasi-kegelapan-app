import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { localDb, type Card, type User } from "../../db/local-db";
import { useNfcCard } from "../../hooks/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { useSyncEngineContext } from "../../hooks/SyncEngineContext";
import { applyTopup } from "../../core/state-machine/engine";
import { prepareWrite } from "../../core/nfc/pipelineEngine";
import { extractCardBytes } from "../../core/nfc/engine";
import { checkLocalBlockedStatus } from "../../core/nfc/localStatusCheck";
import { validateUID } from "../../core/validation/uidGlobalValidator";
import {
  MAGIC,
  CARD_SCHEMA_VERSION,
  CardState,
  CardStatus,
  type CardPayload,
} from "../../core/payload/types";
import { encodeTenantBind } from "../../core/payload/tenantBind";
import { NfcScanDrawer } from "../block/NfcScanDrawer";
import { TopupDrawer } from "../block/TopupDrawer";
import { StationFixCardPanel } from "../block/StationFixCardPanel";
import {
  StationCardsPanel,
  type StationCardRow,
  type StationUserRow,
} from "../block/StationCardsPanel";
import { StationMembersPanel } from "../block/StationMembersPanel";
import { CardOverwriteDialog, type CardOwnerInfo } from "../block/CardOverwriteDialog";
import { Button } from "../ui/button";

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

function generateCardId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(6));
}

/** Generate a random 8-char alphanumeric member ID (collision-safe across devices) */
function generateMemberId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
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

export function StationSection({ tenantId, accountId, deviceId, terminalId }: StationSectionProps) {
  const [tab, setTab] = useState<Tab>("cards");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [topupDrawerOpen, setTopupDrawerOpen] = useState(false);
  const [fixCardId, setFixCardId] = useState<string | null>(null);
  const [overwriteDialog, setOverwriteDialog] = useState<{
    existingCard: CardOwnerInfo;
    pendingIssue: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    };
  } | null>(null);
  const [isOverwriting, setIsOverwriting] = useState(false);
  const [notBlankDialog, setNotBlankDialog] = useState<{
    cardSerial: string;
    pendingIssue: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    };
  } | null>(null);
  const qc = useQueryClient();

  const { grant } = useSessionGrant(tenantId, accountId, deviceId, "station");
  const { state, scan, write, reset, cancel } = useNfcCard(grant, tenantId, terminalId);
  const syncEngine = useSyncEngineContext();

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
      // Sync balance to local DB after successful write
      localDb.cards.get([tenantId, cardId]).then((existing) => {
        if (existing) {
          localDb.cards.update([tenantId, cardId], {
            balance: payload.wallet.balance,
            counter: Number(payload.wallet.counter),
            lastActivityAt: Math.floor(Date.now() / 1000),
          });
        }
        qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      });

      // Notify sync engine that an Outbox write occurred (triggers debounced sync)
      syncEngine?.notifyMutation();

      const timer = setTimeout(() => {
        reset();
        setIsDrawerOpen(false);
        setTopupDrawerOpen(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [state.phase, state.payload, state.serialNumber, reset, tenantId, qc, syncEngine]);

  // Auto-sync card data to local DB when scanned (always, including topup)
  useEffect(() => {
    if (state.phase !== "ready" || !state.payload) return;

    const payload = state.payload;
    const cardId = normalizeSerial(state.serialNumber);
    if (!cardId) return;

    // Sync the on-card values to local DB using hardware serial as stable ID
    localDb.cards.get([tenantId, cardId]).then((existing) => {
      if (existing) {
        localDb.cards.update([tenantId, cardId], {
          balance: payload.wallet.balance,
          counter: Number(payload.wallet.counter),
          lastActivityAt: Math.floor(Date.now() / 1000),
          syncStatus: "pending",
        });
      } else {
        // Card exists on NFC but not in local DB — register it
        localDb.cards.put({
          tenantId,
          cardId,
          userId: null, // member linkage is resolved via DB, not card binary
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

  // Top-up: user confirmed amount in the topup drawer
  const handleTopupConfirm = useCallback(
    async (amount: number) => {
      if (!state.payload || !grant) return;

      // Check local DB for blocked card or suspended member before writing
      if (state.serialNumber) {
        const statusResult = await checkLocalBlockedStatus(tenantId, state.serialNumber);
        if (statusResult.blocked) {
          toast.error(statusResult.reason ?? "Kartu diblokir", { duration: 5000 });
          return;
        }
      }

      const now = Math.floor(Date.now() / 1000);
      const updated = applyTopup(state.payload, amount, now);
      await write(updated, "topup");
    },
    [state.payload, grant, write, state.serialNumber, tenantId],
  );

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
      await localDb.cards.update([tenantId, card.cardId], { status: status as Card["status"] });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["station-cards", tenantId] }),
  });

  const deleteCard = useMutation({
    mutationFn: async ({ card }: { card: StationCardRow }) => {
      // Soft delete: mark as "deleted" so it syncs to server and is hidden everywhere
      await localDb.cards.update([tenantId, card.cardId], {
        status: "deleted",
        lastActivityAt: Math.floor(Date.now() / 1000),
        syncStatus: "pending",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      syncEngine?.notifyMutation();
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
      if (!grant) throw new Error("Sesi tidak aktif");

      const now = Math.floor(Date.now() / 1000);
      const cardId = generateCardId();

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
          userId: userId || "", // 8-char member ID stored on card binary
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

      // Write to NFC card and capture hardware serial number
      // We use scan + reading event to get the serial, then write in the same session
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
      // This MUST complete before query invalidation to ensure fresh data is available
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

      // Await invalidation to ensure station-cards query refetches from IndexedDB
      // before the component re-renders. This prevents stale cache from showing balance=0
      // when switching to offline mode after card issuance.
      await qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
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
      syncEngine?.notifyMutation();
    },
  });

  const createMember = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const now = Math.floor(Date.now() / 1000);
      try {
        await localDb.users.add({
          tenantId,
          userId: generateMemberId(),
          name: name.trim(),
          status: "active",
          createdAt: now,
          updatedAt: now,
          syncStatus: "pending",
        });
      } catch (err) {
        throw new Error(
          err instanceof Error ? err.message : "Gagal menyimpan data anggota ke database lokal",
        );
      }
    },
    onSuccess: () => {
      toast.success("Anggota berhasil ditambahkan");
      qc.invalidateQueries({ queryKey: ["users", tenantId] });
      syncEngine?.notifyMutation();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal menambahkan anggota. Silakan coba lagi.",
      );
    },
  });

  const toggleMemberStatus = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      await localDb.users.update([tenantId, userId], {
        status: status as User["status"],
        updatedAt: Math.floor(Date.now() / 1000),
        syncStatus: "pending",
      });

      // Cascade: block/unblock all cards linked to this member
      const linkedCards = await localDb.cards
        .where("tenantId")
        .equals(tenantId)
        .filter((card) => card.userId === userId)
        .toArray();

      for (const card of linkedCards) {
        if (status === "suspended") {
          // Only block cards that are currently active
          if (card.status === "active") {
            await localDb.cards.update([tenantId, card.cardId], {
              status: "blocked_admin",
              lastActivityAt: Math.floor(Date.now() / 1000),
              syncStatus: "pending",
            });
          }
        } else if (status === "active") {
          // Unblock cards that were blocked by admin (due to member suspension)
          if (card.status === "blocked_admin") {
            await localDb.cards.update([tenantId, card.cardId], {
              status: "active",
              lastActivityAt: Math.floor(Date.now() / 1000),
              syncStatus: "pending",
            });
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users", tenantId] });
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      syncEngine?.notifyMutation();
    },
  });

  const deleteMember = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      // Soft delete: mark as "deleted" so it syncs to server and is hidden everywhere
      await localDb.users.update([tenantId, userId], {
        status: "deleted",
        updatedAt: Math.floor(Date.now() / 1000),
        syncStatus: "pending",
      });
    },
    onSuccess: () => {
      toast.success("Anggota berhasil dihapus");
      qc.invalidateQueries({ queryKey: ["users", tenantId] });
      syncEngine?.notifyMutation();
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="type-title-bold text-foreground">Station</h1>
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
          isTopping={state.phase === "writing"}
          isIssuing={issueCard.isPending}
          isUpdatingStatus={updateCardStatus.isPending}
          isDeleting={deleteCard.isPending}
          hasGrant={!!grant}
          onTopupCard={handleTopupCard}
          onIssueCard={async (data) => {
            try {
              await issueCard.mutateAsync(data);
            } catch (e) {
              if (e instanceof CardAlreadyRegisteredError) {
                setOverwriteDialog({ existingCard: e.existingCard, pendingIssue: data });
                throw e; // Re-throw so caller knows issuance didn't complete
              } else if (e instanceof CardNotBlankError) {
                setNotBlankDialog({ cardSerial: e.cardSerial, pendingIssue: data });
                throw e; // Re-throw so caller knows issuance didn't complete
              } else {
                throw e;
              }
            }
          }}
          onUpdateCardStatus={(card, newStatus) =>
            updateCardStatus.mutate({ card, status: newStatus })
          }
          onDeleteCard={(card) => deleteCard.mutate({ card })}
          isResetting={false}
          onResetCard={() => {}}
        />
      )}
      {tab === "members" && (
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
            toast.info("Tempelkan kartu ke perangkat untuk menulis data...", { duration: 5000 });
            await issueCard.mutateAsync({
              ...overwriteDialog.pendingIssue,
              forceOverwrite: true,
            });
            setOverwriteDialog(null);
            toast.success("Kartu berhasil dicetak dan didaftarkan");
          } catch (e) {
            if (e instanceof CardNotBlankError) {
              // Card has data but forceOverwrite should handle it — retry with force
              setOverwriteDialog(null);
              toast.error("Gagal menulis kartu. Silakan coba lagi.");
            } else {
              toast.error(e instanceof Error ? e.message : "Gagal menulis kartu");
            }
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
                    toast.info("Tempelkan kartu ke perangkat untuk menulis data...", {
                      duration: 5000,
                    });
                    await issueCard.mutateAsync({
                      ...pending,
                      forceOverwrite: true,
                    });
                    toast.success("Kartu berhasil dicetak dan didaftarkan");
                  } catch (e) {
                    if (e instanceof CardAlreadyRegisteredError) {
                      setOverwriteDialog({ existingCard: e.existingCard, pendingIssue: pending });
                    } else {
                      toast.error(e instanceof Error ? e.message : "Gagal menulis kartu");
                    }
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
    </div>
  );
}
