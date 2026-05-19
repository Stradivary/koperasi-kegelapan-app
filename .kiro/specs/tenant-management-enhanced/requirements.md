# Requirements Document

## Introduction

This feature enhances the multitenancy system for the koperasi kegelapan management PWA. It introduces bidirectional transaction log sync between IndexedDB and D1, multi-device login with device fingerprinting, superadmin remote device invalidation/blocking, a new "Transactions" UI section, and a cursor-based incremental sync engine. The architecture maintains the local-first offline-capable design while adding robust server-side state for cross-device consistency and administrative control.

## Glossary

- **Sync_Engine**: The client-side module responsible for bidirectional data synchronization between IndexedDB and the D1 server database, managing push/pull phases, cursor tracking, and retry logic.
- **Device_Registry**: The server-side component that tracks device fingerprints, manages device lifecycle, and enforces blocking rules.
- **Transaction_Log_Service**: The service managing transaction log persistence, querying, and sync status tracking between local and server stores.
- **Device_Fingerprint**: A SHA-256 hash derived from browser attributes (userAgent, screen resolution, timezone, language, platform) that uniquely identifies a device/browser combination.
- **Sync_Cursor**: A timestamp or sequence number tracking the last-synced position per tenant, per device, per entity type, enabling incremental pulls.
- **Idempotency_Key**: A unique string in format `{tenantId}:{cardId}:{counter}` that prevents duplicate transaction insertions on the server.
- **Outbox**: The local IndexedDB queue of pending mutations (transactions, member updates) awaiting push to the server.
- **D1_Database**: The Cloudflare D1 SQL database serving as the server-side source of truth for tenant data.
- **Superadmin**: The highest-privilege role with authority to view device registries and block/unblock devices across tenants.
- **Auth_Session**: A server-tracked session record binding an access/refresh token pair to a specific device and account.
- **PWA_Client**: The Progressive Web Application running on a user's device, operating in local-first mode with IndexedDB persistence.

## Requirements

### Requirement 1: Server-Side Schema Extensions

**User Story:** As a developer, I want the D1 database schema extended with devices, auth_sessions, transaction_log, and sync_cursors tables, so that the server can track device state, session lifecycle, transaction history, and sync progress.

#### Acceptance Criteria

1. THE D1_Database SHALL contain a `devices` table with columns: device_id (PK, UUID, NOT NULL), tenant_id (FK → tenants.tenant_id, NOT NULL), account_id (FK → accounts.account_id, NOT NULL), fingerprint_hash (TEXT, NOT NULL, 64-character hex string), user_agent (TEXT, NOT NULL, max 512 characters), platform (TEXT, NOT NULL, max 128 characters), last_seen_at (INTEGER, NOT NULL, unix timestamp in seconds), blocked_until (INTEGER, nullable, unix timestamp in seconds), created_at (INTEGER, NOT NULL, unix timestamp in seconds).
2. THE D1_Database SHALL contain an `auth_sessions` table with columns: session_id (PK, UUID, NOT NULL), tenant_id (FK → tenants.tenant_id, NOT NULL), account_id (FK → accounts.account_id, NOT NULL), device_id (FK → devices.device_id, NOT NULL), refresh_token_hash (TEXT, NOT NULL, 64-character hex SHA-256), expires_at (INTEGER, NOT NULL, unix timestamp in seconds), revoked_at (INTEGER, nullable, unix timestamp in seconds), created_at (INTEGER, NOT NULL, unix timestamp in seconds).
3. THE D1_Database SHALL contain a `transaction_log` table with columns: id (PK, INTEGER, auto-increment), tenant_id (FK → tenants.tenant_id, NOT NULL), card_id (TEXT, NOT NULL, 12-character hex string), user_id (INTEGER, nullable, FK → users(tenant_id, user_id)), counter (INTEGER, NOT NULL, range 0–65535), type (TEXT, NOT NULL, CHECK IN ('debit', 'credit', 'checkin', 'checkout', 'topup', 'admin')), amount (INTEGER, NOT NULL, range 0–16000000), balance_after (INTEGER, NOT NULL, range 0–16000000), timestamp (INTEGER, NOT NULL, unix timestamp in seconds), hash (TEXT, NOT NULL, 12-character hex string), terminal_id (INTEGER, nullable), device_id (TEXT, nullable, FK → devices.device_id), idempotency_key (TEXT, NOT NULL, UNIQUE), flagged (INTEGER, NOT NULL, default 0, CHECK IN (0, 1)), created_at (INTEGER, NOT NULL, unix timestamp in seconds).
4. THE D1_Database SHALL contain a `sync_cursors` table with composite PK (tenant_id, device_id, entity_type) and columns: tenant_id (TEXT, NOT NULL, FK → tenants.tenant_id), device_id (TEXT, NOT NULL, FK → devices.device_id), entity_type (TEXT, NOT NULL, CHECK IN ('members', 'cards', 'transactions')), last_cursor (TEXT, NOT NULL), updated_at (INTEGER, NOT NULL, unix timestamp in seconds).
5. THE D1_Database SHALL enforce a UNIQUE constraint on the combination (tenant_id, card_id, counter) in the `transaction_log` table to prevent duplicate transactions for the same card counter within a tenant.
6. THE D1_Database SHALL add an `updated_at` column (INTEGER, NOT NULL, unix timestamp in seconds) to the existing `cards` table to support cursor-based incremental sync.
7. THE D1_Database SHALL create indexes on: `devices(tenant_id, account_id)`, `auth_sessions(device_id)`, `auth_sessions(tenant_id, account_id)`, `transaction_log(tenant_id, card_id)`, and `transaction_log(tenant_id, created_at)` to support query patterns for device lookup, session revocation, and transaction filtering.

