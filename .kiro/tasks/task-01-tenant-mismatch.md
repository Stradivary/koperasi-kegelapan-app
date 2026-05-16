# Task 01 — Tenant Mismatch Enforcement

## Tujuan

Kartu yang diterbitkan oleh tenant A harus **ditolak** apabila di-scan di perangkat tenant B.
Saat ini `sessionValidator.ts` sudah siap menerima `cardTenantId`, tapi `CardPayload` tidak punya field tersebut dan validasi tidak pernah terjadi.

## Pendekatan: Tenant Binding di Header

Header buffer memakai 12 byte (`magic 4 + version 1 + type 1 + cardId 6`), namun `IDENTITY_OFFSET = 16`, artinya **bytes 12–15 tidak pernah dibaca/ditulis**. Bytes ini dipakai sebagai `tenantBind: number` — FNV-32a hash dari `tenantId` string.

- `tenantBind === 0` → kartu lama/tidak terikat → skip cek (backward compat)
- `tenantBind !== 0` dan tidak cocok → `TENANT_MISMATCH`

## File yang Diubah (urutan implementasi)

### 1. `src/core/payload/types.ts`

Tambah field `tenantBind` di `CardPayload.header`:

```ts
// BEFORE
header: {
  magic: number;
  version: number;
  type: number;
  cardId: Uint8Array; // 6 bytes
}

// AFTER
header: {
  magic: number;
  version: number;
  type: number;
  cardId: Uint8Array; // 6 bytes
  tenantBind: number; // FNV-32a hash of tenantId; 0 = unbound legacy card
}
```

### 2. `src/core/payload/engine.ts` — `decodeBuffer()` (line 55)

Tambah pembacaan bytes 12–15 di dalam `decodeBuffer`:

```ts
// BEFORE — header berhenti di cardId
const header = {
  magic: view.getUint32(HEADER_OFFSET, true),
  version: view.getUint8(HEADER_OFFSET + 4),
  type: view.getUint8(HEADER_OFFSET + 5),
  cardId: buf.slice(HEADER_OFFSET + 6, HEADER_OFFSET + 12),
};

// AFTER
const header = {
  magic: view.getUint32(HEADER_OFFSET, true),
  version: view.getUint8(HEADER_OFFSET + 4),
  type: view.getUint8(HEADER_OFFSET + 5),
  cardId: buf.slice(HEADER_OFFSET + 6, HEADER_OFFSET + 12),
  tenantBind: view.getUint32(HEADER_OFFSET + 12, true), // bytes 12–15
};
```

### 3. `src/core/payload/engine.ts` — `encodeBuffer()` (line 106)

Tambah penulisan `tenantBind` di `encodeBuffer` setelah penulisan `cardId`:

```ts
// Setelah baris: buf.set(payload.header.cardId.slice(0, 6), HEADER_OFFSET + 6);
view.setUint32(HEADER_OFFSET + 12, payload.header.tenantBind ?? 0, true);
```

### 4. Buat file baru: `src/core/payload/tenantBind.ts`

File ini menyediakan utilitas FNV-32a untuk menghitung dan memvalidasi tenant binding:

```ts
// FNV-32a hash — deterministik, tidak butuh async, cukup untuk 4-byte binding
export function fnv32a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function encodeTenantBind(tenantId: string): number {
  return fnv32a(tenantId);
}

export function isTenantBindValid(tenantBind: number, tenantId: string): boolean {
  if (tenantBind === 0) return true; // legacy unbound card → allow
  return tenantBind === fnv32a(tenantId);
}
```

### 5. `src/core/nfc/pipelineEngine.ts` — `validateCard()` (line 114)

Tambah pengecekan `tenantBind` setelah validasi HMAC dan counterBind:

```ts
import { isTenantBindValid } from "../payload/tenantBind";

// Setelah blok counterBind check:
if (!isTenantBindValid(payload.header.tenantBind, sessionGrant.tenantId)) {
  return {
    valid: false,
    reason: "Kartu bukan milik tenant ini",
    tamper: false,
  };
}
```

### 6. Card Issuance — set `tenantBind` saat kartu pertama kali ditulis

Cari di codebase semua tempat yang membuat payload baru (biasanya `card-issuance` / admin). Pastikan `header.tenantBind = encodeTenantBind(tenantId)` di-set saat issuance.

Cari: `applyIssuance` atau `card-issuance` di `src/core/state-machine/` dan `src/components/section/ScoutSection.tsx`.

### 7. Error Display

`TENANT_MISMATCH` error sudah ter-handle di `useUnifiedNfc.ts` via `onError` callback → `state.error`. Tidak butuh perubahan di hook.

Pastikan UI (NfcTapArea, NfcStatusLabel, atau error display di section terkait) menampilkan `state.error?.message` saat `state.phase === "error"`. Ini sudah ada di GateSection dan TerminalSection.

---

## Test Checklist

- [ ] Kartu tenant A di-scan di gate tenant A → sukses
- [ ] Kartu tenant A di-scan di gate tenant B → error "Kartu bukan milik tenant ini"
- [ ] Kartu lama (tenantBind === 0) di-scan → **tidak** ditolak (backward compat)
- [ ] Kartu baru yang diterbitkan → `tenantBind` ter-set di bytes 12–15 header
- [ ] Decode → encode → decode menghasilkan `tenantBind` yang sama (round-trip)
- [ ] Unit test untuk `fnv32a` dan `isTenantBindValid`

---

## Risiko

| Risiko                                                                 | Mitigasi                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Kartu lama (tenantBind=0) masih bisa dipakai lintas tenant             | Terima untuk backward compat; wajibkan re-issuance via admin secara bertahap |
| FNV-32 collision (birthday ~65k tenant IDs)                            | Tidak relevan untuk use case ini (jumlah tenant kecil)                       |
| `encodeBuffer` tidak dipanggil untuk header bytes 12–15 di wire format | Sudah dicek — `encodePayloadWire` memanggil `encodeBuffer` yang sama         |
