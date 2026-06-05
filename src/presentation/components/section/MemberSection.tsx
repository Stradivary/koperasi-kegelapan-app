import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { localDb, type User } from "#/presentation/hooks/useLocalDb";
import { useSyncEngineContext } from "#/presentation/hooks/SyncEngineContext";
import { StationMembersPanel } from "../block/StationMembersPanel";
import type { StationUserRow } from "../block/StationCardsPanel";

interface MemberSectionProps {
  tenantId: string;
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

export function MemberSection({ tenantId }: Readonly<MemberSectionProps>) {
  const qc = useQueryClient();
  const syncEngineCtx = useSyncEngineContext();

  const members = useQuery<StationUserRow[]>({
    queryKey: ["users", tenantId],
    queryFn: async () => {
      const all = await localDb.users.where("tenantId").equals(tenantId).toArray();
      return all
        .filter((u) => u.status !== "deleted")
        .map((u) => ({
          userId: u.userId,
          name: u.name,
          status: u.status,
          syncStatus: u.syncStatus ?? "synced",
        }));
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
      syncEngineCtx?.notifyMutation();
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
          if (card.status === "active") {
            await localDb.cards.update([tenantId, card.cardId], {
              status: "blocked_admin",
              lastActivityAt: Math.floor(Date.now() / 1000),
              syncStatus: "pending",
            });
          }
        } else if (status === "active") {
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
      syncEngineCtx?.notifyMutation();
    },
  });

  const deleteMember = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const now = Math.floor(Date.now() / 1000);

      await localDb.users.update([tenantId, userId], {
        status: "deleted",
        updatedAt: now,
        syncStatus: "pending",
      });

      const linkedCards = await localDb.cards
        .where("tenantId")
        .equals(tenantId)
        .filter((card) => card.userId === userId && card.status !== "deleted")
        .toArray();

      for (const card of linkedCards) {
        await localDb.cards.update([tenantId, card.cardId], {
          status: "deleted",
          lastActivityAt: now,
          syncStatus: "pending",
        });
      }
    },
    onSuccess: () => {
      toast.success("Anggota berhasil dihapus");
      qc.invalidateQueries({ queryKey: ["users", tenantId] });
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      syncEngineCtx?.notifyMutation();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Gagal menghapus anggota. Silakan coba lagi.",
      );
    },
  });

  return (
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
  );
}
