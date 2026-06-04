# Software Assumptions - Koperasi Kegelapan

---

## 1. Tenancy & Deployment

- Aplikasi yang dibuat ini bisa memprovide untuk kebutuhan Single / Multi Tenant (baik offline ataupun online)
- 1 Tenant dapat memasang Rolenya di perangkat (device) lain apabila pernah mendaftarkan Tenant tersebut melalui Online
- Apabila aplikasi dijalankan dari Offline mode (Single Tenant) maka dia hanya bisa dilakukan dari 1 device yang dapat berfungsi untuk semua role (Admin, Gate, Terminal, Scout)
- Setiap tenant memiliki `slug` unik yang digunakan sebagai identifier publik (URL-friendly)
- Tenant memiliki status lifecycle: `active`, `suspended`, `archived` - hanya tenant `active` yang dapat digunakan untuk login
- Tenant yang berjalan di mode `local` (offline-only) dapat di-upgrade ke mode `synced` ketika koneksi tersedia
- Timezone tenant disimpan per-tenant (default: `Asia/Jakarta`) untuk keperluan reporting dan display waktu

---

## 2. Membership & Kartu

- Kartu Membership hanya dicetak oleh Koperasi dengan format (cover front and back) yang ditentukan oleh koperasi
- 1 member dapat mempunyai lebih dari 1 Kartu membership apabila didaftarkan oleh admin
- Apabila admin menangguhkan (Block) member, maka semua kartu yang terafiliasi dengan member tersebut juga akan terblokir
- Apabila Member menghilangkan kartu, maka Kebijakan Koperasi untuk saat ini adalah member segera memberitahukan Koperasi dan memberi tahukan kepada Admin terakhir Checkin dan Checkout kapan dan admin memvalidasi informasi tersebut di Log Transaksi sebagai justifikasi untuk Re-issue card baru dengan Saldo 0
- Card ID adalah 6 bytes (48-bit) yang di-generate secara random dan disimpan sebagai hex string di database
- Setiap kartu memiliki `tenantBind` (FNV-32a hash dari tenantId) yang di-validasi saat scan - kartu dari tenant lain akan ditolak
- Kartu memiliki status: `ACTIVE`, `BLOCKED_TAMPER`, `BLOCKED_FRAUD`, `BLOCKED_EXPIRED`, `BLOCKED_ADMIN`
- Kartu yang di-block tidak dapat melakukan operasi apapun (checkin, checkout, debit, topup) sampai di-reset oleh admin
- Kartu memiliki `expiresAt` - kartu yang expired akan ditolak saat validasi
- Kartu memiliki `keyVersion` yang harus cocok dengan session grant - jika tidak cocok, kartu ditolak (key rotation scenario)
- User ID pada kartu disimpan sebagai 8-character alphanumeric string (ASCII) pada binary payload

---

## 3. Transaksi & Saldo

- Transaksi yang dicatat dalam Transaction Log pada Kartu adalah (Topup, Checkin, dan Checkout beserta aktivitas, timestamp, dan Jumlah Biaya)
- Minimum saldo yang dibutuhkan saat checkin adalah Rp.10.000,-
- Minimum saldo setelah checkout adalah Rp.0 (tidak boleh negatif)
- Tarif parkir dihitung per jam (dibulatkan ke atas): Rp.2.000/jam
- Fee checkout = ceil(durasi_dalam_jam) × Rp.2.000
- Maksimum amount per transaksi yang dapat di-encode pada kartu adalah 16.777.215 (uint24 max, ~Rp.16.7 juta)
- Maksimum balance kartu dibatasi Rp.16.000.000 (agar full-balance debit tetap dapat direkam di log entry uint24)
- Minimum nominal top-up: Rp.2.000
- Minimum saldo awal saat cetak kartu (issuance): Rp.2.000
- Maksimum nominal top-up per transaksi: Rp.2.000.000
- Counter kartu menggunakan uint64 (bigint) - secara praktis tidak akan overflow
- Setiap transaksi menghasilkan idempotency key unik (`tenantId:cardIdHex:counter`) untuk mencegah duplikasi saat sync
- Transaction log pada kartu menyimpan maksimal 5 entry terakhir (ring buffer) - log lengkap ada di server/IndexedDB
- Setiap log entry pada kartu memiliki chain hash (SHA-256 truncated 4 bytes) yang menghubungkan entry sebelumnya - tamper detection

---

## 4. State Machine & Flow Operasi

- Kartu memiliki 4 state: `IDLE`, `CHECKED_IN`, `STATION_OPERATION`, `CHECKED_OUT`
- Transisi state yang valid:
  - `IDLE` → `CHECKED_IN` (gate_checkin)
  - `IDLE` → `CHECKED_OUT` (force_checkout)
  - `CHECKED_IN` → `STATION_OPERATION` (terminal_start)
  - `CHECKED_IN` → `CHECKED_OUT` (gate_checkout)
  - `CHECKED_IN` → `CHECKED_OUT` (force_checkout)
  - `STATION_OPERATION` → `CHECKED_IN` (terminal_end)
  - `STATION_OPERATION` → `CHECKED_OUT` (force_checkout)
  - `CHECKED_OUT` → `IDLE` (admin_reset / gate_checkin)
