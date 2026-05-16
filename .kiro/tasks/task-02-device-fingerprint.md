# Task 02 — Device Fingerprint (Anti-Clone)

## Tujuan

Saat ini `getOrCreateDeviceId.tsx` menghasilkan UUID yang disimpan di `localStorage`. Jika `localStorage` + `IndexedDB` disalin ke perangkat lain, UUID ikut tersalin dan session grant tetap valid. Perlu diganti dengan **fingerprint berbasis hardware** yang deterministik per perangkat dan berbeda di hardware lain.

## Serangan yang Dicegah

1. Salin `localStorage` + `IndexedDB` ke browser/device lain
2. Gunakan credentials yang sudah tersimpan tanpa memiliki perangkat asli

## Pendekatan: Browser Fingerprint via Canvas + Hardware Signals

Fingerprint dihitung dari sinyal-sinyal berikut (digabung → SHA-256 → 32-char hex):

| Sinyal                                             | Alasan dipilih                            |
| -------------------------------------------------- | ----------------------------------------- |
| Canvas rendering                                   | GPU & font rendering berbeda per hardware |
| `navigator.hardwareConcurrency`                    | Jumlah core CPU                           |
| `screen.width × height × colorDepth`               | Resolusi & kedalaman warna monitor        |
| `Intl.DateTimeFormat().resolvedOptions().timeZone` | Timezone konfigurasi OS                   |
| `navigator.language`                               | Bahasa OS/browser                         |
| `navigator.userAgent`                              | Platform & browser version                |

**Cache**: disimpan di `sessionStorage` (bukan localStorage) sehingga dihitung ulang setiap browser session, menghindari nilai stale akibat update browser.

---

## File yang Diubah

### 1. `src/lib/getOrCreateDeviceId.tsx` → ganti seluruh implementasi

```ts
const CACHE_KEY = "koperasi-device-fp";

async function computeFingerprint(): Promise<string> {
  // Canvas fingerprint
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 60;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f0e";
  ctx.fillRect(0, 0, 240, 60);
  ctx.fillStyle = "#069";
  ctx.font = "bold 14px 'Arial'";
  ctx.fillText("Koperasi Wallet v2", 4, 20);
  ctx.fillStyle = "rgba(80, 200, 50, 0.8)";
  ctx.beginPath();
  ctx.arc(60, 45, 12, 0, Math.PI * 2);
  ctx.fill();
  const canvasData = canvas.toDataURL("image/png");

  const signals = [
    canvasData,
    navigator.userAgent,
    String(navigator.hardwareConcurrency ?? 0),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
  ].join("|fp|");

  const encoded = new TextEncoder().encode(signals);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function getDeviceFingerprint(): Promise<string> {
  const cached = sessionStorage.getItem(CACHE_KEY);
  if (cached) return cached;
  const fp = await computeFingerprint();
  sessionStorage.setItem(CACHE_KEY, fp);
  return fp;
}
```

> **Catatan breaking change**: fungsi berubah dari sync `getOrCreateDeviceId()` → async `getDeviceFingerprint()`. Semua pemanggil harus di-await.

### 2. Cari semua pemanggil `getOrCreateDeviceId`

Jalankan pencarian di codebase:

```
grep -r "getOrCreateDeviceId" src/
```

Update setiap pemanggil untuk menggunakan `await getDeviceFingerprint()`. Pemanggil yang diketahui:

- `src/lib/localTenant.ts` — saat login/setup, simpan fingerprint ke `TenantContext.deviceId`
- Mungkin ada di route setup / login page

### 3. `src/hooks/useTenantContext.tsx` — validasi fingerprint saat load

Setelah `context` berhasil di-load dari IndexedDB, bandingkan dengan runtime fingerprint:

```ts
// Di dalam loadTenantContext(), setelah mendapatkan context:
const runtimeFp = await getDeviceFingerprint();
if (context.deviceId !== runtimeFp) {
  // Perangkat berbeda → hapus konteks, redirect ke login
  await tenantContextStore.delete(tenantId);
  setTenantContext(null);
  setLoading(false);
  navigate({ to: "/", search: { redirect: `/tenant/${tenantId}` }, replace: true });
  return;
}
```

Tambah import: `import { getDeviceFingerprint } from "../lib/getOrCreateDeviceId";`

Fungsi `loadTenantContext` di `useTenantContext.tsx` harus menjadi async (sudah async — tinggal tambah await).

### 4. `src/lib/localTenant.ts` — set fingerprint saat login

Cari titik di mana `TenantContext` dibuat/di-save (biasanya saat local login atau setup awal). Pastikan:

```ts
const deviceId = await getDeviceFingerprint();
await tenantContextStore.put({
  ...existingContext,
  deviceId, // ganti nilai lama dengan fingerprint runtime
  updatedAt: Date.now(),
});
```

Ini memastikan setiap kali login, `TenantContext.deviceId` di-refresh ke fingerprint device saat ini.

### 5. `src/hooks/useSessionGrant.ts` — tidak perlu diubah

`useSessionGrant` menerima `deviceId` sebagai prop dari caller (Section). Caller (Section) mendapat `deviceId` dari `TenantContext` yang sudah di-validasi di langkah 3. Tidak ada perubahan diperlukan.

---

## Urutan Implementasi

1. Ubah `getOrCreateDeviceId.tsx` (fungsi baru async)
2. Update semua import → `getDeviceFingerprint`
3. Update `localTenant.ts` untuk set fingerprint saat login
4. Update `useTenantContext.tsx` untuk validasi fingerprint saat load
5. Test di dua perangkat berbeda

---

## Test Checklist

- [ ] Login di Device A → `TenantContext.deviceId` berisi fingerprint Device A
- [ ] Buka app di Device A lagi → fingerprint cocok, masuk normal
- [ ] Salin IndexedDB ke Device B → `useTenantContext` detect mismatch → redirect ke login
- [ ] Login ulang di Device B → fingerprint Device B tersimpan, berjalan normal
- [ ] Browser update minor di Device A → fingerprint **tidak** berubah signifikan (sinyal hardware stabil)
- [ ] Canvas dinonaktifkan (mode incognito beberapa browser) → fallback ke sinyal lain, fingerprint tetap ter-generate

---

## Risiko

| Risiko                                                                    | Mitigasi                                                                                                                                                    |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas diblokir (privacy browser / Tor)                                   | `canvas.toDataURL()` akan mengembalikan data blank → fingerprint berbeda setiap session; user harus login ulang tiap session. Acceptable untuk use case ini |
| Browser major update mengubah rendering engine                            | Fingerprint berubah → user forced re-login. Acceptable — user tinggal login ulang                                                                           |
| Dua device identik (same hardware, same OS) menghasilkan fingerprint sama | Sangat unlikely; jika terjadi, petugas yang sama di device sama — tidak jadi masalah operasional                                                            |
| `sessionStorage` ter-clear saat tab ditutup                               | Fingerprint di-recompute saat tab dibuka ulang. Ini correct behavior                                                                                        |
