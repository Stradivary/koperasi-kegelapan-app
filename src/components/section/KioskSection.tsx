import { useNfcCard } from '../../hooks/useNfcCard'
import { useSessionGrant } from '../../hooks/useSessionGrant'
import { CardStatusBadge } from '../block/CardStatusBadge'
import { TransactionList } from '../block/TransactionList'
import { Button } from '../ui/button'
import { applyDebit } from '../../core/state-machine/engine'
import { isWriteEligible } from '../../core/state-machine/engine'
import { CardStatus } from '../../core/payload/types'
import { useState } from 'react'

interface KioskSectionProps {
  tenantId: string
  accountId: string
  deviceId: string
  terminalId: number
}

const MAX_AMOUNT = 1_000_000

export function KioskSection({ tenantId, accountId, deviceId, terminalId }: KioskSectionProps) {
  const { grant, loading } = useSessionGrant(tenantId, accountId, deviceId)
  const { state, scan, write, reset } = useNfcCard(grant, tenantId, terminalId)
  const [amount, setAmount] = useState('')
  const [txError, setTxError] = useState<string | null>(null)
  const [step, setStep] = useState<'tap' | 'confirm' | 'done'>('tap')

  function handleAmountSelect(val: number) {
    setAmount(String(val))
    setTxError(null)
    setStep('confirm')
  }

  async function handleConfirm() {
    if (!state.payload || !grant) return
    const amt = parseInt(amount, 10)
    if (amt > MAX_AMOUNT) { setTxError(`Max Rp ${MAX_AMOUNT.toLocaleString()}`); return }
    if (state.payload.wallet.balance < amt) { setTxError('Saldo tidak cukup'); return }

    const eligibility = isWriteEligible(state.payload, grant, 'debit', Math.floor(Date.now() / 1000))
    if (!eligibility.eligible) { setTxError(eligibility.reason ?? 'Tidak dapat diproses'); return }

    const now = Math.floor(Date.now() / 1000)
    const ok = await write(applyDebit(state.payload, amt, now))
    if (ok) setStep('done')
  }

  function handleReset() {
    reset()
    setAmount('')
    setTxError(null)
    setStep('tap')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-xs space-y-6 text-center">

        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-primary">Koperasi Kegelapan</h1>
          <p className="text-sm text-muted-foreground">Mesin Kasir Mandiri</p>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Memuat...</p>}
        {!grant && !loading && (
          <p className="text-sm text-destructive">Sesi tidak tersedia. Hubungi petugas.</p>
        )}

        {/* Step 1: Tap */}
        {state.phase === 'idle' && step === 'tap' && (
          <div className="space-y-4">
            <div className="rounded-2xl border-2 border-dashed border-primary/30 p-8">
              <p className="text-4xl mb-3">📳</p>
              <p className="font-semibold">Tempelkan kartu Anda</p>
              <p className="text-sm text-muted-foreground mt-1">Dekatkan ke area NFC</p>
            </div>
            <Button onClick={scan} disabled={!grant} className="w-full h-14 text-base">
              Mulai Transaksi
            </Button>
          </div>
        )}

        {state.phase === 'scanning' && (
          <div className="rounded-2xl border-2 border-primary/20 p-8 space-y-2">
            <p className="text-4xl animate-pulse">📳</p>
            <p className="font-medium">Menunggu kartu...</p>
          </div>
        )}

        {state.phase === 'error' && (
          <div className="rounded-xl border border-destructive p-4 space-y-3">
            <p className="text-sm font-medium text-destructive">
              {state.tamperDetected ? '⚠️ Kartu terdeteksi rusak' : 'Gagal membaca kartu'}
            </p>
            <p className="text-xs text-muted-foreground">{state.error}</p>
            <Button variant="outline" onClick={handleReset} className="w-full">Coba Lagi</Button>
          </div>
        )}

        {/* Step 2: Card read — choose amount */}
        {(state.phase === 'ready' || state.phase === 'writing') && state.payload && step !== 'done' && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4 text-left space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{state.payload.identity.name}</p>
                <CardStatusBadge status={state.payload.identity.status} />
              </div>
              <p className="text-2xl font-bold text-primary">
                Rp {state.payload.wallet.balance.toLocaleString()}
              </p>
            </div>

            {state.payload.identity.status === CardStatus.ACTIVE && step === 'tap' && (
              <>
                <p className="text-sm font-medium text-left">Pilih nominal:</p>
                <div className="grid grid-cols-3 gap-2">
                  {[5_000, 10_000, 15_000, 20_000, 25_000, 50_000].map((v) => (
                    <button
                      key={v}
                      onClick={() => handleAmountSelect(v)}
                      disabled={state.payload!.wallet.balance < v}
                      className="rounded-lg border p-2 text-sm font-medium hover:bg-primary hover:text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {(v / 1000)}k
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Nominal lain"
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setTxError(null) }}
                  />
                  <Button size="sm" onClick={() => setStep('confirm')} disabled={!amount}>OK</Button>
                </div>
              </>
            )}

            {step === 'confirm' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                  <p className="text-sm text-muted-foreground">Jumlah pembelian</p>
                  <p className="text-3xl font-bold text-primary">Rp {parseInt(amount || '0').toLocaleString()}</p>
                </div>
                {txError && <p className="text-xs text-destructive">{txError}</p>}
                <Button onClick={handleConfirm} disabled={state.phase === 'writing'} className="w-full h-12">
                  {state.phase === 'writing' ? 'Memproses...' : 'Konfirmasi'}
                </Button>
                <Button variant="outline" onClick={() => setStep('tap')} disabled={state.phase === 'writing'} className="w-full">
                  Batal
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Done */}
        {step === 'done' && state.payload && (
          <div className="space-y-4">
            <div className="rounded-2xl border-2 border-green-500 bg-green-50 p-6">
              <p className="text-3xl mb-2">✅</p>
              <p className="font-semibold text-green-700">Transaksi Berhasil</p>
              <p className="text-2xl font-bold text-green-700 mt-1">
                Rp {state.payload.wallet.balance.toLocaleString()}
              </p>
              <p className="text-xs text-green-600 mt-1">Saldo tersisa</p>
            </div>
            <TransactionList entries={state.payload.logEntries} sessionStart={state.payload.session.startTime} />
            <Button onClick={handleReset} className="w-full h-12">Selesai</Button>
          </div>
        )}
      </div>
    </div>
  )
}
