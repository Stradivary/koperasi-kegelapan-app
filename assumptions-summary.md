# Assumptions Summary - Koperasi Kegelapan

## Deployment & Tenancy

- Supports Single and Multi-Tenant deployments (online and offline)
- Offline mode runs on a single device covering all roles (Admin, Gate, Terminal, Scout)
- Each tenant has a unique slug and a lifecycle status (`active`, `suspended`, `archived`) — only `active` tenants can log in
- Default timezone: `Asia/Jakarta`

## Membership & Cards

- Membership cards are issued exclusively by the cooperative; one member can hold multiple cards
- Blocking a member automatically blocks all their associated cards
- Lost card policy: member reports to admin → admin validates via transaction log → re-issue new card with zero balance
- Card statuses: `ACTIVE`, `BLOCKED_TAMPER`, `BLOCKED_FRAUD`, `BLOCKED_EXPIRED`, `BLOCKED_ADMIN`
- Cards are tenant-bound — cards from another tenant are rejected at scan

## Transactions & Balance

- Minimum balance required for check-in: **Rp 10,000**
- Parking fee: **Rp 2,000/hour** (rounded up)
- Balance cannot go negative after checkout
- Maximum per transaction: **Rp 16,000,000** (uint24 log entry constraint)
- Maximum card balance: **Rp 16,000,000** (capped to fit full-balance debit in uint24 log amount)
- Minimum top-up amount: **Rp 2,000**
- Maximum top-up amount: **Rp 2,000,000**
- Minimum initial balance on issuance: **Rp 2,000**
- Card stores the last 5 transaction entries; full history is kept on server/IndexedDB

## Operational Flow

- Card states: `IDLE` → `CHECKED_IN` → `STATION_OPERATION` → `CHECKED_OUT` → `IDLE`
- Session timeout: 24 hours + 1 hour clock drift tolerance — after that, only checkout/force-checkout is allowed
- Admin can reset any card to `IDLE` at any time

## Roles & Access

| Role                | Capability                                                       |
| ------------------- | ---------------------------------------------------------------- |
| **Gate**            | Auto check-in / check-out                                        |
| **Terminal**        | Calculate and deduct parking fee                                 |
| **Scout**           | Read-only — inspect card, balance, and transaction log           |
| **Kiosk**           | Debit / purchase and new card registration                       |
| **Admin / Station** | Full management — issue, top-up, block, unblock, reset, recovery |
| **Superadmin**      | Cross-tenant management                                          |

## Online / Offline Sync

- Strategy: push-first (entities + transactions) → then pull latest from server
- Conflict resolution: server wins
- Auto-sync: every 30 seconds + triggered on tab focus and reconnect
- Retry: exponential backoff up to 5 attempts (max 60 seconds)
- Batch push limit: 500 transactions per request

## Infrastructure

- Frontend: React 19 + TanStack Router/Query → Cloudflare Pages (PWA)
- API: Hono on Cloudflare Workers
- Database: Cloudflare D1 (SQLite, edge-distributed)
- NFC: Web NFC API — **Chrome Android only, HTTPS required**

## Known Limitations

- NFC is not supported on iOS or desktop browsers
- Offline mode does not support multi-device operation
- Maximum Rp 16 million per transaction and max card balance (uint24 log entry constraint)
- Card member name capped at 24 bytes UTF-8
- Policy system (`maxDailyTotal`, `topupOnlineOnly`, `allowedTxTypes`) is defined but not yet enforced at transaction time
