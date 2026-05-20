import { useState, useMemo } from "react";
import {
  Ban,
  CreditCard,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Unlock,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { LoadingState } from "../block/LoadingState";
import { cn } from "../../lib/utils";
import type { StationCardRow } from "./StationCardsPanel";

interface StationCardListPanelProps {
  cards: StationCardRow[];
  isLoading: boolean;
  isUpdatingStatus: boolean;
  isDeleting: boolean;
  isResetting: boolean;
  onTopupCard: (cardId: string) => void;
  onUpdateCardStatus: (card: StationCardRow, newStatus: string) => void;
  onDeleteCard: (card: StationCardRow) => void;
  onResetCard: (card: StationCardRow) => void;
  onIssueNew: () => void;
}

export function StationCardListPanel({
  cards,
  isLoading,
  isUpdatingStatus,
  isDeleting,
  isResetting,
  onTopupCard,
  onUpdateCardStatus,
  onDeleteCard,
  onResetCard,
  onIssueNew,
}: StationCardListPanelProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 10;
  const nfcSupported = typeof globalThis !== "undefined" && "NDEFReader" in globalThis;

  const filtered = useMemo(() => {
    if (!search.trim()) return cards;
    const q = search.toLowerCase();
    return cards.filter(
      (c) =>
        c.cardId.toLowerCase().includes(q) ||
        (c.userName?.toLowerCase().includes(q) ?? false) ||
        String(c.userId).includes(q),
    );
  }, [cards, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{cards.length} kartu</span>
        <div className="flex gap-2">
          <Button size="sm" onClick={onIssueNew} disabled={!nfcSupported}>
            <Plus />
            Cetak Kartu Baru
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Cari kartu..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && <LoadingState variant="inline" />}

      <div className="rounded-2xl border divide-y overflow-hidden">
        {paginated.map((card) => {
          const isBlocked = card.status !== "active";
          return (
            <div
              key={card.cardId}
              className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
            >
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => onTopupCard(card.cardId)}
                    disabled={card.status !== "active"}
                  >
                    <CreditCard size={14} />
                    Top-up
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {card.status === "active" ? (
                    <DropdownMenuItem
                      onClick={() => onUpdateCardStatus(card, "blocked_admin")}
                      disabled={isUpdatingStatus}
                    >
                      <Ban size={14} />
                      Blokir Kartu
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => onResetCard(card)} disabled={isResetting}>
                        <RotateCcw size={14} />
                        Reset Status Kartu
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onUpdateCardStatus(card, "active")}
                        disabled={isUpdatingStatus}
                      >
                        <Unlock size={14} />
                        Buka Blokir
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      if (confirm(`Hapus kartu ${card.cardId}?`)) {
                        onDeleteCard(card);
                      }
                    }}
                    disabled={isDeleting}
                  >
                    <Trash2 size={14} />
                    Hapus Kartu
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
        {paginated.length === 0 && !isLoading && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            {search ? (
              <>
                <Search size={40} className="text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Tidak ditemukan untuk "{search}"</p>
              </>
            ) : (
              <>
                <CreditCard size={40} className="text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Belum ada kartu terdaftar</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari{" "}
            {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ‹
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              {page}/{totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              ›
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
