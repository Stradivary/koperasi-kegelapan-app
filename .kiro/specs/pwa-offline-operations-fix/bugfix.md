# Bugfix Requirements Document

## Introduction

Aplikasi PWA untuk operasi kartu NFC (membership card dengan saldo) memiliki beberapa bug kritis saat beroperasi dalam mode offline. Bug-bug ini mencakup: kegagalan menambah anggota baru, ketidakmampuan mencetak kartu baru, tombol top-up yang tidak muncul saat memilih template nominal, saldo yang ter-reset ke 0 saat berpindah ke offline setelah cetak kartu, sync error yang berulang (looping) saat kembali online, indikator sync status yang tidak akurat, dan wording error yang tidak edukatif pada fitur pasang perangkat baru. Bug-bug ini secara kolektif membuat operasi offline-first menjadi tidak dapat diandalkan.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN operator menambah anggota baru pada mode offline (memanggil `createMember` mutation) THEN the system gagal menyimpan data anggota karena `localDb.users.add()` bergantung pada koneksi TanStack Query yang meskipun sudah dikonfigurasi `networkMode: "always"`, mutation error tidak ditangani dengan baik dan tidak ada feedback ke user bahwa operasi berhasil disimpan secara lokal

1.2 WHEN operator mencetak kartu baru pada mode offline (memanggil `issueCard` mutation yang menggunakan `NDEFReader`) THEN the system gagal karena `useSessionGrant` mungkin belum memiliki cached grant yang valid, atau proses NFC write gagal tanpa error handling yang memadai untuk kondisi offline

1.3 WHEN operator memilih template nominal (50k, 100k, 200k) pada menu top-up dalam mode offline THEN tombol "Top-up" tidak muncul karena `phase` tidak pernah mencapai state `"ready"` — NFC scan gagal memvalidasi kartu ketika session grant tidak tersedia atau NFC read gagal tanpa fallback

1.4 WHEN kartu baru dicetak dalam mode online, kemudian perangkat berpindah ke mode offline, dan operator membuka menu top-up THEN saldo kartu yang ditampilkan menjadi 0 karena data kartu yang baru dicetak tidak tersimpan dengan benar di local cache (IndexedDB `localDb.cards`) atau query `station-cards` tidak membaca data terbaru dari local DB

1.5 WHEN perangkat kembali online setelah melakukan aktivitas offline (ada pending transactions di Outbox) THEN sync engine mengalami error berulang (looping) karena payload yang corrupt atau tidak valid menyebabkan server menolak dengan error, dan retry logic terus mencoba tanpa mekanisme untuk melewati atau memisahkan entry yang bermasalah — `MAX_ERROR_RETRIES` (5) tercapai lalu status tetap "error"

1.6 WHEN tenant sudah berhasil disinkronisasi ke server (response 200/201 diterima) tetapi ada error pada proses selanjutnya (misalnya update IndexedDB gagal) THEN indikator status UI menampilkan "Synced" padahal data belum benar-benar konsisten, atau sebaliknya menampilkan "error" padahal server sudah menerima data

1.7 WHEN user mencoba login melalui menu "Pasang Perangkat Baru" dalam mode offline THEN the system menampilkan error generik "Terjadi kesalahan. Coba lagi." atau "Username atau password salah" tanpa menjelaskan bahwa pemasangan perangkat baru memerlukan koneksi internet untuk pertukaran key keamanan

### Expected Behavior (Correct)

2.1 WHEN operator menambah anggota baru pada mode offline THEN the system SHALL menyimpan data anggota ke IndexedDB (`localDb.users`) sebagai operasi lokal yang berhasil, menampilkan konfirmasi sukses ke operator, dan mencatat perubahan sebagai pending transaction yang akan di-sync saat kembali online

2.2 WHEN operator mencetak kartu baru pada mode offline DAN session grant tersedia di cache lokal THEN the system SHALL mengizinkan proses cetak kartu menggunakan cached session grant, menulis data ke kartu NFC, mendaftarkan kartu di `localDb.cards`, dan mencatat transaksi di `localDb.transactionLog` dengan `syncStatus: "pending"` untuk di-sync saat online

2.3 WHEN operator memilih template nominal (50k, 100k, 200k) pada menu top-up dalam mode offline DAN session grant tersedia di cache THEN tombol "Top-up" SHALL tetap muncul dan merespons pilihan template nominal — NFC scan SHALL berhasil membaca kartu dan menampilkan saldo saat ini dari data on-card tanpa memerlukan validasi server

