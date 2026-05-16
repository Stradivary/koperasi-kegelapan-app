# Task 03 — Terminal: Ganti Debit Manual dengan Checkout

## Tujuan

Terminal saat ini hanya punya debit manual (input nominal → kurangi saldo). Terminal seharusnya menjadi titik **checkout**: anggota tap kartu, sistem menghitung durasi & biaya dari saat check-in, lalu konfirmasi untuk checkout.

Debit manual **dipindahkan ke Kiosk** (sudah ada di KioskSection).

---

## State Machine yang Berlaku untuk Terminal

```
IDLE           → (tidak bisa checkout, belum check-in)
CHECKED_IN     → gate_checkout    → CHECKED_OUT  ✓
TERMINAL_OPERATION → force_checkout → CHECKED_OUT  ✓
CHECKED_OUT    → (sudah checkout, tidak bisa diproses lagi)
```

Trigger yang dipakai: sama seperti GateSection —

- `gate_checkout` jika state `CHECKED_IN`
- `force_checkout` jika state `TERMINAL_OPERATION`

Fungsi yang dipakai: `applyCheckout(payload, nowSeconds)` dari `src/core/state-machine/engine.ts` — sudah menghitung durasi + fee.

---

## Preview Fee (sebelum write)

`applyCheckout()` **memodifikasi** payload dan belum tentu ingin di-write sebelum konfirmasi. Hitung preview secara manual:

```ts
const nowSeconds = Math.floor(Date.now() / 1000);
const durationSeconds = nowSeconds - payload.session.startTime;
const hours = Math.ceil(durationSeconds / 3600);
const fee = Math.min(hours * PARKING_RATE_PER_HOUR, payload.wallet.balance);
```

Import `PARKING_RATE_PER_HOUR` dari `src/core/state-machine/engine.ts` (sudah di-export).

---

## Perubahan di `src/components/section/TerminalSection.tsx`

### Yang dihapus

- Import `applyDebit`, `isWriteEligible` dari engine
- State `amountInput`, `txError`
- Fungsi `handleDebit()`
- JSX: input nominal, tombol "Bayar"
- Const `MAX_TRANSACTION_AMOUNT`

### Yang ditambahkan

- Import `applyCheckout`, `validateTransition`, `PARKING_RATE_PER_HOUR` dari engine
- Import `CardState` dari payload types
- Fungsi `handleCheckout()` (lihat bawah)
- UI: checkout confirmation card (entry time, duration, fee)
- UI: success card (durasi, biaya dikurangi, saldo baru)

### Implementasi `handleCheckout()`

```ts
async function handleCheckout() {
  if (!state.payload || !grant) return;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const cardState = state.payload.wallet.state;
  const trigger = cardState === CardState.TERMINAL_OPERATION ? "force_checkout" : "gate_checkout";
  const result = validateTransition(state.payload, trigger, nowSeconds);
  if (!result.valid) {
    // Tampilkan ke state error — tidak perlu alert()
    return;
  }
  await write(applyCheckout(state.payload, nowSeconds));
}
```

### Layout "Card Ready" yang baru

Setelah kartu di-scan dan phase adalah `"ready"`:

**Jika `wallet.state === CHECKED_IN` atau `TERMINAL_OPERATION`** → tampilkan checkout card:

```
┌─────────────────────────────┐
│ [nama anggota]   [status]   │
│ Waktu Masuk: 14:32          │
│ Durasi: 2 jam 15 menit      │
│ Biaya: Rp 6.000             │
│ Saldo saat ini: Rp 45.000   │
│ Saldo setelah: Rp 39.000    │
│ [Konfirmasi Checkout]       │
└─────────────────────────────┘
```

**Jika `wallet.state === IDLE`** → tampilkan:

```
┌─────────────────────────────┐
│ Anggota belum check-in      │
│ [Selesai]                   │
└─────────────────────────────┘
```

**Jika `wallet.state === CHECKED_OUT`** → tampilkan:

