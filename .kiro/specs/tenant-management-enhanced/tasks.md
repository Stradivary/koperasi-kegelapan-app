# Implementation Plan: Tenant Management Enhanced

## Overview

This plan implements the enhanced multitenancy system in incremental steps: server-side schema first, then device management, authentication sessions, sync engine (push/pull), transaction log service, UI, and finally wiring everything together. Each step builds on the previous, ensuring no orphaned code. All code is TypeScript targeting Cloudflare Workers (server) and the existing Vite/React PWA (client).

## Tasks

- [x] 1. Server-side schema extensions (D1 migrations)
  - [x] 1.1 Create D1 migration for `devices` table
    - Create migration SQL file with `devices` table: device_id (PK UUID), tenant_id (FK), account_id (FK), fingerprint_hash (TEXT NOT NULL), user_agent (TEXT NOT NULL), platform (TEXT NOT NULL), last_seen_at (INTEGER NOT NULL), blocked_until (INTEGER nullable), created_at (INTEGER NOT NULL)
    - Add index on `(tenant_id, account_id)`
    - _Requirements: 1.1, 1.7_

  - [x] 1.2 Create D1 migration for `auth_sessions` table
    - Create migration SQL file with `auth_sessions` table: session_id (PK UUID), tenant_id (FK), account_id (FK), device_id (FK → devices), refresh_token_hash (TEXT NOT NULL), expires_at (INTEGER NOT NULL), revoked_at (INTEGER nullable), created_at (INTEGER NOT NULL)
    - Add indexes on `(device_id)` and `(tenant_id, account_id)`
    - _Requirements: 1.2, 1.7_

  - [x] 1.3 Create D1 migration for `transaction_log` table
    - Create migration SQL file with `transaction_log` table: id (PK auto-increment), tenant_id (FK), card_id (TEXT NOT NULL), user_id (INTEGER nullable), counter (INTEGER NOT NULL), type (TEXT NOT NULL CHECK), amount (INTEGER NOT NULL), balance_after (INTEGER NOT NULL), timestamp (INTEGER NOT NULL), hash (TEXT NOT NULL), terminal_id (INTEGER nullable), device_id (TEXT nullable FK), idempotency_key (TEXT NOT NULL UNIQUE), flagged (INTEGER NOT NULL DEFAULT 0), created_at (INTEGER NOT NULL)
    - Add UNIQUE constraint on `(tenant_id, card_id, counter)`
    - Add indexes on `(tenant_id, card_id)` and `(tenant_id, created_at)`
    - _Requirements: 1.3, 1.5, 1.7_

  - [x] 1.4 Create D1 migration for `sync_cursors` table and `cards.updated_at` column
    - Create migration SQL file with `sync_cursors` table: composite PK (tenant_id, device_id, entity_type), last_cursor (TEXT NOT NULL), updated_at (INTEGER NOT NULL)
    - Add `updated_at` column to existing `cards` table
    - _Requirements: 1.4, 1.6_

  - [x] 1.5 Create Drizzle ORM schema definitions for new tables
    - Define Drizzle schema for `devices`, `auth_sessions`, `transaction_log`, and `sync_cursors` tables
    - Export TypeScript types inferred from schema
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Device fingerprinting and registration
  - [x] 2.1 Implement client-side device fingerprint generation
    - Create `src/lib/deviceFingerprint.ts` with `generateDeviceFingerprint()` function
    - Hash pipe-delimited concatenation of userAgent, screenResolution, timezone, language, platform using Web Crypto SHA-256
    - Return `DeviceFingerprint` object with individual attributes and hash
    - Handle Web Crypto unavailability by throwing descriptive error
    - _Requirements: 2.1, 2.7, 2.8_

  - [ ]* 2.2 Write property test for device fingerprint determinism
    - **Property 8: Device Fingerprint Determinism**
    - **Validates: Requirements 2.1, 2.6**

  - [x] 2.3 Implement server-side Device Registry service
    - Create device registry module with `registerDevice`, `getDevicesByAccount`, `blockDevice`, `unblockDevice`, `isDeviceBlocked`, `revokeDeviceSessions` functions
    - Implement upsert logic: new fingerprint → generate UUID; existing fingerprint → update last_seen_at
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [ ]* 2.4 Write unit tests for Device Registry
    - Test upsert logic (new device vs existing device)
    - Test block/unblock with time boundaries
    - Test session revocation cascade
    - _Requirements: 2.3, 2.4, 2.5_