### Requirement 2: Device Fingerprinting and Registration

**User Story:** As a system operator, I want each device uniquely identified via fingerprinting, so that the system can track which devices access each tenant and enable per-device security controls.

#### Acceptance Criteria

1. WHEN a user authenticates, THE PWA_Client SHALL generate a Device_Fingerprint by hashing the pipe-delimited concatenation of userAgent, screen resolution, timezone, language, and platform (in that order) using SHA-256 via the Web Crypto API.
2. WHEN a login request is submitted, THE PWA_Client SHALL include the Device_Fingerprint hash in the authentication payload.
3. WHEN the server receives a login request with a Device_Fingerprint, THE Device_Registry SHALL upsert a device record associated with the authenticated user's tenant_id and account_id, storing the fingerprint hash, user_agent, platform, and current timestamp as last_seen_at.
4. WHEN a device record is created for a new fingerprint, THE Device_Registry SHALL generate a UUID as the device_id and return it to the client.
5. WHEN a device record already exists for the given fingerprint and account within the same tenant, THE Device_Registry SHALL update last_seen_at and return the existing device_id to the client.
6. WHEN an authenticated request is received, THE Device_Registry SHALL update the last_seen_at timestamp for the requesting device.
7. THE Device_Fingerprint hash SHALL be a deterministic 64-character hexadecimal string for the same device/browser combination.
8. IF the Web Crypto API is unavailable during fingerprint generation, THEN THE PWA_Client SHALL prevent the login attempt and display an error message indicating that the browser does not support required security features.

### Requirement 3: Multi-Device Authentication Sessions

**User Story:** As a user, I want to log in from multiple devices simultaneously, so that I can access the koperasi management system from my phone and tablet without being logged out of either.

#### Acceptance Criteria

1. WHEN a user authenticates from a new device, THE Auth_Session service SHALL create a new session record bound to that specific device_id without invalidating sessions on other devices, up to a maximum of 5 concurrent sessions per account within a tenant.
2. THE Auth_Session service SHALL store the refresh_token_hash (SHA-256 of the refresh token) in the auth_sessions table, never the raw token.
3. WHEN a session is created, THE Auth_Session service SHALL set an expires_at timestamp equal to the current time plus the tenant-configured session duration, which defaults to 30 days and must be between 1 day and 90 days.
4. WHEN a refresh token is used, THE Auth_Session service SHALL verify the token hash matches the stored refresh_token_hash for the session, issue a new refresh token, and invalidate the previous token hash.
5. IF a refresh token hash verification fails or a previously-revoked refresh token is presented, THEN THE Auth_Session service SHALL revoke all sessions for that device_id, return an authentication error indicating session invalidation, and require full re-authentication.
6. WHEN a session expires, THE Auth_Session service SHALL reject requests using that session's tokens and require re-authentication.
7. THE PWA_Client SHALL store the device_id in the local IndexedDB tenant context for inclusion in subsequent API requests.
8. IF the maximum concurrent session limit is reached when a user authenticates from a new device, THEN THE Auth_Session service SHALL revoke the least-recently-used session and create the new session.