- Session timeout: 24 jam + 1 jam toleransi clock drift - setelah itu kartu dianggap expired dan hanya bisa checkout/force_checkout
- Transisi yang tidak valid akan ditolak oleh engine dan kartu tidak akan ditulis
- `admin_reset` mengembalikan kartu ke state `IDLE` dengan session cleared (startTime=0, endTime=0, terminalId=0)

---

## 5. NFC & Hardware

- Aplikasi menggunakan Web NFC API (`NDEFReader`) - hanya tersedia di Chrome Android (HTTPS required)
- Format kartu NFC: NTAG215 compatible (wire format 280 bytes = 216 buffer + 64 trailer)
- Full card format (dual-buffer): 496 bytes = 216×2 buffer + 64 trailer - untuk recovery scenario
- Kartu menggunakan dual-buffer (A/B) design dengan active pointer di trailer - memungkinkan atomic write dan recovery dari incomplete write
- Write-ahead journal disimpan di IndexedDB SEBELUM physical NFC write - jika write gagal, recovery dilakukan pada scan berikutnya
- Setelah NFC write, dilakukan verification read untuk memastikan data tertulis dengan benar
- Jika verification gagal, journal tetap tersimpan dan recovery akan dicoba pada tap berikutnya
- Rapid-tap debounce: scan diabaikan jika interval < 1 detik (kecuali saat writing)
- NFC write memiliki 1x retry otomatis pada I/O error (kartu lepas sesaat)
- Pending write timeout: jika kartu tidak di-tap ulang dalam waktu tertentu, operasi dibatalkan
- Post-write auto-reset: setelah sukses, state kembali ke idle setelah timeout tertentu

---

## 6. Keamanan & Kriptografi

- Kartu di-encrypt menggunakan AES-256-GCM (schema version ≥ 2)
- Key derivation menggunakan HKDF-SHA256 dari session key + card ID
- Encryption key: HKDF(sessionKey, cardId, "enc", 32 bytes)
- Auth key (HMAC): HKDF(sessionKey, cardId, "auth", 32 bytes)
- Nonce derivation: HKDF(sessionKey, cardId||counter, "nonce", 12 bytes) - counter-bound untuk mencegah nonce reuse
- HMAC pada trailer (8 bytes truncated SHA-256) memvalidasi integritas seluruh buffer + trailer anchor
- Counter bind di trailer harus cocok dengan lower 32-bit dari wallet counter - tamper detection
- Chain hash pada log entries menggunakan SHA-256 truncated 4 bytes - mendeteksi modifikasi/penghapusan log
- Session grant memiliki `allowedOps` yang membatasi operasi per role/device
- Session grant memiliki `expiresAt` - operasi ditolak jika grant expired
- Password hashing menggunakan PBKDF2-SHA256 (100.000 iterations) - compatible antara server dan client
- Constant-time comparison digunakan untuk password verification dan HMAC verification
- Access token saat ini menggunakan format JWT-like tanpa signature kriptografis (relies on HTTPS) - noted for production upgrade

---

## 7. Roles & Akses

- Sistem memiliki 7 role: `admin`, `station`, `gate`, `terminal`, `scout`, `superadmin`, `kiosk`
- **Gate**: Checkin otomatis - validasi kartu, cek saldo minimum, apply checkin
- **Terminal**: Checkout otomatis - hitung fee parkir, deduct saldo, apply checkout
- **Scout**: Read-only - inspeksi kartu, lihat saldo dan log transaksi, tidak bisa write
- **Kiosk**: Debit/pembelian - pilih nominal, deduct saldo, juga bisa register kartu baru
- **Station/Admin**: Full management - issue kartu, topup, block/unblock, reset state, recovery
- **Superadmin**: Cross-tenant management
- Setiap role mendapat session grant dengan `allowedOps` yang berbeda - engine menolak operasi di luar grant
- Gate dan Scout menggunakan mode `lenient: true` pada NFC card hook - lebih toleran terhadap edge case

---

## 8. Sinkronisasi (Online/Offline)

