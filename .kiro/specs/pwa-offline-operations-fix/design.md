# PWA Offline Operations Bugfix Design

## Overview

Aplikasi PWA untuk operasi kartu NFC memiliki 7 bug kritis yang membuat operasi offline-first tidak dapat diandalkan. Bug-bug ini mencakup kegagalan operasi lokal (member creation, card issuance, top-up), kehilangan data saat transisi online→offline, sync error looping saat kembali online, indikator status yang tidak akurat, dan pesan error yang tidak edukatif pada device setup offline.

Strategi perbaikan berfokus pada:

1. Memastikan semua operasi lokal (IndexedDB via Dexie) berhasil tanpa bergantung pada koneksi jaringan
2. Memperbaiki caching dan persistence data kartu setelah operasi NFC
3. Menambahkan isolasi entry corrupt pada sync push agar tidak menyebabkan looping
4. Menyinkronkan UI status dengan state aktual (server response + local DB update)
5. Menambahkan deteksi offline awal pada device setup dengan pesan edukatif

## Glossary

- **Bug_Condition (C)**: Kondisi yang memicu bug — kombinasi mode offline dengan operasi tertentu
- **Property (P)**: Perilaku yang diharapkan ketika bug condition terpenuhi setelah fix diterapkan
- **Preservation**: Perilaku online yang sudah benar dan tidak boleh berubah setelah fix
- **`localDb`**: Instance Dexie database (`koperasi-local`) di `src/db/local-db.ts` yang menyimpan users, cards, transactionLog, syncCursors
- **`reconciliationOutbox`**: IndexedDB store di `src/lib/indexeddb.ts` yang menyimpan pending transactions untuk di-push ke server
- **`useSyncEngine`**: Hook di `src/hooks/useSyncEngine.ts` yang mengorkestrasi push-first sync cycle dengan debouncing dan retry
- **`syncPush`**: Fungsi di `src/lib/syncPush.ts` yang membaca pending entries dan mengirim ke server dalam batch
- **`useSessionGrant`**: Hook di `src/hooks/useSessionGrant.ts` yang mengelola session grant dengan cache IndexedDB untuk offline fallback
- **`StationSection`**: Komponen utama di `src/components/section/StationSection.tsx` yang menangani operasi kartu (issue, topup, member management)
- **Session Grant**: Kunci kriptografi sementara yang diperlukan untuk operasi NFC (read/write kartu)
- **Outbox Pattern**: Pola di mana transaksi ditulis ke local DB terlebih dahulu, lalu di-sync ke server saat online

## Bug Details

### Bug Condition

Bug-bug ini termanifestasi dalam 4 kategori kondisi:

**Kategori 1: Operasi Offline (Bug 1, 2, 3)**
Operasi lokal gagal saat offline karena mutation error handling yang tidak memadai, session grant yang tidak tersedia dari cache, atau NFC phase yang tidak mencapai "ready" tanpa validasi server.

**Kategori 2: Data Persistence (Bug 4)**
Data kartu yang baru dicetak tidak tersimpan dengan benar di `localDb.cards` sehingga saldo ter-reset ke 0 saat berpindah offline.

**Kategori 3: Sync Engine (Bug 5, 6)**
Sync push gagal mengisolasi entry corrupt, menyebabkan retry loop. Status UI tidak mencerminkan state aktual karena tidak memvalidasi keberhasilan local DB update setelah server response.

**Kategori 4: UX Offline (Bug 7)**
Device setup tidak mendeteksi kondisi offline sebelum mencoba autentikasi, menghasilkan pesan error generik.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type OfflineOperationContext
  OUTPUT: boolean

  // Kategori 1: Operasi offline gagal
  IF input.isOffline = true
     AND input.operation IN {"createMember", "issueCard", "topup"}
     AND (input.operation = "createMember"
          OR (input.hasLocalGrant = true AND input.operation IN {"issueCard", "topup"}))
  THEN RETURN true
  END IF

  // Kategori 2: Balance reset setelah offline switch
  IF input.cardJustIssued = true
     AND input.switchedToOffline = true
     AND input.cardDataNotInLocalDb = true
  THEN RETURN true
  END IF

  // Kategori 3: Sync error looping
  IF input.isOnline = true
     AND input.hasPendingEntries = true
     AND input.hasCorruptOrNonRetryableEntry = true
  THEN RETURN true
  END IF

  // Kategori 3b: Sync status inaccurate
  IF (input.serverResponse IN {200, 201} AND input.localDbUpdateFailed = true)
     OR (input.serverResponseFailed = true AND input.uiShowsSuccess = true)
  THEN RETURN true
  END IF

  // Kategori 4: Device setup offline
  IF input.isOffline = true
     AND input.action = "device-setup"
  THEN RETURN true
  END IF

  RETURN false
