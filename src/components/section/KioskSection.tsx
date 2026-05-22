import { useNfcCard } from "../../hooks/nfc/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { useSyncEngineContext } from "../../hooks/SyncEngineContext";
import { CardStatusBadge } from "../block/CardStatusBadge";
import { Button } from "../ui/button";
import { LoadingState } from "../block/LoadingState";
import { NfcTapArea, NfcStatusLabel } from "../block/NfcTapArea";
import { applyDebit, isWriteEligible } from "#/core/state-machine/engine";
import { CardStatus } from "#/core/payload/types";
import { localDb } from "#/infrastructure/persistence/dexie/localDb";
import { useState } from "react";

interface KioskSectionProps {
  tenantId: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
}

const MAX_AMOUNT = 1_000_000;
const QUICK_AMOUNTS = [5_000, 10_000, 15_000, 20_000, 25_000, 50_000];

export function KioskSection({ tenantId, accountId, deviceId, terminalId }: KioskSectionProps) {
  const { grant, loading } = useSessionGrant(tenantId, accountId, deviceId);
  const { state, scan, write, reset } = useNfcCard(grant, tenantId, terminalId);
  const syncEngine = useSyncEngineContext();
  const [amount, setAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [step, setStep] = useState<"tap" | "confirm" | "register" | "done">("tap");
  const [registerBalance, setRegisterBalance] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState(false);

  function handleAmountSelect(val: number) {
    setAmount(String(val));
    setTxError(null);
    setStep("confirm");
  }

  async function handleConfirm() {
    if (!state.payload || !grant) return;
    const amt = Number.parseInt(amount, 10);
    if (amt > MAX_AMOUNT) {
      setTxError(`Maks Rp ${MAX_AMOUNT.toLocaleString("id-ID")}`);
      return;
    }
    if (state.payload.wallet.balance < amt) {
      setTxError("Saldo tidak cukup");
      return;
    }
    const eligibility = isWriteEligible(
      state.payload,
      grant,
      "debit",
      Math.floor(Date.now() / 1000),
    );
    if (!eligibility.eligible) {
      setTxError(eligibility.reason ?? "Tidak dapat diproses");
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const ok = await write(applyDebit(state.payload, amt, now), "debit");
    if (ok) {
      syncEngine?.notifyMutation();
      setStep("done");
    }
  }

  function handleReset() {
    reset();
    setAmount("");
    setTxError(null);
    setRegisterBalance("");
    setRegisterSuccess(false);
    setStep("tap");
  }

  async function handleRegister() {
    if (!state.payload) return;
    setTxError(null);

    const cardIdHex = Array.from(state.payload.header.cardId)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const balance = registerBalance
      ? Number.parseInt(registerBalance, 10)
      : state.payload.wallet.balance;

    const now = Math.floor(Date.now() / 1000);
    try {
      await localDb.cards.put({
        tenantId,
        cardId: cardIdHex,
        userId: null, // member linkage is resolved via DB, not card binary
        status: "active",
        balance,
        counter: Number(state.payload.wallet.counter),
        keyVersion: grant?.keyVersion ?? 1,
        createdAt: now,
        lastActivityAt: now,
        expiresAt: null,
        notes: state.payload.identity.name || null,
        syncStatus: "pending",
      });
      setRegisterSuccess(true);
      setStep("done");
    } catch (e) {
      setTxError(`Gagal mendaftarkan kartu: ${e}`);
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-0">
      {/* Session error */}
      {!grant && !loading && (
        <div className="w-full max-w-xs rounded-xl bg-signal-bg-error border border-signal-error/30 p-4">
          <p className="type-body1 text-signal-error text-center">
            Sesi tidak tersedia. Hubungi petugas.
          </p>
        </div>
      )}

      {/* Step: Tap card */}
      {step === "tap" && state.phase === "idle" && (
        <div className="flex flex-col items-center gap-6">
          <NfcTapArea phase="idle" onClick={scan} disabled={!grant || loading} />
          <Button
            onClick={scan}
            disabled={!grant || loading}
            className="w-full max-w-xs h-12 bg-brand hover:bg-brand/90 text-white type-title-bold"
          >
            {loading ? <LoadingState variant="button" text="Memuat sesi..." /> : "Mulai Transaksi"}
          </Button>
        </div>
      )}

      {/* Scanning */}
      {state.phase === "scanning" && (
        <div className="flex flex-col items-center gap-4">
          <NfcTapArea phase="scanning" />
          <NfcStatusLabel phase="scanning" />
        </div>
      )}

      {/* Error */}
      {state.phase === "error" && (
        <div className="flex flex-col items-center gap-4 w-full max-w-xs">
          <NfcTapArea phase="error" tamperDetected={state.tamperDetected} />
          <NfcStatusLabel phase="error" error={state.error} tamperDetected={state.tamperDetected} />
          <Button variant="outline" onClick={handleReset} className="w-full">
            Coba Lagi
          </Button>
        </div>
      )}

      {/* Card ready — choose amount */}
      {(state.phase === "ready" || state.phase === "writing") &&
        state.payload &&
        step !== "done" && (
          <div className="w-full max-w-xs space-y-4">
            {/* Card info */}
            <div className="bg-white rounded-2xl border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="type-title-bold text-foreground">{state.payload.identity.name}</p>
                <CardStatusBadge status={state.payload.identity.status} />
              </div>
              <div>
                <p className="type-body2 text-signal-text-secondary">Saldo</p>
                <p className="type-h4 text-brand font-heading">
                  Rp {state.payload.wallet.balance.toLocaleString("id-ID")}
                </p>
              </div>
            </div>

            {/* Quick amounts */}
            {state.payload.identity.status === CardStatus.ACTIVE && step === "tap" && (
              <>
                <p className="type-body1-bold text-foreground">Pilih nominal:</p>
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_AMOUNTS.map((v) => (
                    <button
                      key={v}
                      onClick={() => handleAmountSelect(v)}
                      disabled={state.payload!.wallet.balance < v}
                      className="rounded-xl border-2 border-brand/20 p-3 type-body1-bold text-brand hover:bg-brand hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {v / 1000}k
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Nominal lain"
                    className="flex-1 h-10 rounded-lg border border-input bg-background px-3 type-body1 focus:border-brand focus:outline-none"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setTxError(null);
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => setStep("confirm")}
                    disabled={!amount}
                    className="bg-brand hover:bg-brand/90 text-white"
                  >
                    OK
                  </Button>
                </div>
                {/* Register action — does not require amount selection */}
                <div className="border-t pt-3 mt-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep("register")}
                    className="w-full border-brand/30 text-brand hover:bg-brand/5"
                  >
                    Daftarkan Kartu
                  </Button>
                </div>
              </>
            )}

            {/* Confirm */}
            {step === "confirm" && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-brand/5 border border-brand/20 p-5 text-center">
                  <p className="type-body1 text-signal-text-secondary">Jumlah pembelian</p>
                  <p className="type-h3 text-brand font-heading mt-1">
                    Rp {Number.parseInt(amount || "0").toLocaleString("id-ID")}
                  </p>
                </div>
                {txError && <p className="type-body2 text-signal-error text-center">{txError}</p>}
                <Button
                  onClick={handleConfirm}
                  disabled={state.phase === "writing"}
                  className="w-full h-12 bg-brand hover:bg-brand/90 text-white type-title-bold"
                >
                  {state.phase === "writing" ? "Memproses..." : "Konfirmasi Pembayaran"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setStep("tap")}
                  disabled={state.phase === "writing"}
                  className="w-full"
                >
                  Batal
                </Button>
              </div>
            )}

            {/* Register — independent of amount selection */}
            {step === "register" && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-brand/5 border border-brand/20 p-5 text-center">
                  <p className="type-body1 text-signal-text-secondary">Daftarkan Kartu</p>
                  <p className="type-body2 text-signal-text-secondary mt-1">
                    {state.payload.identity.name || "Anggota"}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <p className="type-body2 text-signal-text-secondary">
                    Saldo awal (opsional, default: saldo kartu saat ini)
                  </p>
                  <input
                    type="number"
                    placeholder={String(state.payload.wallet.balance)}
                    className="w-full h-10 rounded-lg border border-input bg-background px-3 type-body1 focus:border-brand focus:outline-none"
                    value={registerBalance}
                    onChange={(e) => {
                      setRegisterBalance(e.target.value);
                      setTxError(null);
                    }}
                  />
                  <div className="flex gap-1.5">
                    {[50_000, 100_000, 200_000].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setRegisterBalance(String(v))}
                        className="flex-1 rounded border px-2 py-1 text-xs hover:bg-muted transition-colors"
                      >
                        {v / 1000}k
                      </button>
                    ))}
                  </div>
                </div>
                {txError && <p className="type-body2 text-signal-error text-center">{txError}</p>}
                <Button
                  onClick={handleRegister}
                  className="w-full h-12 bg-brand hover:bg-brand/90 text-white type-title-bold"
                >
                  Daftarkan
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("tap");
                    setRegisterBalance("");
                    setTxError(null);
                  }}
                  className="w-full"
                >
                  Batal
                </Button>
              </div>
            )}
          </div>
        )}

      {/* Done */}
      {step === "done" && state.payload && (
        <div className="w-full max-w-xs space-y-4">
          <div className="rounded-2xl bg-signal-bg-valid border border-signal-valid/30 p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-signal-valid/10 flex items-center justify-center mx-auto mb-3">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#008E53"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="type-title-bold text-signal-valid">
              {registerSuccess ? "Kartu Berhasil Didaftarkan" : "Transaksi Berhasil"}
            </p>
            <p className="type-h4 text-signal-valid font-heading mt-1">
              Rp {state.payload.wallet.balance.toLocaleString("id-ID")}
            </p>
            <p className="type-body2 text-signal-valid/70 mt-0.5">
              {registerSuccess ? "Saldo terdaftar" : "Saldo tersisa"}
            </p>
          </div>
          <Button
            onClick={handleReset}
            className="w-full h-12 bg-brand hover:bg-brand/90 text-white type-title-bold"
          >
            Selesai
          </Button>
        </div>
      )}
    </div>
  );
}