- [x] 3. Multi-device authentication sessions
  - [x] 3.1 Implement Auth Session service
    - Create auth session module with `createSession`, `refreshSession`, `revokeSession`, `revokeDeviceSessions`, `getActiveSessions` functions
    - Store refresh_token_hash (SHA-256), never raw token
    - Enforce max 5 concurrent sessions per account (revoke LRU on overflow)
    - Bind sessions to device_id
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 3.2 Write property test for session independence
    - **Property 9: Session Independence**
    - **Validates: Requirements 3.1, 3.4, 3.5**

  - [x] 3.3 Integrate device fingerprint into login flow
    - Modify login API handler to accept deviceFingerprint in payload
    - Call Device Registry to register/upsert device on login
    - Create auth_session bound to device_id
    - Return deviceId to client alongside tokens
    - Store deviceId in IndexedDB tenantContext on client
    - _Requirements: 2.2, 3.1, 3.7_

  - [ ]* 3.4 Write unit tests for Auth Session service
    - Test session creation and max-session enforcement
    - Test refresh token rotation and hash verification
    - Test revocation on failed refresh (compromised token)
    - _Requirements: 3.1, 3.4, 3.5, 3.8_

- [x] 4. Checkpoint - Schema and auth foundations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Superadmin device management
  - [x] 5.1 Implement superadmin device management API routes
    - `GET /api/superadmin/devices?tenantId=X` — list devices for tenant (superadmin only)
    - `POST /api/superadmin/devices/:deviceId/block` — block device with duration (60–31,536,000 seconds)
    - `POST /api/superadmin/devices/:deviceId/unblock` — unblock device
    - Validate duration range, device existence, and superadmin role
    - Execute block + session revocation atomically in single DB transaction
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 5.2 Write property test for device block enforcement
    - **Property 3: Device Block Enforcement**
    - **Validates: Requirements 5.1, 5.3, 5.4**

  - [ ]* 5.3 Write property test for session cascade on device block
    - **Property 4: Session Cascade on Device Block**
    - **Validates: Requirements 4.3, 4.6**

  - [x] 5.4 Implement device block enforcement middleware
    - Create middleware that checks `devices.blocked_until > now` on every authenticated request
    - Return 403 with `{ error: "device_blocked", blockedUntil }` if blocked
    - Treat expired blocks as unblocked (no DB update needed at query time)
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 5.5 Implement client-side device block handling
    - Intercept 403 `device_blocked` responses in API client
    - Clear local auth session (operatorSession, tenantContext, cached refresh state) from IndexedDB
    - Display "Device blocked" message with formatted unblock time
    - Suppress Sync Engine outbound requests while blocked
    - Attempt re-authentication when blockedUntil passes
    - _Requirements: 5.2, 5.5, 5.6_

