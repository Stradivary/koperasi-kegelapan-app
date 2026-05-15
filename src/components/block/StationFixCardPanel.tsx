import { useState } from "react";
import { AlertTriangle, Wifi, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import type { StationCardRow, StationUserRow } from "./StationCardsPanel";

type FixPhase = "form" | "scanning" | "success" | "error";

interface StationFixCardPanelProps {
  cardId: string | null;
  cards: StationCardRow[];
  members: StationUserRow[];
  isFixing: boolean;
  hasGrant: boolean;
  onFixCard: (data: {
    cardId: string;
    userId: number | null;
    balance: number;
    expiresAt: number | null;
  }) => Promise<void>;
  onBack: () => void;
}

export function StationFixCardPanel({
  cardId: initialCardId,
  cards,
  members,
  isFixing,
  hasGrant,
  onFixCard,
  onBack,
}: StationFixCardPanelProps) {
  const [phase, setPhase] = useState<FixPhase>("form");
  const [cardId, setCardId] = useState(initialCardId ?? "");
  const [userId, setUserId] = useState<number | null>(null);
  const [balance, setBalance] = useState("");
  const [expiry, setExpiry] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeMembers = members.filter((m) => m.status === "active");

  // Pre-fill from existing card data if found
  const existingCard = cards.find((c) => c.cardId === cardId);

  function handlePrefill() {
    if (existingCard) {
      setUserId(existingCard.userId);
      setBalance(String(existingCard.balance ?? 0));
      setExpiry(existingCard.expiresAt ?? "");
    }
  }

  async function handleFix() {
    if (!cardId.trim()) {
      setError("ID Kartu wajib diisi");
      return;
    }
    setError(null);
    setPhase("scanning");
    try {
      await onFixCard({
        cardId: cardId.toLowerCase(),
        userId,
        balance: parseInt(balance, 10) || 0,
        expiresAt: expiry ? Math.floor(new Date(expiry).getTime() / 1000) : null,
      });
      setPhase("success");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setPhase("error");
    }
  }

  if (phase === "success") {
    return (
      <div className="rounded-lg border p-6 max-w-sm space-y-4">
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-20 h-20 rounded-full bg-green-50 border-2 border-green-500 flex items-center justify-center">
            <CheckCircle2 size={40} className="text-green-500" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-green-600">Kartu Berhasil Diperbaiki</p>
            <p className="text-sm text-muted-foreground mt-1">
              Kartu <span className="font-mono">{cardId}</span> telah ditulis ulang
            </p>
          </div>
        </div>
        <Button onClick={onBack} className="w-full">
          Kembali ke Daftar Kartu
        </Button>
      </div>
    );
  }

  if (phase === "scanning") {
    return (
      <div className="rounded-lg border p-6 max-w-sm space-y-4">
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="relative flex items-center justify-center w-32 h-32">
            <span className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
            <span className="absolute inset-4 rounded-full border-2 border-primary/30 animate-ping [animation-delay:300ms]" />
            <span className="relative z-10 w-20 h-20 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
              <Wifi size={32} className="text-primary animate-pulse" />
            </span>
          </div>
          <div className="text-center">
            <p className="font-medium">Tempelkan kartu ke pembaca NFC...</p>
            <p className="text-sm text-muted-foreground mt-1">Tahan kartu sampai proses selesai</p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-lg border p-6 max-w-sm space-y-4">
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-20 h-20 rounded-full bg-red-50 border-2 border-red-500 flex items-center justify-center">
            <XCircle size={40} className="text-red-500" />
          </div>
          <div className="text-center">
            <p className="font-bold text-destructive">Gagal Memperbaiki Kartu</p>
            {error && <p className="text-sm text-muted-foreground mt-1">{error}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setPhase("form")} className="flex-1">
            Coba Lagi
          </Button>
          <Button variant="outline" onClick={onBack}>
            Kembali
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-4 max-w-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle size={20} className="text-destructive shrink-0" />
        <h2 className="font-medium">Perbaiki Kartu Rusak</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Kartu terdeteksi rusak (tamper). Data akan ditulis ulang ke kartu dengan informasi yang
        benar.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-1.5">
        <Label>ID Kartu (hex)</Label>
        <div className="flex gap-2">
          <Input
            placeholder="046a8b2a1f3b80"
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            className="font-mono"
            readOnly={!!initialCardId}
          />
          {existingCard && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrefill}
              className="shrink-0"
            >
              Isi Otomatis
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Anggota</Label>
        <select
          value={userId ?? ""}
          onChange={(e) => setUserId(e.target.value ? parseInt(e.target.value, 10) : null)}
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
        <Label>Saldo (IDR)</Label>
        <Input
          type="number"
          placeholder="0"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
        />
        {existingCard && (
          <p className="text-xs text-muted-foreground">
            Saldo terakhir tercatat: Rp {existingCard.balance?.toLocaleString("id-ID")}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Kadaluarsa (opsional)</Label>
        <Input
          type="date"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          min={new Date().toISOString().split("T")[0]}
        />
      </div>

      {!hasGrant && (
        <p className="text-xs text-destructive">
          Sesi tidak aktif — muat ulang halaman untuk memperbarui.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          onClick={handleFix}
          disabled={!cardId.trim() || isFixing || !hasGrant}
          className="flex-1"
        >
          {isFixing ? "Memperbaiki..." : "Perbaiki & Tulis Ulang"}
        </Button>
        <Button variant="outline" onClick={onBack}>
          Batal
        </Button>
      </div>
    </div>
  );
}
