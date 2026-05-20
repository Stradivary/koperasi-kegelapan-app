import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { usePrintEligibility } from "../../hooks/usePrintEligibility";
import type { StationUserRow } from "./StationCardsPanel";

/** Map reason codes to user-facing Indonesian messages */
function getReasonMessage(reason?: string): string | undefined {
  switch (reason) {
    case "CARD_NOT_FOUND":
      return "Kartu tidak ditemukan";
    case "CARD_BLOCKED":
      return "Kartu diblokir";
    case "NO_MEMBER_NO_BALANCE":
      return "Tidak ada anggota dan saldo kosong";
    default:
      return undefined;
  }
}

interface StationCardIssuePanelProps {
  members: StationUserRow[];
  isIssuing: boolean;
  cardId?: string | null;
  tenantId?: string;
  onIssueCard: (data: {
    name: string;
    userId: number | null;
    balance: number;
    expiresAt: number | null;
  }) => Promise<void>;
  onCancel: () => void;
}

export function StationCardIssuePanel({
  members,
  isIssuing,
  cardId,
  tenantId,
  onIssueCard,
  onCancel,
}: StationCardIssuePanelProps) {
  const [issueName, setIssueName] = useState("");
  const [issueUserId, setIssueUserId] = useState<number | null>(null);
  const [issueBalance, setIssueBalance] = useState("");
  const [issueExpiry, setIssueExpiry] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Evaluate print eligibility based on current card and form state
  const printEligibility = usePrintEligibility(
    cardId ?? null,
    { withMember: issueUserId !== null },
    tenantId ?? "",
  );
  const reasonMessage = getReasonMessage(printEligibility.reason);

  const activeMembers = members.filter((m) => m.status === "active");

  function handleIssueUserChange(userId: number | null) {
    setIssueUserId(userId);
    if (userId != null) {
      const member = activeMembers.find((m) => m.userId === userId);
      if (member) setIssueName(member.name);
    }
  }

  async function handleIssue() {
    setError(null);
    try {
      await onIssueCard({
        name: issueName.trim(),
        userId: issueUserId,
        balance: parseInt(issueBalance, 10) || 0,
        expiresAt: issueExpiry ? Math.floor(new Date(issueExpiry).getTime() / 1000) : null,
      });
      // Reset form on success — parent handles navigation
      setIssueName("");
      setIssueUserId(null);
      setIssueBalance("");
      setIssueExpiry("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  return (
    <div className="rounded-xl border p-4 space-y-4 max-w-sm bg-card">
      <h2 className="font-medium">Cetak Kartu Baru</h2>
      <p className="text-xs text-muted-foreground">
        Siapkan kartu NFC kosong. Data akan ditulis ke kartu dan didaftarkan otomatis.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex-1">
                    <Button
                      onClick={handleIssue}
                      disabled={!issueName.trim() || isIssuing || !printEligibility.enabled}
                      className="w-full"
                    >
                      Cetak &amp; Daftarkan
                    </Button>
                  </span>
                </TooltipTrigger>
                {!printEligibility.enabled && reasonMessage && (
                  <TooltipContent>
                    <p>{reasonMessage}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            <Button variant="outline" onClick={onCancel}>
              Batal
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
