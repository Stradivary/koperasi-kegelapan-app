# Tenant Sync Ordering Fix - Bugfix Design

## Overview

The tenant sync process currently lacks a deterministic push sequence. When a locally-created tenant is synced to the server, entities (members), cards, and transaction logs can be pushed before the tenant record exists on the server, causing foreign key failures, orphaned data, and broken SSE connections. The fix enforces a strict sequential push order: **tenant → entities (users) → cards → transaction logs**, with each step awaiting server confirmation before proceeding to the next. If any step fails, the sequence halts immediately.

## Glossary

- **Bug_Condition (C)**: The condition where `syncPushEntities` or transaction push is invoked before the tenant record has been confirmed on the server (mode !== "synced" or no valid serverTenantId)
- **Property (P)**: The desired behavior — entities are only pushed after tenant confirmation, cards only after members are accepted, and transactions only after cards are accepted
- **Preservation**: Existing behavior for already-synced tenants, server-selected tenants, device-blocked scenarios, and conflict handling must remain unchanged
- **`useTenantSync`**: The hook in `src/hooks/useTenantSync.ts` that handles the `POST /api/tenants/sync` call and stores the returned access token
- **`syncPushEntities`**: The function in `src/lib/syncPushEntities.ts` that pushes pending members and cards to the server in a single combined call
- **`useAdminTenantSync`**: The hook in `src/hooks/useAdminTenantSync.ts` that orchestrates the full sync-to-server flow from the admin UI
- **Push Sequence**: The ordered set of operations: tenant sync → entity push (members) → entity push (cards) → transaction push

## Bug Details

### Bug Condition

The bug manifests when a locally-created tenant (mode === "local") is being synced to the server and the orchestrating code (`useAdminTenantSync`) calls `syncToServer` but does not enforce ordering for subsequent entity and transaction pushes. The `syncPushEntities` function pushes members and cards together in a single payload without ensuring the tenant exists first, and without separating members from cards into ordered steps.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type SyncOperation { tenantMode, pushType, tenantConfirmed, membersAccepted }
  OUTPUT: boolean

  RETURN (input.tenantMode === "local"
         AND (
           (input.pushType === "entities" AND NOT input.tenantConfirmed)
           OR (input.pushType === "cards" AND NOT input.membersAccepted)
           OR (input.pushType === "transactions" AND NOT input.cardsAccepted)
         ))
END FUNCTION
```

### Examples

- **Example 1**: Tenant mode is "local", `syncPushEntities` is called → pushes members to server → server returns 401 or foreign key error because tenant doesn't exist yet. Expected: tenant sync completes first (201), then members are pushed.
- **Example 2**: Members and cards are pushed in the same batch via `syncPushEntities` → server inserts cards with `userId` references → `userId` doesn't exist yet because member insert hasn't completed. Expected: members are pushed and confirmed first, then cards are pushed separately.
- **Example 3**: Transaction push occurs immediately after entity push starts → server rejects with "stale_counter" because card record doesn't exist yet. Expected: transactions are only pushed after cards are confirmed on the server.
- **Example 4**: Tenant sync returns access token but it's not propagated to the entity push call in the same cycle → entity push fails with 401. Expected: access token from tenant sync is immediately available for subsequent push calls.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Already-synced tenants (mode === "synced") must continue to push entities using the existing access token without re-syncing the tenant
- Tenants selected from the server (via ServerTenantSelectionSection) must continue to skip the tenant push step
- Empty push cycles (no pending entities or transactions) must continue to be skipped without errors
- Device-blocked scenarios must continue to abort all sync operations immediately
- 409 conflict responses during tenant sync must continue to surface to the user without pushing entities
- Batch size limits (200 entities, 500 transactions) must continue to be enforced with retry logic
- Network unavailability must continue to trigger exponential backoff and eventual error surfacing

**Scope:**
All inputs where the tenant is already synced (mode === "synced") or where no pending data exists should be completely unaffected by this fix. This includes:

- Regular entity pushes for synced tenants
- Pull operations from the server
- SSE connections for already-confirmed tenants
- Conflict resolution flows

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **No Orchestration Layer**: `useAdminTenantSync` calls `syncToServer` but there is no subsequent orchestrated call to `syncPushEntities` or transaction push within the same flow. The entity push likely happens independently (e.g., triggered by a separate effect or interval), without waiting for tenant confirmation.

2. **Combined Member+Card Push**: `syncPushEntities` pushes members and cards in the same batch (`_pushEntitiesInternal` sends both in one payload). The server-side `push-entities` endpoint processes members first then cards, but if the batch is large, cards in subsequent batches may reference members that haven't been fully committed yet.

3. **Token Propagation Gap**: `useTenantSync.performSync` calls `setAccessToken(data.accessToken)` after a successful tenant sync, but this is a module-level setter. If `syncPushEntities` is called in the same tick or before the state update propagates, it may use a stale or null token.

4. **Missing Sequence Gate**: There is no state machine or sequential gate that prevents entity push from firing until tenant sync has completed. The `syncPushEntities` function only checks `getAccessToken()` — if a token exists from a previous session, it will proceed even if the tenant hasn't been created on the server yet.

## Correctness Properties

Property 1: Bug Condition - Push Ordering Enforcement

_For any_ sync operation where the tenant mode is "local" and a full sync-to-server is initiated, the system SHALL execute push operations in strict sequential order (tenant → members → cards → transactions), waiting for server confirmation (2xx response) at each step before proceeding to the next, and SHALL halt the entire sequence if any step fails.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.7**

Property 2: Preservation - Existing Synced Tenant Behavior

_For any_ sync operation where the tenant is already synced (mode === "synced") or was selected from the server, the system SHALL produce the same behavior as the original code, preserving direct entity push without re-syncing the tenant, existing token usage, and all batch/retry logic.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/lib/syncPushEntities.ts`

