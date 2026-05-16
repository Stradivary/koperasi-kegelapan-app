import { useState, useMemo } from "react";
import { Ban, CheckCircle2, MoreHorizontal, Plus, Search, Trash2, UserCheck } from "lucide-react";
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

export interface AdminUserRow {
  userId: number;
  name: string;
  status: string;
  createdAt: number;
}

interface AdminMembersPanelProps {
  members: AdminUserRow[];
  isLoading: boolean;
  isCreating: boolean;
  isToggling: boolean;
  isDeleting?: boolean;
  onCreateMember: (name: string) => Promise<void>;
  onToggleStatus: (userId: number, currentStatus: string) => void;
  onDeleteMember?: (userId: number) => void;
}

const PAGE_SIZE = 10;

export function AdminMembersPanel({
  members,
  isLoading,
  isCreating,
  isToggling,
  isDeleting,
  onCreateMember,
  onToggleStatus,
  onDeleteMember,
}: AdminMembersPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Filter members by search
  const filtered = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q) || String(m.userId).includes(q));
  }, [members, search]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // Reset page when search changes
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  async function handleCreate() {
    setError(null);
    try {
      await onCreateMember(name);
      setShowForm(false);
      setName("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  const activeCount = members.filter((m) => m.status === "active").length;
  const suspendedCount = members.filter((m) => m.status !== "active").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Anggota</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {members.length} anggota · {activeCount} aktif · {suspendedCount} ditangguhkan
          </p>
        </div>
        {!showForm && (
          <Button
            size="sm"
            onClick={() => {
              setShowForm(true);
              setError(null);
            }}
          >
            <Plus size={14} className="mr-1" />
            Tambah Anggota
          </Button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-medium">Anggota Baru</h3>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label className="text-xs">Nama Lengkap</Label>
            <Input
              placeholder="Ahmad Rifai"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleCreate();
              }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button className="flex-1" onClick={handleCreate} disabled={!name.trim() || isCreating}>
              {isCreating ? "Menyimpan..." : "Daftarkan"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
            >
              Batal
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Cari nama atau ID anggota..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      {isLoading && (
        <div className="rounded-lg border divide-y">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="px-4 py-3 flex items-center justify-between gap-3 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-full bg-muted" />
                <div className="space-y-2">
                  <div className="h-3 w-32 bg-muted rounded" />
                  <div className="h-2.5 w-20 bg-muted rounded" />
                </div>
              </div>
              <div className="h-7 w-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="rounded-lg border divide-y overflow-hidden">
          {paginated.map((m) => (
            <div
              key={m.userId}
              className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-semibold text-primary">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{m.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">#{m.userId}</span>
                    <Badge
                      variant={m.status === "active" ? "default" : "destructive"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {m.status === "active" ? "Aktif" : "Ditangguhkan"}
                    </Badge>
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
                  {m.status === "active" ? (
                    <DropdownMenuItem
                      onClick={() => onToggleStatus(m.userId, m.status)}
                      disabled={isToggling}
                    >
                      <Ban size={14} />
                      Tangguhkan
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => onToggleStatus(m.userId, m.status)}
                      disabled={isToggling}
                    >
                      <CheckCircle2 size={14} />
                      Aktifkan
                    </DropdownMenuItem>
                  )}
                  {onDeleteMember && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          if (confirm(`Hapus anggota "${m.name}" (#${m.userId})?`)) {
                            onDeleteMember(m.userId);
                          }
                        }}
                        disabled={isDeleting}
                      >
                        <Trash2 size={14} />
                        Hapus Anggota
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          {paginated.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              {search ? (
                <>
                  <Search size={32} className="text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Tidak ditemukan anggota untuk "{search}"
                  </p>
                </>
              ) : (
                <>
                  <UserCheck size={32} className="text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Belum ada anggota terdaftar</p>
                  <p className="text-xs text-muted-foreground/70">
                    Tambahkan anggota pertama menggunakan tombol di atas
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
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