### Requirement 4: Superadmin Device Management

**User Story:** As a superadmin, I want to view all registered devices and remotely block compromised devices, so that I can maintain security across the system.

#### Acceptance Criteria

1. WHEN a superadmin requests the device list, THE Device_Registry SHALL return all device records for the specified tenant including device_id, fingerprint_hash, user_agent, platform, last_seen_at, and blocked_until.
2. WHEN a superadmin blocks a device with a specified duration, THE Device_Registry SHALL set blocked_until to the current time plus the duration, where duration is between 60 and 31,536,000 seconds (1 minute to 365 days).
3. WHEN a device is blocked, THE Device_Registry SHALL revoke all auth_sessions for that device where revoked_at is null and expires_at is greater than the current time, by setting revoked_at to the current timestamp.
4. WHEN a superadmin unblocks a device, THE Device_Registry SHALL set blocked_until to null.
5. IF a non-superadmin user attempts to access device management endpoints, THEN THE API SHALL return a 403 Forbidden response.
6. THE Device_Registry SHALL execute the block operation and session revocation atomically within a single database transaction.
7. IF a superadmin attempts to block or unblock a device_id that does not exist in the specified tenant, THEN THE Device_Registry SHALL return an error indicating the device was not found.
8. IF a superadmin attempts to block a device with a duration outside the range of 60 to 31,536,000 seconds, THEN THE Device_Registry SHALL reject the request with an error indicating the duration is invalid.

### Requirement 5: Device Block Enforcement

**User Story:** As a system operator, I want blocked devices immediately denied access to all API endpoints, so that compromised devices cannot interact with the system until unblocked.

#### Acceptance Criteria

1. WHEN an authenticated request is received from a device where blocked_until is greater than the current server time, THE API SHALL return a 403 response with error code "device_blocked" and the blockedUntil timestamp, regardless of the endpoint being accessed including token refresh.
2. WHEN a blocked device receives a 403 device_blocked response, THE PWA_Client SHALL clear the local auth session from IndexedDB (operatorSession, tenantContext, and cached refresh state) and display a "Device blocked" message showing the unblock time formatted in the user's locale.
3. WHEN a device's blocked_until timestamp is less than or equal to the current server time, THE API SHALL treat the device as unblocked and allow the request to proceed through normal authentication and authorization checks.
4. THE API SHALL check device block status on every authenticated request before processing the request logic, using the server's clock for time comparison.
5. WHILE a device is blocked, THE PWA_Client SHALL suppress all outbound API requests from the Sync_Engine and operate in offline-only mode using locally cached IndexedDB data until the blockedUntil time has passed or the user re-authenticates.
6. WHEN the PWA_Client detects that the blockedUntil time has passed based on the device clock, THE PWA_Client SHALL attempt re-authentication to verify unblock status with the server before resuming normal API operations.

### Requirement 6: Bidirectional Sync Engine - Push Phase

**User Story:** As a user, I want my locally recorded transactions and data changes pushed to the server, so that other devices and the admin dashboard reflect my activity.

#### Acceptance Criteria

