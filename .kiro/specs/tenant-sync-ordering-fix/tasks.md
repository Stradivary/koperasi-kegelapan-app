# Implementation Plan

## Overview

Fix the tenant sync push ordering to enforce a deterministic sequence: tenant → members → cards → transaction logs. The implementation follows the exploratory bugfix workflow: write tests to confirm the bug, write preservation tests to capture existing behavior, implement the fix, then validate everything passes.

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Push Ordering Enforcement
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to concrete failing cases:
    - Case 1: `syncPushEntities` is called with pending members while tenant mode is "local" (no tenant confirmed on server)
    - Case 2: Cards are pushed in the same batch as members without waiting for member confirmation
    - Case 3: Token from `syncToServer` is not propagated to subsequent entity push calls
  - **Bug Condition from design**: `isBugCondition(input)` where `input.tenantMode === "local" AND ((input.pushType === "entities" AND NOT input.tenantConfirmed) OR (input.pushType === "cards" AND NOT input.membersAccepted) OR (input.pushType === "transactions" AND NOT input.cardsAccepted))`
  - Test that calling `syncPushEntities` for a local-only tenant pushes members and cards together in a single payload (demonstrates lack of ordering)
  - Test that `useAdminTenantSync.handleSyncToServer` does not orchestrate entity push after tenant sync (demonstrates no sequence gate)
  - Test that `syncPushEntities` proceeds with a stale token when tenant hasn't been confirmed (demonstrates token propagation gap)
  - Run test on UNFIXED code - expect FAILURE (this confirms the bug exists)
  - Document counterexamples found (e.g., "syncPushEntities sends cards alongside members", "entity push proceeds without tenant confirmation")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.5_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Synced Tenant Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - **Observe on UNFIXED code**:
    - Observe: Already-synced tenants (mode === "synced") push entities directly using existing access token without re-syncing
    - Observe: Tenants with no pending entities skip the push cycle entirely (returns zero counts)
    - Observe: Device-blocked scenarios abort immediately with `DeviceBlockedError`
    - Observe: Large entity sets (>200) are split into batches with retry logic
    - Observe: `syncPushEntities` returns `{ membersAccepted: 0, membersRejected: 0, cardsAccepted: 0, cardsRejected: 0 }` when no access token exists
  - Write property-based tests:
    - For all synced tenants with pending entities, `syncPushEntities` pushes without calling tenant sync (from Preservation Requirements 3.1)
    - For all tenants with zero pending entities, push cycle is skipped without errors (from Preservation Requirements 3.3)
    - For all device-blocked states, sync aborts immediately with `DeviceBlockedError` (from Preservation Requirements 3.4)
    - For all entity sets exceeding MAX_BATCH_SIZE (200), batches are split correctly (from Preservation Requirements 3.6)
    - For all tenants without access token, push is skipped gracefully (from Preservation Requirements 3.1)
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 3. Fix for push ordering enforcement during tenant sync
  - [ ] 3.1 Split `syncPushEntities` into separate `syncPushMembers` and `syncPushCards` functions
    - Create new exported function `syncPushMembers(tenantId: string): Promise<{ membersAccepted: number; membersRejected: number }>` that only pushes pending members
    - Create new exported function `syncPushCards(tenantId: string): Promise<{ cardsAccepted: number; cardsRejected: number }>` that only pushes pending cards
    - Keep existing `syncPushEntities` function intact for backward compatibility with already-synced tenants
    - Both new functions must respect device-blocked checks, access token checks, batch size limits, and retry logic
    - _Bug_Condition: isBugCondition(input) where input.pushType === "cards" AND NOT input.membersAccepted_
    - _Expected_Behavior: Members are pushed and confirmed before cards are pushed separately_
    - _Preservation: Existing `syncPushEntities` remains unchanged for synced tenants (Requirements 3.1, 3.6)_
    - _Requirements: 2.2, 2.3, 3.1, 3.6_

  - [ ] 3.2 Modify `useTenantSync.ts` to return the access token from `syncToServer`
    - Change `syncToServer` return type from `Promise<void>` to `Promise<{ accessToken: string | null }>` (or a result object)
    - Return the access token received from the server after successful tenant sync (201/200 response)
    - Ensure `setAccessToken` is still called internally for global state
    - Update `UseTenantSyncReturn` interface to reflect new return type
    - _Bug_Condition: isBugCondition(input) where token is not propagated to subsequent push calls_
    - _Expected_Behavior: Access token from tenant sync is returned and immediately available for entity push (Requirement 2.6)_
    - _Preservation: Existing conflict handling, error states, and retry logic remain unchanged (Requirements 3.5, 3.7)_
    - _Requirements: 2.6, 1.5_

  - [ ] 3.3 Add orchestration in `useAdminTenantSync.ts` to call steps sequentially with halt-on-failure
    - Modify `handleSyncToServer` to orchestrate the full push sequence after tenant sync succeeds
    - Sequence: `syncToServer` → `syncPushMembers` → `syncPushCards` → transaction push (if applicable)
    - Use the returned access token from `syncToServer` to confirm token availability before entity push
    - Add halt-on-failure: if any step throws or returns an error, stop the sequence and surface the error
    - Add progress tracking state for each step (optional: "syncing-tenant" | "pushing-members" | "pushing-cards" | "pushing-transactions" | "complete")
    - Only execute the full sequence for local-only tenants (mode === "local"); synced tenants continue to use existing behavior
    - _Bug_Condition: isBugCondition(input) where input.tenantMode === "local" AND NOT input.tenantConfirmed_
    - _Expected_Behavior: Push operations execute in strict order: tenant → members → cards → transactions, halting on failure (Requirements 2.1, 2.2, 2.3, 2.4, 2.7)_
    - _Preservation: Already-synced tenants and server-selected tenants are unaffected (Requirements 3.1, 3.2)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 3.1, 3.2_

  - [ ] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Push Ordering Enforcement
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (strict sequential ordering)
    - When this test passes, it confirms:
      - Tenant is synced before entities are pushed
      - Members are pushed before cards
      - Cards are pushed before transactions
      - Sequence halts on failure
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7_

  - [ ] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Synced Tenant Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix:
      - Synced tenants push entities directly without re-syncing
      - Empty push cycles are skipped
      - Device-blocked scenarios abort immediately
      - Batch splitting still works correctly
      - No access token still skips gracefully
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to confirm no regressions
  - Verify bug condition exploration test passes (Property 1)
  - Verify preservation property tests pass (Property 2)
  - Verify existing unit tests in the project still pass
  - Ensure all tests pass, ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [["1", "2"], ["3.1", "3.2"], ["3.3"], ["3.4", "3.5"], ["4"]]
}
```

## Notes

- Tasks 1 and 2 are independent and can be worked on in parallel
- Task 1 (exploration test) MUST fail on unfixed code — this is expected and confirms the bug
- Task 2 (preservation test) MUST pass on unfixed code — this captures baseline behavior
- Tasks 3.1 and 3.2 are independent implementation steps that feed into 3.3 (orchestration)
- The existing `syncPushEntities` function is preserved for backward compatibility with synced tenants
- Files to modify: `src/lib/syncPushEntities.ts`, `src/hooks/useAdminTenantSync.ts`, `src/hooks/useTenantSync.ts`