- [x] 6. Bidirectional sync engine - Push phase
  - [ ] 6.1 Implement sync push API endpoint
    - `POST /api/sync/push` — accept batched transactions and member updates
    - Validate tenant isolation (token tenant_id must match payload)
    - Process idempotency keys: skip duplicates silently
    - Reject stale counters (counter ≤ server's known counter)
    - Update card balance/counter for accepted transactions with higher counter
    - Return `{ accepted, rejected: [{ key, reason }], serverCursor }`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 8.1, 8.3, 8.5, 8.6_

  - [ ]* 6.2 Write property test for idempotent sync
    - **Property 2: Idempotent Sync**
    - **Validates: Requirements 1.5, 6.2, 6.3**

  - [ ]* 6.3 Write property test for balance consistency
    - **Property 6: Balance Consistency**
    - **Validates: Requirements 6.4, 6.6**

  - [x] 6.4 Implement client-side sync push logic
    - Read pending Outbox entries (syncStatus "pending") for active tenant
    - Batch into groups of max 500 entries per request
    - Include idempotency_key per transaction
    - Mark accepted entries as "synced" with timestamp
    - Mark stale_counter rejections as "conflict" and trigger pull
    - Implement exponential backoff retry (1s, 2s, 4s, 8s, max 60s, max 10 attempts)
    - _Requirements: 6.1, 6.2, 6.5, 6.7, 6.8_

- [x] 7. Bidirectional sync engine - Pull phase
  - [x] 7.1 Implement sync pull API endpoint
    - `GET /api/sync/pull?tenantId=X&membersCursor=C&cardsCursor=C&txCursor=C`
    - Return entities with updated_at > cursor, ordered ascending
    - Limit 500 per entity type per request, include `has_more` flag
    - Include new cursor values in response
    - Handle initial sync (cursor "0" or empty)
    - Enforce tenant isolation via token tenant_id
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.7, 7.8, 8.2, 8.4, 8.5_

  - [ ]* 7.2 Write property test for cursor monotonicity
    - **Property 5: Cursor Monotonicity**
    - **Validates: Requirements 7.2, 7.5, 7.6**

  - [ ]* 7.3 Write property test for tenant isolation
    - **Property 1: Tenant Isolation**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

  - [x] 7.4 Implement client-side sync pull logic
    - Send current sync cursors to pull endpoint
    - Paginate with `has_more` until all entity types complete
    - Merge server data into IndexedDB via upsert in single Dexie transaction
    - Skip entities with pending Outbox entries for same record
    - Update local sync cursors on success
    - Handle 401 (abort + re-auth), 5xx (retry with backoff, max 5 attempts)
    - _Requirements: 7.1, 7.4, 7.5, 7.6, 7.9, 7.10_

  - [ ]* 7.5 Write property test for batch size invariant
    - **Property 12: Batch Size Invariant**
    - **Validates: Requirements 7.3, 14.3**

- [ ] 8. Checkpoint - Sync engine core
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Sync orchestration, debouncing, and conflict resolution
  - [x] 9.1 Implement sync orchestrator with debouncing
    - Create `useSyncEngine` hook (or refactor existing `useTenantSync`)
    - Implement 5-second debounce timer on Outbox writes
    - Trigger immediate sync on visibility change (hidden→visible) and online event
    - Queue sync requests if cycle already in progress
    - Restart debounce timer on mutations during active sync
    - Expose sync status: "idle" | "pushing" | "pulling" | "error" | "offline"
    - Expose lastSyncedAt timestamp and pending Outbox count
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 14.1, 14.2, 14.4, 14.5_

  - [ ]* 9.2 Write property test for sync debounce coalescence
    - **Property 11: Sync Debounce Coalescence**
    - **Validates: Requirements 14.1**

  - [x] 9.3 Implement conflict resolution logic
    - Server-wins for admin actions (superadmin/tenant admin modifications)
    - Last-write-wins for concurrent member/card edits (compare updated_at)
    - Discard local Outbox entry when server version is newer
    - Display toast notification (5s) when local edit is overwritten
    - Handle stale_counter: mark as "conflict", trigger pull
    - Retry pull on network failure, retain "conflict" status
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x] 9.4 Implement rate limiting handling
    - Handle 429 responses: pause sync for Retry-After seconds (max 120s)
    - Retain pending Outbox entries during pause
    - Resume push phase when pause expires
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 10. Transaction log service
  - [x] 10.1 Implement local Transaction Log Service
    - Create `src/lib/transactionLogService.ts`
    - `recordTransaction`: persist to IndexedDB with syncStatus "pending", syncedAt null, createdAt now
    - Enforce composite uniqueness [tenantId, cardId, counter] — reject duplicates
    - `getTransactions`: paginated query with filters (cardId, type, dateFrom, dateTo)
    - `getTransactionsByCard`: query by tenantId + cardId
    - `getSyncableEntries`: query by tenantId + syncStatus "pending"
    - Support querying by syncStatus
    - Retry IndexedDB write once on failure
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 10.2 Write property test for offline durability
    - **Property 7: Offline Durability**
    - **Validates: Requirements 9.1, 9.3, 9.5**

  - [ ]* 10.3 Write property test for filter correctness
    - **Property 10: Filter Correctness**
    - **Validates: Requirements 10.3, 10.4, 10.5**