1. WHEN the Sync_Engine initiates a push, THE Sync_Engine SHALL read all Outbox entries with syncStatus "pending" for the active tenant and batch them into groups of at most 500 entries per request.
2. WHEN pushing transactions, THE Sync_Engine SHALL include the Idempotency_Key for each transaction entry.
3. WHEN the server receives a push with a duplicate Idempotency_Key, THE D1_Database SHALL silently skip the duplicate without returning an error.
4. WHEN the server accepts pushed transactions, THE D1_Database SHALL update the corresponding card's balance and counter if the pushed counter is higher than the stored counter.
5. WHEN the push completes with a response containing both accepted and rejected entries, THE Sync_Engine SHALL mark accepted Outbox entries as "synced" with the current timestamp and process each rejected entry according to its rejection reason.
6. WHEN a pushed transaction has a counter less than or equal to the server's known counter for that card, THE API SHALL reject it with reason "stale_counter".
7. WHEN the Sync_Engine receives a rejection with reason "stale_counter", THE Sync_Engine SHALL mark the corresponding Outbox entry as "conflict" and trigger a pull for the latest server state of that card.
8. IF a network failure occurs during push, THEN THE Sync_Engine SHALL retain all pending entries in the Outbox and retry with exponential backoff (1s, 2s, 4s, 8s, max 60s) up to a maximum of 10 consecutive retry attempts before reporting status as "error".

### Requirement 7: Bidirectional Sync Engine - Pull Phase

**User Story:** As a user, I want server-side changes from other devices pulled to my local database, so that I see up-to-date member, card, and transaction data.

#### Acceptance Criteria

1. WHEN the Sync_Engine initiates a pull, THE Sync_Engine SHALL send the current Sync_Cursor values for members, cards, and transactions to the server.
2. WHEN the server processes a pull request, THE API SHALL return entities with updated_at greater than the provided cursor value, ordered by updated_at ascending.
3. THE API SHALL limit pull responses to a maximum of 500 entities per entity type per request and SHALL include a `has_more` flag per entity type indicating whether additional entities remain to be fetched.
4. WHEN the pull response indicates `has_more` is true for any entity type, THE Sync_Engine SHALL issue subsequent pull requests using the updated cursor until `has_more` is false for all entity types.
5. WHEN the pull response is received, THE Sync_Engine SHALL merge server data into IndexedDB using upsert operations within a single transaction, skipping any entity that has a pending Outbox entry for the same record.
6. WHEN the pull completes successfully for a batch, THE Sync_Engine SHALL update the local Sync_Cursor values to the new cursor returned by the server.
7. THE API SHALL include new cursor values in every pull response for the client to use in subsequent incremental pulls.
8. WHEN the cursor value is "0" or empty, THE API SHALL treat it as an initial sync and return entities for the tenant starting from the earliest, paginated in batches of 500 per entity type.
9. IF a pull request fails due to a network error or a server error response (5xx), THEN THE Sync_Engine SHALL retry with exponential backoff (1s, 2s, 4s, 8s, max 60s) up to 5 attempts before reporting sync status as "error".
10. IF a pull request returns a 401 response, THEN THE Sync_Engine SHALL abort the pull cycle and trigger re-authentication.

### Requirement 8: Tenant Data Isolation in Sync

**User Story:** As a system operator, I want strict tenant isolation enforced during all sync operations, so that no tenant can access another tenant's data.

#### Acceptance Criteria

1. WHEN a sync push is received, THE API SHALL verify that the authenticated token's tenant_id matches the tenantId in the push payload, and SHALL use the authenticated token's tenant_id as the authoritative tenant scope for all subsequent processing of that request.
2. WHEN a sync pull is processed, THE API SHALL filter all returned entities (members, cards, and transactions) by the authenticated token's tenant_id, including only entities where the entity's tenant_id equals the token's tenant_id.
3. IF a sync request contains a tenant_id that does not match the authenticated token, THEN THE API SHALL reject the request with a 403 Forbidden response and SHALL NOT process any entities in the payload.
4. THE D1_Database SHALL include tenant_id in the composite primary key of sync_cursors and SHALL include a tenant_id equality condition in every query to the sync_cursors table, ensuring one tenant's cursor state cannot be read or modified by another tenant.
5. THE API SHALL never include entities belonging to other tenants in any sync response (push or pull), regardless of cursor values, entity IDs, or other parameters provided in the request.
6. WHEN a sync push contains entities (cards or transactions) whose ownership does not belong to the authenticated tenant, THE API SHALL reject those entities individually with reason "tenant_mismatch" and SHALL NOT persist them to the D1_Database.

### Requirement 9: Transaction Log Local Persistence

**User Story:** As a user, I want all transactions recorded locally with sync metadata, so that my transaction history is available offline and I can track what has been synced.