**Function**: `syncPushEntities` and `_pushEntitiesInternal`

**Specific Changes**:

1. **Separate Members from Cards**: Split `_pushEntitiesInternal` into two sequential phases — first push all member batches and await confirmation, then push all card batches. Remove the current pattern of mixing cards into the first member batch.

2. **Add Ordering Gate Parameter**: Add an optional parameter or a new orchestrator function that accepts a sequence configuration, ensuring cards are only pushed after all members are confirmed.

**File**: `src/hooks/useAdminTenantSync.ts`

**Function**: `handleSyncToServer`

**Specific Changes**: 3. **Orchestrate Full Sequence**: After `syncToServer` completes successfully, immediately call `syncPushEntities` (members-only phase), then cards phase, then transaction push — all within the same async flow. Currently, `handleSyncToServer` only calls `syncToServer` and refreshes config.

4. **Token Propagation**: Ensure the access token returned by `syncToServer` is set before any entity push call. Add an explicit `await` boundary between `setAccessToken` and the first entity push.

5. **Halt on Failure**: If any step in the sequence fails, set error state and do not proceed to subsequent steps. Surface the specific step that failed to the user.

**File**: `src/hooks/useTenantSync.ts`

**Function**: `performSync`

**Specific Changes**: 6. **Return Token**: Modify `syncToServer` to return the access token (or a success result object) so the orchestrator can confirm token availability before proceeding.

**File**: `src/lib/syncPushEntities.ts`

**Function**: New `syncPushMembers` and `syncPushCards` exports

**Specific Changes**: 7. **Granular Push Functions**: Export separate `syncPushMembers(tenantId)` and `syncPushCards(tenantId)` functions that can be called independently in sequence, in addition to the existing combined `syncPushEntities` for backward compatibility with already-synced tenants.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate the full sync flow for a local-only tenant and assert that push operations happen in the correct order. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:

1. **Entity Push Before Tenant Sync**: Call `syncPushEntities` with pending members while tenant mode is "local" — observe that it either proceeds without a token check or uses a stale token (will fail on unfixed code)
2. **Cards Pushed With Members**: Call `syncPushEntities` with both pending members and cards — observe that cards are sent in the same batch as members without waiting for member confirmation (will fail on unfixed code)
3. **Token Not Propagated**: Call `syncToServer` then immediately call `syncPushEntities` — observe whether the token from tenant sync is available for the entity push (will fail on unfixed code)
4. **No Halt on Failure**: Simulate tenant sync failure then check if entity push is still attempted (may fail on unfixed code)

**Expected Counterexamples**:

- `syncPushEntities` sends cards alongside members in the same request payload
- Entity push proceeds even when tenant hasn't been confirmed on server
- Possible causes: no orchestration layer, combined member+card batching, token propagation timing

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := orchestratedSync_fixed(input)
  ASSERT result.pushOrder === ["tenant", "members", "cards", "transactions"]
  ASSERT result.eachStepAwaitedConfirmation === true
  ASSERT result.haltedOnFailure === true (if any step failed)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT syncPushEntities_original(input) = syncPushEntities_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many test cases automatically across the input domain (various tenant states, entity counts, token states)
- It catches edge cases that manual unit tests might miss (e.g., empty batches, single-entity batches, max-size batches)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs (synced tenants)

**Test Plan**: Observe behavior on UNFIXED code first for already-synced tenants pushing entities, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Synced Tenant Push Preservation**: Observe that synced tenants push entities directly without re-syncing, then verify this continues after fix
2. **Empty Push Preservation**: Observe that tenants with no pending entities skip the push cycle, then verify this continues after fix
3. **Device Blocked Preservation**: Observe that blocked devices abort immediately, then verify this continues after fix
4. **Batch Splitting Preservation**: Observe that large entity sets are split into batches of 200, then verify this continues after fix

### Unit Tests

- Test that `syncPushMembers` only pushes members (no cards)
- Test that `syncPushCards` only pushes cards (no members)
- Test that the orchestrator calls steps in order: tenant → members → cards → transactions
- Test that failure at any step halts subsequent steps
- Test that the access token from tenant sync is available for entity push
- Test edge cases: no pending members (skip to cards), no pending cards (skip to transactions)

### Property-Based Tests

- Generate random tenant configurations (local vs synced) and verify ordering is enforced only for local tenants
- Generate random entity sets (0 to 500 members, 0 to 500 cards) and verify batch splitting and ordering
- Generate random failure scenarios at each step and verify halt behavior
- Generate random token states and verify token propagation correctness

### Integration Tests

- Test full sync flow from local tenant creation through entity push to transaction push
- Test that SSE connection is only established after tenant confirmation
- Test conflict resolution flow followed by successful ordered sync
- Test network failure at each step and verify partial progress is preserved