```
┌─────────────────────────────┐
│ Anggota sudah checkout      │
│ [Selesai]                   │
└─────────────────────────────┘
```

### Fase `"success"` — tampilkan ringkasan

```
┌─────────────────────────────┐
│ ✓ Checkout Berhasil         │
│ [nama anggota]              │
│ Durasi: 2 jam 15 menit      │
│ Biaya: Rp 6.000             │
│ Saldo: Rp 39.000            │
│ [Scan Berikutnya]           │
└─────────────────────────────┘
```

Untuk data success, simpan durasi & fee ke local state sebelum `write()` dipanggil:

```ts
const [lastTx, setLastTx] = useState<{ durationSeconds: number; fee: number } | null>(null);

// Di dalam handleCheckout(), sebelum write():
const durationSeconds = nowSeconds - state.payload.session.startTime;
const hours = Math.ceil(durationSeconds / 3600);
const fee = Math.min(hours * PARKING_RATE_PER_HOUR, state.payload.wallet.balance);
setLastTx({ durationSeconds, fee });
await write(applyCheckout(state.payload, nowSeconds));
```

### Format waktu & durasi (helper inline)

```ts
function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} jam ${m} menit`;
  return `${m} menit`;
}
```

---

## Komponen & Layer

Sesuai aturan atomic-ui-split:

- **TerminalSection** (Section layer) → tetap orkestrator: holds state, calls hooks, calls `write()`
- Jika JSX melebihi ~150 baris setelah perubahan, ekstrak `CheckoutConfirmCard` sebagai Block:
  ```
  src/components/block/CheckoutConfirmCard.tsx
  ```
  dengan props: `payload`, `durationSeconds`, `fee`, `onConfirm`, `phase`
- `formatTime` dan `formatDuration` → pindahkan ke `src/lib/formatters.ts` jika dipakai lebih dari 1 tempat

---

## Urutan Implementasi

1. Hapus `handleDebit()`, state `amountInput`/`txError`, dan JSX terkait dari `TerminalSection.tsx`
2. Tambah state `lastTx` dan fungsi `handleCheckout()`
3. Update JSX "card ready" sesuai state machine card
4. Update JSX "success" untuk tampilkan ringkasan
5. Hapus import yang tidak lagi dipakai (`applyDebit`, `isWriteEligible`, `MAX_TRANSACTION_AMOUNT`)
6. Cek TypeScript errors — pastikan tidak ada unused imports

---

## Test Checklist

- [ ] Kartu CHECKED_IN di-scan → tampil waktu masuk, durasi, biaya preview
- [ ] Tombol konfirmasi → kartu berhasil ditulis (state jadi CHECKED_OUT)
- [ ] Success screen menampilkan durasi + biaya yang benar
- [ ] Kartu IDLE di-scan → tampil "belum check-in", tidak ada tombol checkout
- [ ] Kartu CHECKED_OUT di-scan → tampil "sudah checkout"
- [ ] Kartu TERMINAL_OPERATION di-scan → bisa force_checkout
- [ ] Durasi 0 menit → biaya 1 jam (karena `Math.ceil`)
- [ ] Saldo tidak cukup untuk biaya penuh → biaya = saldo (fee capped)
- [ ] Tidak ada input nominal atau tombol "Bayar" tersisa di UI

---

## Risiko

| Risiko                                                              | Mitigasi                                                                                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `lastTx` di-set tapi write gagal → success screen dengan data salah | Hanya tampilkan `lastTx` saat `phase === "success"` (sudah di-write); atau reset `lastTx` jika write gagal |
| `session.startTime === 0` (kartu tidak punya sesi)                  | `durationSeconds` bisa sangat besar → fee di-cap oleh `Math.min(fee, balance)` — safe                      |
| Pemisahan `handleCheckout` dipanggil dua kali (double-tap)          | `state.phase === "writing"` akan menolak karena `write()` sedang berjalan                                  |
