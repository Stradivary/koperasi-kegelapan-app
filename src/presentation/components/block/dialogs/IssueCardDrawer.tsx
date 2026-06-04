import { useState } from "react";
import { CreditCard } from "lucide-react";
import successHandImg from "#/assets/images/success_hand.svg";
import failedImg from "#/assets/images/nfc/failed.svg";
import type { CardPayload, NfcPhase } from "#/presentation/hooks/types";
import { MIN_ISSUANCE_BALANCE } from "#/presentation/hooks/domain";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "../../ui/drawer";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { NfcTapArea, StepIndicator } from "../UnifiedNfcScanner";
import type { StationUserRow } from "../StationCardsPanel";

export interface IssueCardFormData {
  name: string;
  userId: string | null;
  balance: number;
  expiresAt: number | null;
}

interface IssueCardDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "form" = filling in details, "scanning" = waiting for NFC tap, "writing" = writing to card, "done" = success, "error" = failed */
  phase: "form" | "scanning" | "writing" | "done" | "error";
  payload: CardPayload | null;
  error: string | null;
  members: StationUserRow[];
  onIssue: (data: IssueCardFormData) => void;
  onClose: () => void;
  onRetry: () => void;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Maps IssueCardDrawer phase to NfcPhase for sub-component compatibility. */
function toNfcPhase(phase: IssueCardDrawerProps["phase"]): NfcPhase {
  switch (phase) {
    case "form":
      return "idle";
    case "scanning":
      return "scanning";
    case "writing":
      return "writing";
    case "done":
      return "success";
    case "error":
      return "error";
  }
}