2.4 WHEN kartu baru dicetak (baik online maupun offline) dan kemudian perangkat berpindah ke mode offline THEN state saldo terakhir dari kartu yang baru dicetak SHALL tersimpan di `localDb.cards` dan query `station-cards` SHALL membaca data terbaru dari IndexedDB sehingga saldo tidak me-reset ke 0

2.5 WHEN perangkat kembali online dan sync engine memproses pending transactions THEN the system SHALL menerapkan validasi payload sebelum mengirim ke server; jika ada entry yang corrupt atau ditolak server dengan error non-retryable (4xx selain 429), entry tersebut SHALL ditandai sebagai "failed" dan dipisahkan dari antrian agar tidak menyebabkan looping error — sync SHALL melanjutkan dengan entry yang valid

2.6 WHEN `useTenantSync` menerima response dari server THEN indikator status "Synced" pada UI SHALL hanya berubah menjadi sukses jika server mengembalikan response 200/201 OK DAN update ke IndexedDB lokal juga berhasil; jika salah satu gagal, status SHALL menampilkan "error" dengan pesan yang informatif

2.7 WHEN user mencoba login melalui menu "Pasang Perangkat Baru" dalam mode offline THEN the system SHALL menampilkan pesan edukatif: "Perangkat baru wajib terhubung internet untuk aktivasi awal. Hubungkan ke jaringan WiFi atau data seluler, lalu coba lagi." tanpa mencoba autentikasi ke server

### Unchanged Behavior (Regression Prevention)

3.1 WHEN operator menambah anggota baru pada mode online THEN the system SHALL CONTINUE TO menyimpan data ke IndexedDB dan sync ke server melalui sync engine seperti biasa

3.2 WHEN operator mencetak kartu baru pada mode online THEN the system SHALL CONTINUE TO menggunakan fresh session grant dari server dan melakukan NFC write dengan validasi penuh

3.3 WHEN operator melakukan top-up pada mode online THEN the system SHALL CONTINUE TO membaca kartu via NFC, menampilkan saldo dari data on-card, dan menulis top-up ke kartu dengan session grant yang valid

3.4 WHEN sync engine berhasil push semua pending transactions tanpa error THEN the system SHALL CONTINUE TO menandai semua entry sebagai "synced" dan melanjutkan ke pull phase

3.5 WHEN `useTenantSync` menerima response 409 (conflict) dari server THEN the system SHALL CONTINUE TO menampilkan dialog conflict resolution seperti saat ini

3.6 WHEN user login melalui menu "Pasang Perangkat Baru" pada mode online dengan kredensial valid THEN the system SHALL CONTINUE TO melakukan autentikasi ke server, mendaftarkan device, dan menampilkan pilihan role perangkat

3.7 WHEN kartu di-scan pada mode online THEN the system SHALL CONTINUE TO memvalidasi kartu menggunakan fresh session grant dari server dan menyinkronkan data ke local DB

3.8 WHEN sync engine menerima rejection "stale_counter" dari server THEN the system SHALL CONTINUE TO menandai entry sebagai "conflict" dan memicu pull untuk mendapatkan data terbaru

## Bug Condition Derivation

### Bug 1 & 2: Offline Member Creation and Card Issuance

```pascal
FUNCTION isBugCondition_OfflineOperation(X)
  INPUT: X of type { isOffline: boolean, operation: "createMember" | "issueCard", hasLocalGrant: boolean }
  OUTPUT: boolean

  RETURN X.isOffline = true
    AND X.operation IN {"createMember", "issueCard"}
END FUNCTION
```

```pascal
// Property: Fix Checking — Offline Operations Succeed Locally
FOR ALL X WHERE isBugCondition_OfflineOperation(X) DO
  result ← performOperation'(X)
  IF X.operation = "createMember" THEN
    ASSERT result.savedToLocalDb = true
      AND result.userFeedback = "success"
      AND result.pendingSync = true
  END IF
  IF X.operation = "issueCard" AND X.hasLocalGrant = true THEN
    ASSERT result.nfcWriteAttempted = true
      AND result.savedToLocalDb = true
      AND result.transactionLogged = true
      AND result.syncStatus = "pending"
  END IF
END FOR
```

### Bug 3: Topup Button Not Appearing Offline

