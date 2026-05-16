import { useState, useMemo } from "react";
import { Ban, CheckCircle2, MoreHorizontal, Plus, Search, UserCheck } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { LoadingState } from "./LoadingState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export interface StationMemberRow {
  userId: number;
  name: string;
  status: string;
}

type MemberView = "list" | "add";

interface StationMembersPanelProps {
  members: StationMemberRow[];
  isLoading: boolean;
  isCreating: boolean;
  isToggling: boolean;
  onCreateMember: (name: string) => Promise<void>;
  onToggleStatus: (userId: number, currentStatus: string) => void;
}

const PAGE_SIZE = 10;

export function StationMembersPanel({
  members,
  isLoading,
  isCreating,
  isToggling,
  onCreateMember,
  onToggleStatus,
}: StationMembersPanelProps) {
  const [memberView, setMemberView] = useState<MemberView>("list");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Filter
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

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

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

  return (
    <div className="space-y-4">
      {memberView === "list" && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{members.length} anggota</span>
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
        <div className="rounded-lg border p-4 space-y-3 max-w-sm">
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
        <>
          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Cari anggota..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* List */}
          <div className="rounded-lg border divide-y overflow-hidden">
            {isLoading && <LoadingState variant="inline" />}
            {!isLoading &&
              paginated.map((m) => (
                <div
                  key={m.userId}
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            {!isLoading && paginated.length === 0 && (
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
                    <UserCheck size={24} className="text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">Belum ada anggota terdaftar</p>
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
        </>
      )}
    </div>
  );
}
