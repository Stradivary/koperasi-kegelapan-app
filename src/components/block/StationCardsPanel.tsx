import { useState, useMemo } from "react";
import { Ban, CreditCard, MoreHorizontal, RotateCcw, Search, ShieldAlert, Trash2, Unlock } from "lucide-react";
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
import { LoadingState } from "../block/LoadingState";
import { cn } from "../../lib/utils";

export interface StationCardRow {
  cardId: string;
  userId: number | null;
  userName: string | null;
  status: string;
  balance: number;
  counter: number;
  expiresAt: string | null;
}

export interface StationUserRow {
  userId: number;
  name: string;
  status: string;
}

type CardView = "list" | "issue";

interface StationCardsPanelProps {
  cards: StationCardRow[];
  members: StationUserRow[];
  isLoading: boolean;
  isTopping: boolean;
  isIssuing: boolean;
  isUpdatingStatus: boolean;
  isDeleting: boolean;
  isResetting: boolean;
  hasGrant: boolean;
  onTopupCard: (cardId: string) => void;
  onIssueCard: (data: {
    name: string;
    userId: number | null;
    balance: number;
    expiresAt: number | null;
  }) => Promise<void>;
  onUpdateCardStatus: (card: StationCardRow, newStatus: string) => void;
  onDeleteCard: (card: StationCardRow) => void;
  onResetCard: (card: StationCardRow) => void;
}

export function StationCardsPanel({
  cards,
  members,
  isLoading,
  isTopping: _isTopping,
  isIssuing,
  isUpdatingStatus,
  isDeleting,
  isResetting,
  hasGrant: _hasGrant,
  onTopupCard,
  onIssueCard,
  onUpdateCardStatus,
  onDeleteCard,
  onResetCard,
}: StationCardsPanelProps) {
  const [cardView, setCardView] = useState<CardView>("list");
  const [issueName, setIssueName] = useState("");
  const [issueUserId, setIssueUserId] = useState<number | null>(null);
  const [issueBalance, setIssueBalance] = useState("");
  const [issueExpiry, setIssueExpiry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 10;
  const nfcSupported = typeof globalThis !== "undefined" && "NDEFReader" in globalThis;
  const activeMembers = members.filter((m) => m.status === "active");

  // Filter and paginate cards
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

  const dismissMessages = () => {
    setError(null);
    setSuccess(null);
  };
  const goToList = () => {
    setCardView("list");
    dismissMessages();
  };

  async function handleIssue() {
    setError(null);
    try {
      await onIssueCard({
        name: issueName.trim(),
        userId: issueUserId,
        balance: parseInt(issueBalance, 10) || 0,
        expiresAt: issueExpiry ? Math.floor(new Date(issueExpiry).getTime() / 1000) : null,
      });
      setSuccess("Kartu berhasil dicetak dan didaftarkan");
      goToList();
      setIssueName("");
      setIssueUserId(null);
      setIssueBalance("");
      setIssueExpiry("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  function handleIssueUserChange(userId: number | null) {
    setIssueUserId(userId);
    if (userId != null) {
      const member = activeMembers.find((m) => m.userId === userId);
      if (member) setIssueName(member.name);
    }
  }

  return (
    <div className="space-y-4">
      {cardView === "list" && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{cards.length} kartu</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCardView("issue");
                dismissMessages();
              }}
              disabled={!nfcSupported}
            >
              Cetak Kartu Baru
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      {/* Card list */}
      {cardView === "list" && (
        <div className="space-y-3">
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

          <div className="rounded-lg border divide-y overflow-hidden">
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
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {card.cardId}
                      </p>
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
                          <DropdownMenuItem
                            onClick={() => onResetCard(card)}
                            disabled={isResetting}
                          >
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
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                {search ? (
                  <>
                    <Search size={24} className="text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      Tidak ditemukan untuk "{search}"
                    </p>
                  </>
                ) : (
                  <>
                    <CreditCard size={24} className="text-muted-foreground/40" />
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
      )}

      {/* Issue fresh card — write to blank NFC card */}
      {cardView === "issue" && (
        <div className="rounded-lg border p-4 space-y-4 max-w-sm bg-card">
          <h2 className="font-medium">Cetak Kartu Baru</h2>
          <p className="text-xs text-muted-foreground">
            Siapkan kartu NFC kosong. Data akan ditulis ke kartu dan didaftarkan otomatis.
          </p>

          {isIssuing ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="h-16 w-16 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              <p className="text-sm font-medium">Tempelkan kartu ke pembaca NFC...</p>
              <p className="text-xs text-muted-foreground text-center">
                Tahan kartu sampai proses selesai
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Anggota</Label>
                <select
                  value={issueUserId ?? ""}
                  onChange={(e) =>
                    handleIssueUserChange(e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                  aria-label="Anggota"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Tanpa anggota —</option>
                  {activeMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} (#{m.userId})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Nama di kartu</Label>
                <Input
                  placeholder="Nama lengkap pemegang kartu"
                  value={issueName}
                  readOnly
                  onChange={(e) => setIssueName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Saldo Awal (IDR)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={issueBalance}
                  onChange={(e) => setIssueBalance(e.target.value)}
                />
                <div className="grid gap-1.5 grid-cols-3">
                  {[10_000, 20_000, 50_000, 100_000, 150_000, 200_000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setIssueBalance(String(v))}
                      className="flex-1 rounded border px-2 py-1 text-xs hover:bg-muted transition-colors"
                    >
                      {v / 1000}k
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Kadaluarsa (opsional)</Label>
                <Input
                  type="date"
                  value={issueExpiry}
                  onChange={(e) => setIssueExpiry(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleIssue}
                  disabled={!issueName.trim() || isIssuing}
                  className="flex-1"
                >
                  Cetak &amp; Daftarkan
                </Button>
                <Button variant="outline" onClick={goToList}>
                  Batal
                </Button>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
}