END FUNCTION
```

### Examples

- **Bug 1**: Operator offline menambah anggota "Budi" → `createMember.mutateAsync({name: "Budi"})` → `localDb.users.add()` berhasil tapi mutation tidak memberikan feedback sukses karena error handling TanStack Query
- **Bug 2**: Operator offline mencetak kartu → `issueCard` mutation membutuhkan `grant` dari `useSessionGrant` → jika cache expired atau belum pernah fetch, `grant` = null → error "Sesi tidak aktif"
- **Bug 3**: Operator offline pilih template 100k → `handleTopupCard` memanggil `scan()` → NFC scan berhasil baca kartu → `state.phase` = "validating" → validasi session gagal karena grant null → phase tidak pernah "ready" → tombol Top-up tidak muncul
- **Bug 4**: Kartu dicetak online (balance 50000) → `localDb.cards.put()` berhasil → device goes offline → `getCardsWithUsers()` query membaca dari `localDb.cards` → data ada tapi `station-cards` query cache stale → UI shows balance 0
- **Bug 5**: Device kembali online → `syncPush` membaca 10 pending entries → entry #3 memiliki payload corrupt → server returns 4xx → `pushBatchWithRetry` treats 4xx as non-retryable tapi `syncPush` throws → `useSyncEngine` retries entire cycle → loop sampai MAX_ERROR_RETRIES
- **Bug 6**: `syncPush` berhasil (server 201) → `syncPull` gagal update IndexedDB → `executeSyncCycle` catches error → status = "error" → tapi beberapa entries sudah marked "synced" → UI inconsistent
- **Bug 7**: User offline klik "Pasang Perangkat" → `handleDeviceSetupAuth` → `localLogin` returns null (belum ada local account) → `navigator.onLine` = false → skip server auth → `setError("Username atau password salah")` → misleading

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Operasi online (createMember, issueCard, topup) tetap berjalan normal dengan fresh session grant dari server
- Sync engine push-first strategy tetap berlaku: push dulu, lalu pull
- Conflict handling (stale_counter → "conflict" status) tetap berfungsi
- Device block enforcement tetap aktif
- TanStack Query `networkMode: "always"` tetap berlaku untuk queries dan mutations
- Exponential backoff retry pada 5xx errors tetap berfungsi
- Session grant refresh scheduling tetap berjalan saat online
- `reconciliationOutbox` pattern untuk terminal operations tetap berfungsi

**Scope:**
Semua input yang TIDAK melibatkan kondisi offline (atau sync dengan corrupt entries) tidak boleh terpengaruh oleh fix ini. Ini mencakup:

- Semua operasi saat `navigator.onLine = true` dan tidak ada corrupt entries
- Login online melalui "Pasang Perangkat" dengan kredensial valid
- Sync cycle yang berhasil tanpa error
- NFC operations dengan fresh session grant dari server

## Hypothesized Root Cause

Based on code analysis, the most likely root causes are:

1. **Bug 1 - createMember Offline**: `createMember` mutation di `StationSection.tsx` (line ~240) langsung memanggil `localDb.users.add()` yang seharusnya berhasil offline karena Dexie tidak memerlukan network. Namun, jika mutation error terjadi (misalnya duplicate key), tidak ada toast/feedback sukses yang eksplisit. Root cause kemungkinan: mutation `onSuccess` hanya invalidates query tanpa toast konfirmasi, dan jika ada race condition pada `nextId` calculation, `add()` bisa throw.

2. **Bug 2 - issueCard Offline**: `issueCard` mutation memerlukan `grant` yang non-null (line: `if (!grant) throw new Error("Sesi tidak aktif")`). `useSessionGrant` sudah memiliki cache fallback, tapi jika grant expired di cache dan device offline, `grant` akan null. Root cause: session grant cache expiry check terlalu ketat — jika `expiresAt <= nowSeconds`, cache dianggap expired meskipun masih bisa digunakan untuk offline operations.

3. **Bug 3 - Topup Button Hidden**: `TopupDrawer` menampilkan tombol "Top-up" hanya saat `phase === "ready"`. Phase "ready" dicapai setelah NFC scan + validasi berhasil. `useNfcCard` hook kemungkinan memerlukan valid session grant untuk transisi ke "ready". Jika grant null (karena expired cache), validasi gagal dan phase stuck di "validating" atau "error".

4. **Bug 4 - Balance Reset**: Setelah `issueCard` berhasil, `localDb.cards.put()` dipanggil (line ~230 di issueCard mutation). Data tersimpan. Namun, `station-cards` query menggunakan TanStack Query cache. Saat offline, `staleTime: Infinity` berarti query tidak refetch. Jika query cache di-invalidate tapi refetch gagal (karena queryFn reads from IndexedDB yang seharusnya berhasil), mungkin ada timing issue. Root cause lebih mungkin: `qc.invalidateQueries` dipanggil tapi query belum re-execute karena component belum mounted, atau data belum committed ke IndexedDB saat query runs.

5. **Bug 5 - Sync Error Looping**: `syncPush` di `syncPush.ts` menangani 4xx sebagai non-retryable dan mengembalikan response body. Namun, jika payload corrupt menyebabkan server error yang tidak terparsing (misalnya response bukan JSON valid), `pushBatchWithRetry` akan throw setelah max retries. `useSyncEngine.executeSyncCycle` catches error dan retries seluruh cycle. Root cause: tidak ada mekanisme untuk menandai individual entries sebagai "failed" dan melanjutkan dengan entries yang valid.

6. **Bug 6 - Sync Status Inaccurate**: Di `useSyncEngine.executeSyncCycle`, status diset "idle" setelah `syncPush` + `syncPull` berhasil. Jika `syncPush` berhasil (entries marked "synced") tapi `syncPull` throws, status menjadi "error" — tapi beberapa entries sudah synced. Sebaliknya, jika `syncPull` berhasil update cursors tapi gagal merge ke localDb, status tetap "idle" padahal data inconsistent. Root cause: status management tidak granular — hanya "pushing"/"pulling"/"error"/"idle" tanpa membedakan partial success.

7. **Bug 7 - Device Setup Offline Wording**: Di `handleDeviceSetupAuth` (LoginSection.tsx line ~261), flow: `localLogin` → null → check `navigator.onLine` → false → skip server auth → `setError("Username atau password salah")`. Error message misleading karena sebenarnya bukan salah password, tapi device belum pernah login (no cached credentials) dan offline. Root cause: tidak ada early return dengan pesan edukatif saat offline dan local login gagal.

## Correctness Properties

Property 1: Bug Condition - Offline Operations Succeed Locally

_For any_ input where the device is offline AND the operation is createMember, issueCard (with cached grant), or topup (with cached grant), the fixed system SHALL complete the operation using local IndexedDB storage, provide success feedback to the operator, and record the transaction as pending sync.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Bug Condition - Balance Persists After Offline Switch

_For any_ input where a card was just issued (online or offline) and the device subsequently switches to offline mode, the fixed system SHALL retain the card's balance in `localDb.cards` and the `station-cards` query SHALL return the correct non-zero balance from IndexedDB.

**Validates: Requirements 2.4**

Property 3: Bug Condition - Corrupt Entries Isolated During Sync

_For any_ input where the sync engine processes pending entries containing corrupt or non-retryable entries, the fixed system SHALL mark those entries as "failed", continue syncing valid entries, and NOT enter an infinite retry loop.

**Validates: Requirements 2.5**

Property 4: Bug Condition - Sync Status Reflects True State

_For any_ sync cycle where the server returns 200/201, the UI status SHALL only show "success" if BOTH the server accepted the data AND the local IndexedDB update completed successfully. If either fails, status SHALL show "error" with an informative message.

**Validates: Requirements 2.6**

Property 5: Bug Condition - Educative Offline Device Setup Message

_For any_ input where the user attempts device setup while offline AND no local credentials exist, the fixed system SHALL display an educative message explaining that internet is required for initial device activation, WITHOUT attempting network authentication.

**Validates: Requirements 2.7**

Property 6: Preservation - Online Operations Unchanged

_For any_ input where the device is online AND no corrupt entries exist in the outbox, the fixed system SHALL produce the same behavior as the original system, preserving all existing online functionality including fresh session grant fetching, normal sync cycles, and server-validated NFC operations.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/components/section/StationSection.tsx`