#### Acceptance Criteria

1. WHEN a transaction is recorded locally, THE Transaction_Log_Service SHALL persist it to IndexedDB with syncStatus "pending", syncedAt null, and createdAt set to the current timestamp (epoch milliseconds).
2. THE Transaction_Log_Service SHALL store each transaction with fields: tenantId, cardId, userId, counter, type (one of "debit", "credit", "check-in", "check-out", "system"), amount (integer in smallest currency unit, range 0 to 16,777,215), balanceAfter, timestamp, hash, terminalId, deviceId, syncStatus (one of "pending", "synced", "conflict"), syncedAt, and createdAt.
3. THE Transaction_Log_Service SHALL uniquely identify each transaction record by the composite key [tenantId, cardId, counter] and reject duplicate writes for the same composite key.
4. WHEN a transaction is confirmed synced by the server (the event appears in the reconciliation response accepted set without a corresponding entry in the flags array), THE Transaction_Log_Service SHALL update its syncStatus to "synced" and set syncedAt to the current timestamp (epoch milliseconds).
5. WHEN a sync conflict is detected for a transaction (the server responds with a 409 duplicate_counter error or the event appears in the reconciliation response rejected set), THE Transaction_Log_Service SHALL update its syncStatus to "conflict".
6. IF an IndexedDB write fails when persisting a transaction, THEN THE Transaction_Log_Service SHALL retry the write once and, if the retry also fails, surface an error indication to the caller without discarding the transaction data from memory.
7. THE Transaction_Log_Service SHALL support querying stored transactions by tenantId and by syncStatus, and SHALL retain all locally recorded transactions in IndexedDB regardless of sync status until a user-initiated or operator-initiated purge action is performed.

### Requirement 10: Transactions UI Section

**User Story:** As a tenant admin, I want a dedicated Transactions section in the UI, so that I can view, filter, and search the transaction history for my tenant.

#### Acceptance Criteria

1. THE PWA_Client SHALL display a "Transactions" section accessible from the main navigation.
2. WHEN the Transactions section loads, THE PWA_Client SHALL display a paginated list of transactions sorted by timestamp descending (newest first) with columns: date/time, card ID, type, amount, balance after, and sync status.
3. WHEN a user applies a filter by card ID, THE Transaction_Log_Service SHALL return only transactions whose card ID exactly matches the provided hex string (case-insensitive).
4. WHEN a user applies a filter by transaction type, THE Transaction_Log_Service SHALL return only transactions matching the selected type, where valid types are: debit, credit/top-up, check-in, check-out, and system/admin.
5. WHEN a user applies a date range filter, THE Transaction_Log_Service SHALL return only transactions with a timestamp greater than or equal to the start date and less than or equal to the end date (inclusive on both bounds).
6. THE Transaction_Log_Service SHALL support pagination with configurable page size (default 20, maximum 100 entries per page).
7. WHILE the device is offline, THE PWA_Client SHALL display transactions from the local IndexedDB store and support the same filtering and pagination capabilities as when online.
8. IF no transactions match the applied filters, THEN THE PWA_Client SHALL display an empty state message indicating no results were found for the current filter criteria.
9. WHEN multiple filters are applied simultaneously, THE Transaction_Log_Service SHALL return only transactions satisfying all active filter conditions (logical AND).

### Requirement 11: Sync Status Tracking and Reporting

**User Story:** As a user, I want to see the current sync status, so that I know whether my data is up-to-date or pending synchronization.

#### Acceptance Criteria

1. THE Sync_Engine SHALL expose a sync status value of one of: "idle", "pushing", "pulling", "error", or "offline".
2. WHEN the Sync_Engine transitions between states, THE PWA_Client SHALL update the displayed sync status indicator within 1 second of the transition.
3. WHEN the device is offline, THE Sync_Engine SHALL report status as "offline" and queue mutations in the Outbox.
4. WHEN the device comes back online, THE Sync_Engine SHALL automatically trigger a full sync cycle (push then pull) within 3 seconds of connectivity restoration.
5. WHEN a sync error occurs, THE Sync_Engine SHALL report status as "error" and retry with exponential backoff starting at 1 second, doubling each attempt, capped at a maximum interval of 60 seconds, for up to 5 consecutive attempts.
6. IF the Sync_Engine exhausts all 5 retry attempts without success, THEN THE Sync_Engine SHALL remain in "error" status and cease automatic retries until the next manual sync trigger or connectivity change event.
7. THE Sync_Engine SHALL expose a lastSyncedAt timestamp representing the time of the last successful sync completion, or null if no sync has completed for the active tenant.
8. THE PWA_Client SHALL display the count of pending Outbox entries alongside the sync status indicator so the user can assess how much data awaits synchronization.

