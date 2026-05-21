import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { CreditCard, MoreHorizontal, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { ConfirmationDialogDrawer } from "../ui/confirmation-dialog-drawer";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import { DataTable } from "./data-table";
import type { StationCardRow } from "./StationCardsPanel";

interface StationCardListPanelProps {
  cards: StationCardRow[];
  isLoading: boolean;
  isDeleting: boolean;
  onTopupCard: (cardId: string) => void;
  onDeleteCard: (card: StationCardRow) => void;
  onIssueNew: () => void;
}

const columnHelper = createColumnHelper<StationCardRow>();

const columns = [
  columnHelper.accessor("userName", {
    header: "Pemilik",
    cell: (info) => {
      const row = info.row.original;
      return row.userName ?? (row.userId ? `User #${row.userId}` : "Tanpa Pemilik");
    },
  }),
  columnHelper.accessor("cardId", {
    header: "Card ID",
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const status = info.getValue();
      const isBlocked = status !== "active";
      return (
        <Badge variant={isBlocked ? "destructive" : "default"} className="text-[10px] px-1.5 py-0">
          {status === "active" ? "Aktif" : status.replace("blocked_", "Blokir ")}
        </Badge>
      );
    },
  }),
  columnHelper.accessor("balance", {
    header: () => <span className="text-right w-full block">Saldo</span>,
    cell: (info) => (
      <span className="text-right block">Rp {info.getValue()?.toLocaleString("id-ID")}</span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    enableSorting: false,
    cell: () => null, // Actions handled via renderMobileItem and row-level dropdown
  }),
];

export function StationCardListPanel({
  cards,
  isLoading,
  isDeleting,
  onTopupCard,
  onDeleteCard,
  onIssueNew,
}: StationCardListPanelProps) {
  const [deleteTarget, setDeleteTarget] = useState<StationCardRow | null>(null);
  const nfcSupported = typeof globalThis !== "undefined" && "NDEFReader" in globalThis;

  // Build columns with actions (needs closure over handlers)
  const columnsWithActions = [
    ...columns.slice(0, -1), // remove placeholder actions column
    columnHelper.display({
      id: "actions",
      header: "",
      enableSorting: false,
      cell: (info) => {
        const card = info.row.original;
        return (
          <CardActionsDropdown
            card={card}
            isDeleting={isDeleting}
            onTopup={() => onTopupCard(card.cardId)}
            onDelete={() => setDeleteTarget(card)}
          />
        );
      },
    }),
  ];

  return (
    <>
      <DataTable
        columns={columnsWithActions}
        data={cards}
        isLoading={isLoading}
        paginationMode="client"
        pageSize={10}
        searchPlaceholder="Cari kartu..."
        getRowId={(row) => row.cardId}
        header={
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{cards.length} kartu</span>
            <Button size="sm" onClick={onIssueNew} disabled={!nfcSupported}>
              <Plus />
              Cetak Kartu Baru
            </Button>
          </div>
        }
        emptyState={
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CreditCard size={40} className="text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Belum ada kartu terdaftar</p>
          </div>
        }
        renderMobileItem={(row) => {
          const card = row.original;
          const isBlocked = card.status !== "active";
          return (
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "size-8 rounded-lg flex items-center justify-center shrink-0",
                    isBlocked ? "bg-destructive/10" : "bg-primary/10",
                  )}
                >
                  {isBlocked ? (
                    <ShieldAlert size={14} className="text-destructive" />
                  ) : (
                    <CreditCard size={14} className="text-primary" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {card.userName ?? (card.userId ? `User #${card.userId}` : "Tanpa Pemilik")}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{card.cardId}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge
                      variant={isBlocked ? "destructive" : "default"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {card.status === "active"
                        ? "Aktif"
                        : card.status.replace("blocked_", "Blokir ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Rp {card.balance?.toLocaleString("id-ID")}
                    </span>
                  </div>
                </div>
              </div>

              <CardActionsDropdown
                card={card}
                isDeleting={isDeleting}
                onTopup={() => onTopupCard(card.cardId)}
                onDelete={() => setDeleteTarget(card)}
              />
            </div>
          );
        }}
      />

      <ConfirmationDialogDrawer
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Hapus Kartu?"
        description={
          <p>
            Kartu <strong className="font-mono">{deleteTarget?.cardId}</strong> akan dihapus secara
            permanen.
          </p>
        }
        confirmLabel="Hapus"
        cancelLabel="Batal"
        confirmVariant="destructive"
        processingLabel="Menghapus..."
        isProcessing={isDeleting}
        icon={
          <div className="flex items-center justify-center size-12 rounded-full bg-red-100">
            <Trash2 size={24} className="text-red-600" />
          </div>
        }
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteCard(deleteTarget);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

// ─── Extracted Dropdown ──────────────────────────────────────────────────────

function CardActionsDropdown({
  card,
  isDeleting,
  onTopup,
  onDelete,
}: {
  card: StationCardRow;
  isDeleting: boolean;
  onTopup: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreHorizontal size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onTopup} disabled={card.status !== "active"}>
          <CreditCard size={14} />
          Top-up
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete} disabled={isDeleting}>
          <Trash2 size={14} />
          Hapus Kartu
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