**Function**: `createMember` mutation

**Specific Changes**:

1. **Add success toast**: Tambahkan `toast.success("Anggota berhasil ditambahkan")` di `onSuccess` callback mutation
2. **Add error handling**: Tambahkan `onError` callback dengan toast error yang informatif
3. **Improve nextId generation**: Gunakan timestamp-based ID atau atomic increment untuk menghindari race condition

---

**File**: `src/hooks/useSessionGrant.ts`

**Function**: `readGrantFromCache`, `refresh`

**Specific Changes**: 4. **Relax cache expiry for offline**: Saat offline, izinkan penggunaan grant yang expired (within grace period, misalnya +1 jam) karena operasi offline tidak memerlukan validasi server real-time 5. **Add grace period constant**: `const OFFLINE_GRACE_PERIOD_SECONDS = 3600` — grant yang expired kurang dari 1 jam tetap valid untuk offline operations

---

**File**: `src/components/block/TopupDrawer.tsx` / `src/hooks/useNfcCard.ts`

**Specific Changes**: 6. **Allow NFC scan without server validation offline**: Saat offline dan grant tersedia (termasuk grace period), skip server-side validation dan langsung transisi ke "ready" setelah NFC read berhasil

---

**File**: `src/components/section/StationSection.tsx`

**Function**: `issueCard` mutation, auto-sync effect

