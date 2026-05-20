# Bugfix Requirements Document

## Introduction

When a tenant is created locally (offline or online mode) and then synced to the server, the current implementation does not enforce a strict push ordering. Entities (members), cards, and transaction logs may be pushed to the server before the tenant record itself has been created, causing foreign key/reference failures, tenantId mismatches, and broken SSE connections. This results in data sync failures and an unreliable real-time event stream.

The fix must enforce a deterministic push sequence: **tenant → entities (users) → cards → transaction logs**, and ensure the SSE connection is only established after the tenant is confirmed on the server.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a locally-created tenant is being synced AND `syncPushEntities` is called before `POST /api/tenants/sync` completes THEN the system sends members and cards to a server that has no matching tenant record, resulting in orphaned data or server-side errors

1.2 WHEN `syncPushEntities` pushes cards before the corresponding members (users) have been accepted by the server THEN the system may create cards referencing non-existent userId foreign keys on the server

1.3 WHEN the push-entities endpoint receives a payload with a tenantId that does not exist in the server's tenants table THEN the system logs a warning but still attempts to insert entities, causing silent data integrity violations

1.4 WHEN the SSE connection is established using a token whose tenantId has not yet been created on the server THEN the system connects successfully but broadcasts are never received because the tenant context is invalid

1.5 WHEN the tenant sync (`POST /api/tenants/sync`) succeeds but the access token is not propagated to subsequent push calls in the same sync cycle THEN the system fails entity/transaction pushes with 401 authentication errors

1.6 WHEN transaction logs are pushed before cards exist on the server THEN the server rejects transactions with "stale_counter" because the card record lookup returns no result

### Expected Behavior (Correct)

2.1 WHEN a locally-created tenant is being synced THEN the system SHALL first push the tenant record via `POST /api/tenants/sync` and wait for confirmation (201 response) before pushing any other data

2.2 WHEN the tenant has been confirmed on the server THEN the system SHALL push entities (members/users) next and wait for acceptance before pushing cards

2.3 WHEN members have been accepted by the server THEN the system SHALL push cards next and wait for acceptance before pushing transaction logs

2.4 WHEN cards have been accepted by the server THEN the system SHALL push transaction logs last

2.5 WHEN the SSE connection is being established THEN the system SHALL only connect after the tenant has been confirmed to exist on the server (mode === "synced" and valid serverTenantId)

2.6 WHEN the tenant sync returns an access token THEN the system SHALL immediately store and use that token for all subsequent push operations within the same sync cycle

2.7 WHEN any step in the ordered push sequence fails THEN the system SHALL halt the sequence, report the failure, and not proceed to subsequent steps

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a tenant is already synced (mode === "synced") and entities are being pushed THEN the system SHALL CONTINUE TO push entities using the existing access token without re-syncing the tenant

3.2 WHEN a tenant was created by selecting from the server (ServerTenantSelectionSection) THEN the system SHALL CONTINUE TO skip the tenant push step since the tenant already exists on the server

3.3 WHEN there are no pending entities or transactions to push THEN the system SHALL CONTINUE TO skip the push cycle entirely without errors

3.4 WHEN the device is blocked THEN the system SHALL CONTINUE TO abort all sync operations immediately with a DeviceBlockedError

3.5 WHEN the server returns a 409 conflict during tenant sync THEN the system SHALL CONTINUE TO surface the conflict to the user for resolution without pushing any entities

3.6 WHEN a push batch exceeds the maximum size (200 entities or 500 transactions) THEN the system SHALL CONTINUE TO split into multiple batches with retry logic

3.7 WHEN the network is unavailable THEN the system SHALL CONTINUE TO retry with exponential backoff and eventually surface a connection error to the user