- [x] 11. Transactions UI section
  - [x] 11.1 Create Transactions route and page component
    - Add `/transactions` route via TanStack Router
    - Add "Transactions" link to main navigation
    - Create `TransactionsSection` component with paginated table
    - Display columns: date/time, card ID, type, amount, balance after, sync status
    - Sort by timestamp descending (newest first)
    - Default page size 20, max 100
    - _Requirements: 10.1, 10.2, 10.6_

  - [x] 11.2 Implement transaction filters UI
    - Add filter controls: card ID text input, type dropdown, date range picker
    - Apply filters as logical AND
    - Card ID filter: exact match, case-insensitive
    - Type filter: debit, credit/top-up, check-in, check-out, system/admin
    - Date range: inclusive on both bounds
    - Display empty state when no results match
    - Support offline filtering from local IndexedDB
    - _Requirements: 10.3, 10.4, 10.5, 10.7, 10.8, 10.9_

  - [ ]* 11.3 Write unit tests for Transactions UI
    - Test filter application and pagination
    - Test empty state rendering
    - Test offline data display
    - _Requirements: 10.2, 10.7, 10.8_

- [x] 12. Sync status UI and IndexedDB schema extensions
  - [x] 12.1 Extend IndexedDB/Dexie schema with sync tables
    - Add `transactionLog` table to Dexie schema with indexes on [tenantId, cardId, counter], [tenantId, syncStatus], [tenantId, timestamp]
    - Add `syncCursors` table with composite key [tenantId, entityType]
    - Add `deviceInfo` table for storing local device registration
    - Bump Dexie DB version
    - _Requirements: 9.1, 9.2_

  - [x] 12.2 Implement sync status indicator UI
    - Display sync status badge (idle/pushing/pulling/error/offline)
    - Show pending Outbox entry count
    - Show lastSyncedAt timestamp
    - Update within 1 second of state transitions
    - _Requirements: 11.1, 11.2, 11.7, 11.8_

- [x] 13. Server-side rate limiting for sync endpoints
  - [x] 13.1 Implement rate limiting middleware for sync endpoints
    - Apply sliding window rate limit: 60 requests/minute per device_id
    - Return 429 with Retry-After header on limit exceeded
    - Apply only to `/api/sync/push` and `/api/sync/pull` endpoints
    - _Requirements: 13.1, 13.2_

- [ ] 14. Integration wiring and final assembly
  - [ ] 14.1 Wire device fingerprint into existing auth flow
    - Update login page to call `generateDeviceFingerprint()` before submitting credentials
    - Pass fingerprint to auth API
    - Store returned deviceId in IndexedDB tenantContext
    - Include deviceId in all subsequent API request headers
    - _Requirements: 2.1, 2.2, 3.7_

  - [ ] 14.2 Wire sync engine into app lifecycle
    - Initialize sync engine on app mount when authenticated
    - Trigger full sync on app resume / online event
    - Connect Outbox writes from existing transaction recording to sync debounce
    - Connect device block handler to sync engine suppression
    - _Requirements: 11.4, 14.1, 14.2_

  - [ ]* 14.3 Write integration tests for end-to-end sync flow
    - Test: record transaction locally → push → pull from second device context → verify consistency
    - Test: device block → verify 403 → unblock → verify access restored
    - Test: concurrent sessions from multiple devices
    - _Requirements: 6.1, 7.1, 5.1, 3.1_

- [ ] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `useTenantSync.ts` hook should be refactored/extended rather than replaced
- All server-side code targets Cloudflare Workers with Drizzle ORM on D1
- All client-side code uses React, TanStack Router/Query, and Dexie.js

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.5", "12.1"] },
    { "id": 2, "tasks": ["2.1", "2.3"] },
    { "id": 3, "tasks": ["2.2", "2.4", "3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 5, "tasks": ["5.1", "5.4"] },
    { "id": 6, "tasks": ["5.2", "5.3", "5.5"] },
    { "id": 7, "tasks": ["6.1", "10.1"] },
    { "id": 8, "tasks": ["6.2", "6.3", "6.4", "10.2", "10.3"] },
    { "id": 9, "tasks": ["7.1"] },
    { "id": 10, "tasks": ["7.2", "7.3", "7.4", "7.5"] },
    { "id": 11, "tasks": ["9.1", "9.3", "9.4"] },
    { "id": 12, "tasks": ["9.2", "11.1", "13.1"] },
    { "id": 13, "tasks": ["11.2", "12.2"] },
    { "id": 14, "tasks": ["11.3", "14.1", "14.2"] },
    { "id": 15, "tasks": ["14.3"] }
  ]
}
```