**Specific Changes**: 7. **Ensure card data persists immediately**: Setelah `localDb.cards.put()` di issueCard, pastikan `qc.invalidateQueries` dipanggil dan query refetch dari IndexedDB berhasil sebelum mutation resolves 8. **Add explicit await on invalidation**: Gunakan `await qc.invalidateQueries()` untuk memastikan cache ter-update

---

**File**: `src/lib/syncPush.ts`

**Function**: `syncPush`, `pushBatchWithRetry`

**Specific Changes**: 9. **Add payload validation before push**: Validasi setiap entry sebelum mengirim ke server — check required fields (cardId, counter, type, amount, hash) 10. **Mark invalid entries as "failed"**: Entry yang gagal validasi ditandai "failed" dan dikeluarkan dari batch 11. **Handle non-retryable server rejections**: Jika server menolak entry dengan 4xx (selain 429), tandai entry sebagai "failed" bukan "conflict" 12. **Add "failed" sync status**: Tambahkan "failed" ke `TransactionLog.syncStatus` union type

---

**File**: `src/hooks/useSyncEngine.ts`

**Function**: `executeSyncCycle`

**Specific Changes**: 13. **Granular error handling**: Jika `syncPush` berhasil tapi `syncPull` gagal, status tetap partial success — jangan reset entries yang sudah synced 14. **Add partial success state**: Track apakah push berhasil meskipun pull gagal, untuk UI yang lebih akurat

---

**File**: `src/components/section/LoginSection.tsx`

**Function**: `handleDeviceSetupAuth`

**Specific Changes**: 15. **Early offline detection**: Sebelum mencoba login, check `navigator.onLine`. Jika offline DAN `localLogin` gagal, tampilkan pesan edukatif: "Perangkat baru wajib terhubung internet untuk aktivasi awal. Hubungkan ke jaringan WiFi atau data seluler, lalu coba lagi." 16. **Skip network request when offline**: Jangan mencoba fetch ke server saat offline untuk device setup

---

**File**: `src/db/local-db.ts`

**Specific Changes**: 17. **Add "failed" to TransactionLog syncStatus**: Update type union dari `"pending" | "synced" | "conflict"` menjadi `"pending" | "synced" | "conflict" | "failed"` 18. **Add compound index for failed entries**: Tambahkan index untuk query failed entries

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate offline conditions (mock `navigator.onLine = false`), trigger each operation, and assert expected outcomes. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:

