import { useState, useMemo } from "react";
import {
  Ban,
  CheckCircle2,
  CreditCard,
  MoreHorizontal,
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export interface AdminCardRow {
  cardId: string;
  userId: number | null;
  userName: string | null;
  status: string;
  balance: number;
  counter: number;
}

interface AdminCardsPanelProps {
  cards: AdminCardRow[];
  isLoading: boolean;
  error: string | null;
  canScan: boolean;
  isDeleting: boolean;
  isUpdatingStatus?: boolean;
  onScan: () => void;
  onDeleteCard: (card: AdminCardRow) => void;
  onBlockCard?: (card: AdminCardRow, reason: string) => void;
  onUnblockCard?: (card: AdminCardRow) => void;
}

const PAGE_SIZE = 10;

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "destructive" | "secondary" | "outline";
    icon: typeof CreditCard;
  }
> = {
  active: { label: "Aktif", variant: "default", icon: CheckCircle2 },
  blocked_admin: { label: "Diblokir (Admin)", variant: "destructive", icon: Ban },
  blocked_tamper: { label: "Diblokir (Tamper)", variant: "destructive", icon: ShieldAlert },
  blocked_fraud: { label: "Diblokir (Fraud)", variant: "destructive", icon: ShieldAlert },
  blocked_expired: { label: "Kadaluarsa", variant: "secondary", icon: Ban },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, variant: "outline" as const, icon: CreditCard };
}

export function AdminCardsPanel({
  cards,
  isLoading,
  error,
  canScan,
  isDeleting,
  isUpdatingStatus,
  onScan,
  onDeleteCard,
  onBlockCard,
  onUnblockCard,
}: AdminCardsPanelProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Filter cards
  const filtered = useMemo(() => {
    let result = cards;
    if (statusFilter !== "all") {
      result = result.filter((c) => {
        if (statusFilter === "blocked") return c.status !== "active";
        return c.status === statusFilter;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.cardId.toLowerCase().includes(q) ||
          (c.userName?.toLowerCase().includes(q) ?? false) ||
          String(c.userId).includes(q),
      );
    }
    return result;
  }, [cards, search, statusFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleFilterChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const activeCount = cards.filter((c) => c.status === "active").length;
  const blockedCount = cards.filter((c) => c.status !== "active").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="type-title-bold text-foreground">Daftar Kartu</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {cards.length} kartu · {activeCount} aktif · {blockedCount} diblokir
          </p>
        </div>
        <Button size="sm" onClick={onScan} disabled={!canScan}>
          <CreditCard size={14} className="mr-1" />
          Scan Kartu NFC
        </Button>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Cari ID kartu, nama, atau user ID..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          aria-label="Filter status"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="blocked">Diblokir</option>
          <option value="blocked_admin">Blokir Admin</option>
          <option value="blocked_tamper">Blokir Tamper</option>
          <option value="blocked_fraud">Blokir Fraud</option>
          <option value="blocked_expired">Kadaluarsa</option>
        </select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="rounded-2xl border divide-y">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="px-4 py-3 flex items-center justify-between gap-3 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-muted" />
                <div className="space-y-2">
                  <div className="h-3 w-28 bg-muted rounded" />
                  <div className="h-2.5 w-44 bg-muted rounded" />
                </div>
              </div>
              <div className="space-y-2 text-right">
                <div className="h-3 w-16 bg-muted rounded ml-auto" />
                <div className="h-2.5 w-10 bg-muted rounded ml-auto" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Card list */}
      {!isLoading && !error && (
        <div className="rounded-2xl border divide-y overflow-hidden">
          {paginated.map((card) => {
            const config = getStatusConfig(card.status);
            const isBlocked = card.status !== "active";
            return (
              <div
                key={card.cardId}
                className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={[
                      "size-9 rounded-lg flex items-center justify-center shrink-0",
                      isBlocked ? "bg-destructive/10" : "bg-primary/10",
                    ].join(" ")}
                  >
                    {isBlocked ? (
                      <ShieldAlert size={16} className="text-destructive" />
                    ) : (
                      <CreditCard size={16} className="text-primary" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {card.userName ?? (card.userId ? `User #${card.userId}` : "Tanpa Pemilik")}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {card.cardId}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      Rp {card.balance?.toLocaleString("id-ID")}
                    </p>
                    <Badge variant={config.variant} className="text-[10px] px-1.5 py-0">
                      {config.label}
                    </Badge>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                        {card.cardId.slice(0, 12)}...
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />

                      {isBlocked && onUnblockCard && (
                        <DropdownMenuItem
                          onClick={() => onUnblockCard(card)}
                          disabled={isUpdatingStatus}
                        >
                          <Unlock size={14} />
                          Buka Blokir (Aktifkan)
                        </DropdownMenuItem>
                      )}

                      {!isBlocked && onBlockCard && (
                        <DropdownMenuItem
                          onClick={() => onBlockCard(card, "blocked_admin")}
                          disabled={isUpdatingStatus}
                        >
                          <Ban size={14} />
                          Blokir Kartu
                        </DropdownMenuItem>
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
              </div>
            );
          })}
          {paginated.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              {search || statusFilter !== "all" ? (
                <>
                  <Search size={40} className="text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Tidak ditemukan kartu yang cocok</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("all");
                    }}
                  >
                    Reset Filter
                  </Button>
                </>
              ) : (
                <>
                  <CreditCard size={40} className="text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Belum ada kartu terdaftar</p>
                  <p className="text-xs text-muted-foreground/70">
                    Gunakan tombol Scan Kartu NFC untuk mendaftarkan kartu baru
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}{" "}
            dari {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ‹ Prev
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? "default" : "outline"}
                  size="sm"
                  className="w-8 h-8 p-0"
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next ›
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
