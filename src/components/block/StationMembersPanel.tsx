import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Ban, CheckCircle2, Clock, MoreHorizontal, Plus, Trash, UserCheck } from "lucide-react";
import { ConfirmationDialogDrawer } from "../ui/confirmation-dialog-drawer";
import { PromptDialogDrawer } from "../ui/prompt-dialog-drawer";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { DataTable } from "./data-table";

export interface StationMemberRow {
  userId: string;
  name: string;
  status: string;
  syncStatus: "pending" | "synced";
}

interface StationMembersPanelProps {
  members: StationMemberRow[];
  isLoading: boolean;
  isCreating: boolean;
  isToggling: boolean;
  isDeleting?: boolean;
  onCreateMember: (name: string) => Promise<void>;
  onToggleStatus: (userId: string, currentStatus: string) => void;
  onDeleteMember?: (userId: string) => void;
}

const columnHelper = createColumnHelper<StationMemberRow>();

const SYNC_BADGE_VARIANT: Record<StationMemberRow["syncStatus"], "default" | "secondary"> = {
  synced: "default",
  pending: "secondary",
};

export function StationMembersPanel({
  members,
  isLoading,
  isCreating,
  isToggling,
  isDeleting,
  onCreateMember,
  onToggleStatus,
  onDeleteMember,
}: StationMembersPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StationMemberRow | null>(null);

  async function handleCreate(name: string) {
    await onCreateMember(name);
    setAddOpen(false);
  }

  // Build columns with action handlers in closure
  const columns = [
    columnHelper.accessor("name", {
      header: "Nama",
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    }),
    columnHelper.accessor("userId", {
      header: "ID",
      cell: (info) => <span className="text-xs text-muted-foreground">#{info.getValue()}</span>,
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const status = info.getValue();
        return (
          <Badge
            variant={status === "active" ? "default" : "destructive"}
            className="text-[10px] px-1.5 py-0"
          >
            {status === "active" ? "Aktif" : "Ditangguhkan"}
          </Badge>
        );
      },
    }),
    columnHelper.accessor("syncStatus", {
      header: "Sync",
      cell: (info) => (
        <Badge variant={SYNC_BADGE_VARIANT[info.getValue()]} className="text-[10px] px-1.5 py-0">
          {info.getValue() === "synced" ? "Synced" : "Pending"}
        </Badge>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      enableSorting: false,
      cell: (info) => {
        const m = info.row.original;
        return (
          <MemberActionsDropdown
            member={m}
            isToggling={isToggling}
            isDeleting={isDeleting}
            onToggleStatus={() => onToggleStatus(m.userId, m.status)}
            onDelete={onDeleteMember ? () => setDeleteTarget(m) : undefined}
          />
        );
      },
    }),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground"> </span>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus size={14} className="mr-1" />
          Tambah Anggota
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={members}
        isLoading={isLoading}
        paginationMode="client"
        pageSize={10}
        searchPlaceholder="Cari anggota..."
        showSearch={true}
        getRowId={(row) => row.userId}
        emptyState={
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <UserCheck size={40} className="text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Belum ada anggota terdaftar</p>
          </div>
        }
        renderMobileItem={(row) => {
          const m = row.original;
          const isSynced = m.syncStatus === "synced";
          const isActive = m.status === "active";
          return (
            <div className="px-4 py-3 bg-white">
              {/* Row 1: avatar + name + action */}
              <div className="flex items-center gap-3">
                <div
                  className={`size-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                >
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    {isSynced ? (
                      <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                    ) : (
                      <Clock size={12} className="text-amber-500 shrink-0" />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">#{m.userId}</span>
                </div>
                <MemberActionsDropdown
                  member={m}
                  isToggling={isToggling}
                  isDeleting={isDeleting}
                  onToggleStatus={() => onToggleStatus(m.userId, m.status)}
                  onDelete={onDeleteMember ? () => setDeleteTarget(m) : undefined}
                />
              </div>
              {/* Row 2: status badge */}
              <div className="pl-12">
                <Badge
                  variant={isActive ? "default" : "destructive"}
                  className="text-[10px] px-1.5 py-0"
                >
                  {isActive ? "Aktif" : "Ditangguhkan"}
                </Badge>
              </div>
            </div>
          );
        }}
      />

      <PromptDialogDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Tambah Anggota"
        description="Masukkan nama lengkap anggota baru."
        inputLabel="Nama Lengkap"
        inputPlaceholder="Ahmad Rifai"
        confirmLabel="Daftarkan"
        cancelLabel="Batal"
        isProcessing={isCreating}
        processingLabel="Menyimpan..."
        validate={(value) => (value.trim().length === 0 ? "Nama tidak boleh kosong" : undefined)}
        onConfirm={handleCreate}
        icon={
          <div className="flex items-center justify-center size-12 rounded-full bg-primary/10">
            <UserCheck size={24} className="text-primary" />
          </div>
        }
      />

      <ConfirmationDialogDrawer
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Hapus Anggota?"
        description={
          <p>
            Anggota <strong>"{deleteTarget?.name}"</strong> (#{deleteTarget?.userId}) akan dihapus
            secara permanen.
          </p>
        }
        confirmLabel="Hapus"
        cancelLabel="Batal"
        confirmVariant="destructive"
        processingLabel="Menghapus..."
        isProcessing={isDeleting}
        icon={
          <div className="flex items-center justify-center size-12 rounded-full bg-red-100">
            <Trash size={24} className="text-red-600" />
          </div>
        }
        onConfirm={() => {
          if (deleteTarget && onDeleteMember) {
            onDeleteMember(deleteTarget.userId);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─── Extracted Dropdown ──────────────────────────────────────────────────────

function MemberActionsDropdown({
  member,
  isToggling,
  isDeleting,
  onToggleStatus,
  onDelete,
}: {
  member: StationMemberRow;
  isToggling: boolean;
  isDeleting?: boolean;
  onToggleStatus: () => void;
  onDelete?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreHorizontal size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {member.status === "active" ? (
          <DropdownMenuItem onClick={onToggleStatus} disabled={isToggling}>
            <Ban size={14} />
            Tangguhkan
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onToggleStatus} disabled={isToggling}>
            <CheckCircle2 size={14} />
            Aktifkan
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete} disabled={isDeleting}>
              <Trash size={14} />
              Hapus Member
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