### Requirement 12: Sync Conflict Resolution

**User Story:** As a user, I want conflicts between local and server data resolved predictably, so that I understand which version of data is authoritative.

#### Acceptance Criteria

1. WHEN two devices submit writes to the same member record, THE API SHALL accept both writes and resolve using last-write-wins by comparing the updated_at timestamp, persisting only the write with the later timestamp.
2. WHEN a local edit is overwritten by a server-side change during pull, THE PWA_Client SHALL display a toast notification for 5 seconds indicating which record was superseded and that the server version was applied.
3. WHEN a pull response contains a member or card record where the server's updated_at is later than the local updated_at and the local record has unsynchronized modifications in the Outbox, THE Sync_Engine SHALL discard the local Outbox entry for that record and apply the server version.
4. WHEN a transaction push is rejected due to stale_counter, THE Sync_Engine SHALL mark the local entry's syncStatus as "conflict" and initiate a pull for the latest server state of that card.
5. IF the pull initiated after a stale_counter rejection fails due to network error, THEN THE Sync_Engine SHALL retain the "conflict" syncStatus on the local entry and retry the pull on the next sync cycle.
6. WHEN a superadmin or tenant admin modifies a member or card record on the server, THE Sync_Engine SHALL treat the server record as authoritative during the next pull, overwriting any conflicting local mutations for that record regardless of local updated_at timestamps.
7. WHEN a local record is overwritten by server-wins resolution, THE Sync_Engine SHALL remove the corresponding Outbox entry for that record so it is not re-pushed in subsequent sync cycles.

### Requirement 13: Rate Limiting for Sync Endpoints

**User Story:** As a system operator, I want sync endpoints rate-limited, so that no single device can overwhelm the server with excessive sync requests.

#### Acceptance Criteria

1. THE API SHALL enforce a rate limit of 60 requests per minute per device_id using a sliding window on sync push and pull endpoints.
2. WHEN a device exceeds the rate limit, THE API SHALL return a 429 Too Many Requests response with a Retry-After header indicating the number of seconds until the next request will be accepted (minimum 1 second, maximum 60 seconds).
3. WHEN the Sync_Engine receives a 429 response, THE Sync_Engine SHALL pause sync operations for the number of seconds specified in the Retry-After header, capped at a maximum pause of 120 seconds.
4. WHILE the Sync_Engine is paused due to rate limiting, THE Sync_Engine SHALL retain all pending Outbox entries with syncStatus "pending" and resume the push phase when the pause expires.

### Requirement 14: Sync Debouncing

**User Story:** As a user, I want sync triggered intelligently after local changes, so that the system avoids excessive API calls while keeping data reasonably fresh.

#### Acceptance Criteria

1. WHEN a local mutation is written to the Outbox, THE Sync_Engine SHALL reset and start a 5-second debounce timer, triggering a sync cycle only after 5 seconds have elapsed with no further Outbox writes.
2. WHEN the document visibility changes from hidden to visible or the browser fires an online event, THE Sync_Engine SHALL trigger a sync cycle within 1 second without waiting for the debounce timer.
3. THE Sync_Engine SHALL batch push operations to include up to 500 entities per request, sending sequential batches until all pending Outbox entries are pushed.
4. IF a sync cycle is already in progress when the debounce timer fires or an immediate sync is requested, THEN THE Sync_Engine SHALL queue the new sync request and execute it after the current cycle completes.
5. IF a local mutation occurs while a sync cycle is in progress, THEN THE Sync_Engine SHALL restart the debounce timer so that the new mutation is included in the next sync cycle.
