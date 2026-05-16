import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { localDb, type User, type Card } from "../../db/local-db";
import { useNfcCard } from "../../hooks/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { AdminLayout, type AdminView } from "../layout/AdminLayout";
import { AdminCardsPanel, type AdminCardRow } from "../block/AdminCardsPanel";
import { AdminAuditPanel, type AdminAuditEntry } from "../block/AdminAuditPanel";
import { AdminMembersPanel, type AdminUserRow } from "../block/AdminMembersPanel";
import { NfcScanDrawer } from "../block/NfcScanDrawer";
import { StationSection } from "./StationSection";
import { KioskSection } from "./KioskSection";

interface AdminSectionProps {
  tenantId: string;
  tenantName: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
  role: string;
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
  const qc = useQueryClient();

  const { grant } = useSessionGrant(tenantId, accountId, deviceId);
  const { state, scan, reset, cancel } = useNfcCard(grant, tenantId, terminalId);

  // Auto-close drawer after success
  useEffect(() => {
    if (state.phase === "success") {
      const timer = setTimeout(() => {
        reset();
        setIsDrawerOpen(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [state.phase, reset]);

  const handleScan = useCallback(() => {
    setIsDrawerOpen(true);
    scan();
  }, [scan]);

  const handleDrawerClose = useCallback(() => {
    if (state.phase === "scanning" || state.phase === "validating") {
      cancel();
    } else {
      reset();
    }
    setIsDrawerOpen(false);
  }, [state.phase, cancel, reset]);

  const handleDrawerOpenChange = useCallback(
    (open: boolean) => {
      if (!open) handleDrawerClose();
    },
    [handleDrawerClose],
  );

  // Queries
  const cards = useQuery<AdminCardRow[]>({
    queryKey: ["admin-cards", tenantId],
    queryFn: async () => {
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
      }));
    },
  });

  const audit = useQuery<AdminAuditEntry[]>({
    queryKey: ["admin-audit", tenantId],
    queryFn: () =>
      localDb.auditLog.where("tenantId").equals(tenantId).reverse().limit(100).toArray() as Promise<
        AdminAuditEntry[]
      >,
  });

  const members = useQuery<AdminUserRow[]>({
    queryKey: ["users", tenantId],
    queryFn: () =>
      localDb.users.where("tenantId").equals(tenantId).toArray() as Promise<AdminUserRow[]>,
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

  const deleteCard = useMutation({
    mutationFn: async ({ cardId }: { cardId: string }) => {
      await localDb.cards.delete([tenantId, cardId]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-cards", tenantId] }),
  });

  const blockCard = useMutation({
    mutationFn: async ({ cardId, reason }: { cardId: string; reason: string }) => {
      await localDb.cards.update([tenantId, cardId], {
        status: reason as Card["status"],
        lastActivityAt: Math.floor(Date.now() / 1000),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-cards", tenantId] }),
  });

  const unblockCard = useMutation({
    mutationFn: async ({ cardId }: { cardId: string }) => {
      await localDb.cards.update([tenantId, cardId], {
        status: "active",
        lastActivityAt: Math.floor(Date.now() / 1000),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-cards", tenantId] }),
  });

  const deleteMember = useMutation({
    mutationFn: async ({ userId }: { userId: number }) => {
      await localDb.users.delete([tenantId, userId]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users", tenantId] }),
  });

  async function handleCreateMember(name: string) {
    await createMember.mutateAsync({ name });
  }

  return (
    <AdminLayout
      tenantId={tenantId}
      tenantName={tenantName}
      role={role}
      activeSection={view}
      onSectionChange={setView}
    >
      {state.error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {state.error}
        </div>
      )}
      {view === "cards" && (
        <AdminCardsPanel
          cards={cards.data ?? []}
          isLoading={cards.isLoading}
          error={cards.error ? String(cards.error) : null}
          canScan={!!grant}
          isDeleting={deleteCard.isPending}
          isUpdatingStatus={blockCard.isPending || unblockCard.isPending}
          onScan={handleScan}
          onDeleteCard={(card) => deleteCard.mutate({ cardId: card.cardId })}
          onBlockCard={(card, reason) => blockCard.mutate({ cardId: card.cardId, reason })}
          onUnblockCard={(card) => unblockCard.mutate({ cardId: card.cardId })}
        />
      )}
      {view === "audit" && (
        <AdminAuditPanel
          entries={audit.data ?? []}
          isLoading={audit.isLoading}
          error={audit.error ? String(audit.error) : null}
        />
      )}
      {view === "members" && (
        <AdminMembersPanel
          members={members.data ?? []}
          isLoading={members.isLoading}
          isCreating={createMember.isPending}
          isToggling={toggleMemberStatus.isPending}
          isDeleting={deleteMember.isPending}
          onCreateMember={handleCreateMember}
          onToggleStatus={(userId, currentStatus) =>
            toggleMemberStatus.mutate({
              userId,
              status: currentStatus === "active" ? "suspended" : "active",
            })
          }
          onDeleteMember={(userId) => deleteMember.mutate({ userId })}
        />
      )}
      {view === "station" && (
        <StationSection
          tenantId={tenantId}
          tenantName={tenantName}
          accountId={accountId}
          deviceId={deviceId}
          terminalId={terminalId}
          role={role}
        />
      )}
      {view === "kiosk" && (
        <KioskSection
          tenantId={tenantId}
          tenantName={tenantName}
          accountId={accountId}
          deviceId={deviceId}
          terminalId={terminalId}
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
      />
    </AdminLayout>
  );
};