export function IssueCardDrawer({
  open,
  onOpenChange,
  phase,
  payload,
  error,
  members,
  onIssue,
  onClose,
  onRetry,
}: Readonly<IssueCardDrawerProps>) {
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [expiry, setExpiry] = useState("");

  const nfcPhase = toNfcPhase(phase);

  const isForm = phase === "form";
  const isScanning = phase === "scanning";
  const isWriting = phase === "writing";
  const isBusy = isScanning || isWriting;
  const isDone = phase === "done";
  const isError = phase === "error";

  const activeMembers = members.filter((m) => m.status === "active");

  const parsedAmount = Number.parseInt(amount, 10);
  const isValidAmount = !Number.isNaN(parsedAmount) && parsedAmount >= MIN_ISSUANCE_BALANCE;
  const canSubmit = name.trim().length > 0 && isValidAmount;

  function handleUserChange(selectedUserId: string | null) {
    setUserId(selectedUserId);
    if (selectedUserId) {
      const member = activeMembers.find((m) => m.userId === selectedUserId);
      if (member) setName(member.name);
    }
  }

  function handleConfirm() {
    if (!canSubmit) return;
    const expiresAt = expiry ? Math.floor(new Date(expiry).getTime() / 1000) : null;
    onIssue({
      name: name.trim(),
      userId,
      balance: parsedAmount,
      expiresAt,
    });
  }

  function handleOpenChange(o: boolean) {
    if (!o) {
      setUserId(null);
      setName("");
      setAmount("");
      setExpiry("");
    }
    onOpenChange(o);
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} direction="bottom" repositionInputs={false}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {isForm && "Cetak Kartu Baru"}
            {isScanning && "Tempelkan Kartu NFC"}
            {isWriting && "Menulis ke Kartu..."}
            {isDone && "Kartu Berhasil Dicetak"}
            {isError && "Gagal"}
          </DrawerTitle>
          <DrawerDescription>
            {isForm && "Isi data kartu, lalu tempelkan kartu NFC kosong"}
            {isScanning && "Dekatkan kartu NFC ke perangkat"}
            {isWriting && "Tahan kartu sampai proses selesai"}
            {isDone && payload && `Saldo awal: ${formatRupiah(payload.wallet.balance)}`}
          </DrawerDescription>
        </DrawerHeader>

        {/* Step Indicator */}
        <div className="px-4 py-2">
          <StepIndicator
            phase={nfcPhase}
            labels={{
              step1: "Isi Data",
              step2: "Tap Kartu",
              step3: "Tulis",
              step4: "Selesai",
            }}
          />
        </div>

        <div className="px-4 overflow-y-auto flex-1 min-h-0">
          {/* Form phase */}
          {isForm && (
            <div className="space-y-4 py-4">
              {/* Account / member selection */}
              <div className="space-y-1.5">
                <Label>Anggota</Label>
                <select
                  value={userId ?? ""}
                  onChange={(e) => handleUserChange(e.target.value || null)}
                  aria-label="Anggota"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">- Tanpa anggota -</option>
                  {activeMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} (#{m.userId})
                    </option>
                  ))}
                </select>
              </div>

              {/* Name on card - auto-filled from member, still editable */}
              <div className="space-y-1.5">
                <Label>Nama di kartu</Label>
                <Input
                  placeholder="Nama lengkap pemegang kartu"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Initial balance */}
              <div className="space-y-2">
                <Label>Saldo Awal (IDR)</Label>
                <Input
                  type="number"
                  placeholder="Min. 2.000"
                  min={MIN_ISSUANCE_BALANCE}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <div className="grid grid-cols-3 gap-2">
                  {[10_000, 20_000, 50_000, 100_000, 150_000, 200_000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(String(v))}
                      className="rounded-lg border p-2 text-sm hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      {v / 1000}k
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional expiry */}
              <div className="space-y-1.5">
                <Label>
                  Kadaluarsa <span className="text-muted-foreground font-normal">(opsional)</span>
                </Label>
                <Input
                  type="date"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>
          )}

          {/* Scanning / Writing */}
          {isBusy && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <NfcTapArea phase={nfcPhase} />
              <div className="text-center space-y-1">
                {isScanning && (
                  <>
                    <p className="text-sm font-medium text-foreground">Menunggu kartu...</p>
                    <p className="text-xs text-muted-foreground">
                      Dekatkan kartu ke bagian belakang perangkat
                    </p>
                  </>
                )}
                {isWriting && (
                  <>
                    <p className="text-sm font-medium text-signal-warning">
                      Tap &amp; tahan kartu ke perangkat
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Jangan pindahkan kartu sampai proses selesai
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Success */}
          {isDone && (
            <div className="flex flex-col items-center py-6 gap-4">
              <img
                src={successHandImg}
                alt="Kartu Berhasil Dicetak"
                className="w-44 h-44 object-contain drop-shadow-md"
              />
              <div className="text-center">
                <p className="text-lg font-bold text-signal-valid">Kartu Berhasil Dicetak</p>
                {payload && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Saldo awal: {formatRupiah(payload.wallet.balance)}
                  </p>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Menutup otomatis...</p>
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="flex flex-col items-center py-6 gap-4">
              <img
                src={failedImg}
                alt="Gagal"
                className="w-44 h-44 object-contain drop-shadow-md"
              />
              <div className="text-center">
                <p className="font-bold text-signal-error">Gagal</p>
                {error && <p className="text-sm text-muted-foreground mt-1">{error}</p>}
              </div>
            </div>
          )}
        </div>

        <DrawerFooter>
          {isForm && (
            <>
              <Button
                onClick={handleConfirm}
                disabled={!canSubmit}
                className="w-full bg-brand-dark hover:bg-brand-dark/90 text-white"
              >
                <CreditCard size={16} />
                Cetak &amp; Daftarkan
              </Button>
              <Button variant="outline" onClick={onClose} className="w-full">
                Batal
              </Button>
            </>
          )}
          {isBusy && (
            <Button variant="outline" onClick={onClose} className="w-full">
              Batalkan
            </Button>
          )}
          {isDone && (
            <Button variant="outline" onClick={onClose} className="w-full">
              Tutup
            </Button>
          )}
          {isError && (
            <>
              <Button
                onClick={onRetry}
                className="w-full bg-brand-dark hover:bg-brand-dark/90 text-white"
              >
                Coba Lagi
              </Button>
              <Button variant="outline" onClick={onClose} className="w-full">
                Tutup
              </Button>
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