1. **Offline createMember Test**: Mock offline → call `localDb.users.add()` → assert entry exists AND success feedback provided (will fail on unfixed code — no toast)
2. **Offline issueCard with expired grant Test**: Mock offline + expired cached grant → call issueCard → assert grant still usable within grace period (will fail — current code rejects expired grants)
3. **Offline topup phase transition Test**: Mock offline + cached grant → simulate NFC scan → assert phase reaches "ready" (will fail — validation blocks transition)
4. **Balance persistence after offline switch Test**: Issue card → mock offline → query station-cards → assert balance > 0 (may fail — timing/cache issue)
5. **Sync with corrupt entry Test**: Add corrupt entry to outbox → trigger syncPush → assert corrupt entry marked "failed" AND valid entries synced (will fail — current code throws on entire batch)
6. **Sync status accuracy Test**: Mock syncPush success + syncPull failure → assert UI status = "error" not "success" (will fail — status management not granular)
7. **Device setup offline message Test**: Mock offline + no local account → submit device setup form → assert error message contains "wajib terhubung internet" (will fail — shows generic error)

**Expected Counterexamples**:

- Offline operations fail silently or with misleading errors
- Session grant cache rejects expired grants even when offline (no grace period)
- Sync engine retries entire cycle instead of isolating corrupt entries
- Possible causes: strict cache expiry, missing "failed" status, no offline-specific error messages

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedSystem(input)

  IF input.category = "offline_operation" THEN
    ASSERT result.localDbWriteSuccess = true
    ASSERT result.userFeedback = "success"
    ASSERT result.pendingSyncCreated = true
  END IF

  IF input.category = "balance_persistence" THEN
    ASSERT result.balanceAfterOfflineSwitch = result.balanceBefore
    ASSERT result.balanceAfterOfflineSwitch > 0
  END IF

  IF input.category = "sync_corrupt_entry" THEN
    ASSERT result.corruptEntriesMarkedFailed = true
    ASSERT result.validEntriesSynced = true
    ASSERT result.retryCount <= MAX_ERROR_RETRIES
  END IF

  IF input.category = "sync_status" THEN
    ASSERT result.uiStatus reflects (serverSuccess AND localDbSuccess)
  END IF

  IF input.category = "device_setup_offline" THEN
    ASSERT result.errorMessage CONTAINS "wajib terhubung internet"
    ASSERT result.networkRequestAttempted = false
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalSystem(input) = fixedSystem(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many test cases automatically across the input domain (various online states, grant configurations, sync payloads)
- It catches edge cases that manual unit tests might miss (e.g., grant expiring exactly at boundary)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for online operations, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Online createMember Preservation**: Verify creating members online continues to work with same IndexedDB write + query invalidation
2. **Online issueCard Preservation**: Verify issuing cards online uses fresh server grant and NFC write succeeds
3. **Online topup Preservation**: Verify topup online reads card via NFC, validates with server grant, writes updated balance
4. **Sync success Preservation**: Verify sync cycle with all valid entries completes normally (push → pull → idle)
5. **Conflict handling Preservation**: Verify stale_counter rejections still marked as "conflict" and trigger pull
6. **Online device setup Preservation**: Verify device setup with valid credentials online still authenticates to server and registers device

### Unit Tests

- Test `readGrantFromCache` with offline grace period logic
- Test `syncPush` payload validation (detect corrupt entries)
- Test `syncPush` marking invalid entries as "failed" while continuing with valid ones
- Test `handleDeviceSetupAuth` offline detection and educative message
- Test `createMember` mutation success feedback (toast)
- Test `issueCard` mutation with expired-but-within-grace-period grant
- Test `executeSyncCycle` partial success handling (push ok, pull fail)
- Test `station-cards` query reads fresh data from IndexedDB after invalidation

### Property-Based Tests

- Generate random offline operation contexts (various grant states, operations) → verify all succeed locally when grant is within grace period
- Generate random sync payloads with mix of valid and corrupt entries → verify corrupt entries isolated and valid entries synced
- Generate random online operation contexts → verify behavior identical to unfixed code (preservation)
- Generate random sync cycle outcomes (various server responses + local DB states) → verify UI status accurately reflects true state

### Integration Tests

- Test full offline workflow: login → create member → issue card → topup → verify all data in IndexedDB
- Test offline→online transition: perform operations offline → go online → verify sync completes without looping
- Test device setup flow: attempt setup offline → verify educative message → go online → verify setup succeeds
- Test balance persistence: issue card online → go offline → open topup drawer → verify correct balance displayed
