import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Ban, CheckCircle2, MoreHorizontal, Plus, Trash, UserCheck } from "lucide-react";
import { ConfirmationDialogDrawer } from "../ui/confirmation-dialog-drawer";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
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

type MemberView = "list" | "add";

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
  const [memberView, setMemberView] = useState<MemberView>("list");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StationMemberRow | null>(null);

  async function handleCreate() {
    setError(null);
    try {
      await onCreateMember(name);
      setMemberView("list");
      setName("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
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
      {memberView === "list" && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground"> </span>
          <Button
            size="sm"
            onClick={() => {
              setMemberView("add");
              setError(null);
            }}
          >
            <Plus size={14} className="mr-1" />
            Tambah Anggota
          </Button>
        </div>
      )}

      {memberView === "add" && (
        <div className="rounded-xl border p-4 space-y-3 max-w-sm">
          <h2 className="font-medium">Anggota Baru</h2>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label>Nama Lengkap</Label>
            <Input
              placeholder="Ahmad Rifai"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleCreate();
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={!name.trim() || isCreating} className="flex-1">
              {isCreating ? "Menyimpan..." : "Daftarkan"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setMemberView("list");
                setError(null);
              }}
            >
              Batal
            </Button>
          </div>
        </div>
      )}

      {memberView === "list" && (
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
            return (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-semibold text-primary">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted-foreground">#{m.userId}</span>
                      <Badge
                        variant={m.status === "active" ? "default" : "destructive"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {m.status === "active" ? "Aktif" : "Ditangguhkan"}
                      </Badge>
                      <Badge
                        variant={SYNC_BADGE_VARIANT[m.syncStatus]}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {m.syncStatus === "synced" ? "Synced" : "Pending"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <MemberActionsDropdown
                  member={m}
                  isToggling={isToggling}
                  isDeleting={isDeleting}
                  onToggleStatus={() => onToggleStatus(m.userId, m.status)}
                  onDelete={onDeleteMember ? () => setDeleteTarget(m) : undefined}
                />
              </div>
            );
          }}
        />
      )}

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