- Database Online dan Local (IndexDB) digunakan untuk keperluan Dokumentasi Log, Dokumentasi Anggota, Kartu untuk Admin dan Management
- Buku Saku Digital dapat digunakan oleh member dengan menginputkan kode / slug koperasi member terdaftar
- Strategi sync: **push-first** - push entities + transactions dulu, baru pull data terbaru dari server
- Sync debounce: 5 detik setelah mutasi lokal terakhir sebelum trigger sync
- Periodic pull: setiap 30 detik untuk menangkap perubahan dari device lain
- Retry: exponential backoff (1s → 60s max), maksimal 5 percobaan berturut-turut
- Sync trigger otomatis: visibility change (tab aktif kembali), online event, initial mount
- Conflict resolution: **server wins** untuk pull (skip entity yang memiliki pending local changes)
- Push menggunakan idempotency key - duplikat diterima secara silent (accepted: true)
- Stale counter detection: server menolak transaksi jika counter ≤ counter terakhir yang diketahui server
- Batch size limit: maksimal 500 transaksi per push request
- Sync pull menggunakan cursor-based pagination (500 records per page) dengan hasMore flag
- Entity push (members + cards) bersifat best-effort - kegagalan tidak menghentikan transaction push
- Jika device di-block, semua sync operation dibatalkan (client-side check sebelum setiap request)
- Jika tidak ada access token (local-only tenant), sync pull di-skip tanpa error

---

## 9. Device Management

- Device di-register dengan fingerprint hash, user agent, dan platform
- Device memiliki `blockedUntil` timestamp - jika > waktu sekarang, semua API request ditolak (403)
- Device yang belum terdaftar di server diizinkan lewat (backward compatibility)
- Rate limiting: 60 request per menit per device (sliding window, in-memory pada Worker isolate)
- Rate limit exceeded: response 429 dengan header `Retry-After`
- Auth session terikat ke device - refresh token per device
- Client menyimpan device ID di tenant context (IndexedDB) dan menyertakannya di JWT untuk semua API call

---

## 10. Data Persistence & Storage

### Client-side (Browser)

- **IndexedDB (raw, manual)**: Tenant context, card snapshots, write journal, policy cache, session grant cache, auth tokens, local tenant config, local accounts - schema version 5
- **Dexie (IndexedDB wrapper)**: Users, cards, transaction log, sync cursors, device info, audit log, session grants - schema version 6
- **React Query cache**: Di-hydrate dari Dexie pada setiap navigasi dan setelah sync berhasil
- Write journal menggunakan composite key `[tenantId, cardIdHex]` - satu pending write per kartu per waktu
- Sync cursors disimpan per entity type per tenant - memungkinkan incremental pull

### Server-side

- **Cloudflare D1** (SQLite): Semua data master - tenants, accounts, users, cards, transaction_log, devices, auth_sessions, session_grants, audit_log, sync_cursors, card_events
- **Cloudflare Analytics Engine**: Sync metrics (latency, status, batch sizes) dan client errors
- Transaction log di server memiliki unique constraint pada `[tenantId, cardId, counter]` - mencegah duplikasi

---

## 11. Infrastruktur & Deployment

- Frontend: Vite SPA (React 19 + TanStack Router/Query) deployed ke Cloudflare Pages
- API: Hono framework pada Cloudflare Workers dengan D1 binding
- Database: Cloudflare D1 (SQLite-compatible, edge-distributed)
- PWA support: menggunakan `vite-plugin-pwa` dan `workbox-window` untuk offline capability
- HTTPS required: Web NFC API hanya tersedia di secure context
- CORS middleware diterapkan pada semua `/api/*` routes
- Observability: Cloudflare Workers logs + Analytics Engine datasets
- Build tools: Vite, TypeScript 6, oxlint, oxfmt, Vitest, Playwright (E2E)

---

## 12. Limitasi & Constraint yang Diketahui

- Web NFC hanya tersedia di Chrome Android - iOS dan desktop browser tidak didukung
- Rate limiter bersifat in-memory per Worker isolate - tidak shared antar isolate (acceptable untuk single-instance)
- Access token belum menggunakan cryptographic signature (JWT unsigned) - bergantung pada HTTPS transport security
- HMAC pada kartu di-truncate ke 8 bytes - trade-off antara security dan space pada NFC tag
- Chain hash di-truncate ke 4 bytes - collision probability rendah untuk 5 entries, tapi bukan cryptographically strong
- Dual-buffer recovery hanya bekerja jika setidaknya satu buffer valid - jika kedua buffer corrupt, kartu tidak dapat di-recover
- Offline mode tidak mendukung multi-device - hanya 1 device yang berfungsi untuk semua role
- Session grant cache di client bisa stale - jika server melakukan key rotation, kartu akan ditolak sampai grant di-refresh
- Maximum 16 juta per transaksi dan saldo kartu (uint24 limit pada log entry amount field, bisnis limit Rp.16.000.000)
- Card name pada kartu dibatasi 24 bytes UTF-8 - nama panjang akan di-truncate
- User ID pada kartu dibatasi 8 bytes ASCII - harus alphanumeric pendek
- Policy system (`maxDailyTotal`, `topupOnlineOnly`, `allowedTxTypes`) didefinisikan di API/IndexedDB tetapi belum di-enforce pada saat transaksi