```pascal
FUNCTION isBugCondition_TopupButtonHidden(X)
  INPUT: X of type { isOffline: boolean, templateSelected: boolean, hasLocalGrant: boolean }
  OUTPUT: boolean

  RETURN X.isOffline = true
    AND X.templateSelected = true
    AND X.hasLocalGrant = true
END FUNCTION
```

```pascal
// Property: Fix Checking — Topup Button Visible After Template Selection
FOR ALL X WHERE isBugCondition_TopupButtonHidden(X) DO
  result ← openTopupDrawer'(X)
  ASSERT result.nfcScanInitiated = true
    AND (result.phase = "ready" IMPLIES result.topupButtonVisible = true)
    AND result.noNetworkRequired = true
END FOR
```

### Bug 4: Balance Resets to 0 After Switching Offline

```pascal
FUNCTION isBugCondition_BalanceReset(X)
  INPUT: X of type { cardJustIssued: boolean, switchedToOffline: boolean, openedTopup: boolean }
  OUTPUT: boolean

  RETURN X.cardJustIssued = true
    AND X.switchedToOffline = true
    AND X.openedTopup = true
END FUNCTION
```

```pascal
// Property: Fix Checking — Balance Persists After Offline Switch
FOR ALL X WHERE isBugCondition_BalanceReset(X) DO
  balanceBefore ← getCardBalance(X.cardId, "beforeOfflineSwitch")
  balanceAfter ← getCardBalance'(X.cardId, "afterOfflineSwitch")
  ASSERT balanceAfter = balanceBefore
    AND balanceAfter > 0
END FOR
```

### Bug 5: Sync Error Looping

```pascal
FUNCTION isBugCondition_SyncLoop(X)
  INPUT: X of type { hasPendingEntries: boolean, hasCorruptEntry: boolean, isOnline: boolean }
  OUTPUT: boolean

  RETURN X.hasPendingEntries = true
    AND X.hasCorruptEntry = true
    AND X.isOnline = true
END FUNCTION
```

```pascal
// Property: Fix Checking — Corrupt Entries Isolated, Sync Continues
FOR ALL X WHERE isBugCondition_SyncLoop(X) DO
  result ← syncPush'(X.tenantId)
  ASSERT result.corruptEntriesMarkedFailed = true
    AND result.validEntriesSynced = true
    AND result.noInfiniteRetry = true
    AND result.syncStatus != "looping"
END FOR
```

### Bug 6: Sync Status Indicator Inaccurate

```pascal
FUNCTION isBugCondition_SyncStatusInaccurate(X)
  INPUT: X of type { serverResponse: number, localDbUpdateSuccess: boolean }
  OUTPUT: boolean

  RETURN (X.serverResponse IN {200, 201} AND X.localDbUpdateSuccess = false)
    OR (X.serverResponse NOT IN {200, 201} AND uiShowsSuccess = true)
END FUNCTION
```

```pascal
// Property: Fix Checking — Sync Status Reflects True State
FOR ALL X WHERE isBugCondition_SyncStatusInaccurate(X) DO
  result ← syncToServer'(X)
  IF X.serverResponse IN {200, 201} AND X.localDbUpdateSuccess = true THEN
    ASSERT result.uiStatus = "success"
  ELSE
    ASSERT result.uiStatus != "success"
  END IF
END FOR
```

### Bug 7: Device Setup Offline Wording

```pascal
FUNCTION isBugCondition_DeviceSetupOffline(X)
  INPUT: X of type { isOffline: boolean, action: string }
  OUTPUT: boolean

  RETURN X.isOffline = true
    AND X.action = "device-setup"
END FUNCTION
```

```pascal
// Property: Fix Checking — Educative Error Message for Offline Device Setup
FOR ALL X WHERE isBugCondition_DeviceSetupOffline(X) DO
  result ← handleDeviceSetupAuth'(X)
  ASSERT result.errorMessage CONTAINS "wajib terhubung internet"
    AND result.networkRequestAttempted = false
END FOR
```

### Preservation Goal

```pascal
// Property: Preservation Checking — Online operations unchanged
FOR ALL X WHERE NOT isBugCondition_OfflineOperation(X)
  AND NOT isBugCondition_TopupButtonHidden(X)
  AND NOT isBugCondition_BalanceReset(X)
  AND NOT isBugCondition_SyncLoop(X)
  AND NOT isBugCondition_SyncStatusInaccurate(X)
  AND NOT isBugCondition_DeviceSetupOffline(X) DO
  ASSERT F(X) = F'(X)
END FOR
```
