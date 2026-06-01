# Implementation Plan: Clean Architecture Migration

## Overview

Refactor the codebase to enforce Clean Architecture dependency rules via Dependency Inversion with parameter injection. Each step is atomic — tests pass at every commit. No observable behavior changes.

## Tasks

- [x] 1. Create repository interfaces in Domain layer
  - [x] 1.1 Create `src/core/interfaces/types.ts` with domain-owned data types (`CardRecord`, `UserRecord`, `UIDCheckResult`)
    - Define types that mirror existing DB schema shapes without coupling to Dexie
    - _Requirements: 2.5, 2.6_
  - [x] 1.2 Create `src/core/interfaces/CardRepository.ts`, `UserRepository.ts`, `UIDRemoteValidator.ts`, `OnlineStatusProvider.ts`
    - Each interface uses only domain-owned types from `types.ts`
    - Methods: `getByTenantAndCardId`, `filterByCardIdExcludingDeleted`, `updateStatus`, `put` (CardRepository); `getByTenantAndUserId` (UserRepository); `checkUIDExists` (UIDRemoteValidator); `isOnline` (OnlineStatusProvider)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 1.3 Create `src/core/interfaces/index.ts` barrel export
    - Re-export all interfaces and types from the interfaces directory
    - _Requirements: 1.3_
  - [x] 1.4 Write unit tests verifying interface files have zero outward imports (Property 9)
    - **Property 9: Repository interface purity**
    - **Validates: Requirements 2.5**

- [x] 2. Create gateway implementations
  - [x] 2.1 Create `src/lib/repositories/DexieCardRepository.ts`
    - Implement `CardRepository` interface backed by `localDb.cards`
    - Include `toCardRecord` mapping from Dexie schema to domain `CardRecord`
    - _Requirements: 3.1, 3.5, 3.6_
  - [x] 2.2 Create `src/lib/repositories/DexieUserRepository.ts`
    - Implement `UserRepository` interface backed by `localDb.users`
    - _Requirements: 3.2, 3.5_
  - [x] 2.3 Create `src/lib/repositories/ApiUIDRemoteValidator.ts`
    - Implement `UIDRemoteValidator` interface backed by `apiFetch`
    - _Requirements: 3.3, 3.5_
  - [x] 2.4 Create `src/lib/repositories/NavigatorOnlineStatusProvider.ts`
    - Implement `OnlineStatusProvider` interface backed by `navigator.onLine`
    - _Requirements: 3.4, 3.5_
  - [x] 2.5 Create `src/lib/repositories/index.ts` barrel with singleton instances
    - Export `cardRepo`, `userRepo`, `uidRemoteValidator`, `onlineStatus` singleton instances
    - _Requirements: 3.5_
  - [x] 2.6 Write unit tests for `DexieCardRepository` and `DexieUserRepository`
    - Verify delegation to Dexie and correct mapping to domain types
    - _Requirements: 3.6_

- [x] 3. Checkpoint — Verify additive-only changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Refactor `uidGlobalValidator.ts` to accept `deps` parameter
  - [x] 4.1 Refactor `validateUIDLocal` and `validateUID` in `src/core/validation/uidGlobalValidator.ts`
    - Add `deps: { cardRepo: CardRepository }` parameter to `validateUIDLocal`
    - Add `deps: { cardRepo: CardRepository; remoteValidator: UIDRemoteValidator; onlineStatus: OnlineStatusProvider }` parameter to `validateUID`
    - Refactor internal `checkLocalDB` helper to accept `CardRepository`
    - Remove `import { localDb }` and `import { apiFetch }` — replace with deps usage
    - Keep `normalizeUID` and `validateFormat` unchanged (pure functions)
    - _Requirements: 1.4, 1.5, 1.9, 6.4, 6.8_
  - [x] 4.2 Update call sites of `validateUID` / `validateUIDLocal`
    - Update `src/components/section/CardSection.tsx` to inject `{ cardRepo, remoteValidator: uidRemoteValidator, onlineStatus }` from `#/lib/repositories`
    - Update any test files to inject mock repositories
    - _Requirements: 6.1, 6.2, 6.4_
  - [x] 4.3 Write property test for `validateUID` behavioral equivalence
    - **Property 4: validateUID behavioral equivalence**
    - **Validates: Requirements 6.4, 6.8**

- [x] 5. Refactor `blockEnforcer.ts` to accept `deps` parameter
  - [x] 5.1 Refactor `checkBlocked`, `enforceOnCheckin`, `enforceOnCheckout`, `applyAdminBlock` in `src/core/validation/blockEnforcer.ts`
    - Add `deps: { cardRepo: CardRepository }` parameter to async functions
    - Remove `import { localDb }` — replace with `deps.cardRepo` usage
    - Keep `checkBlockedSync` unchanged (pure synchronous function)
    - Update `import type { Card }` to use `CardRecord` from `../interfaces/types`
    - _Requirements: 1.6, 1.9, 6.5_
  - [x] 5.2 Update call sites of `blockEnforcer` functions
    - Update `src/core/nfc/engine.ts` (calls `checkBlocked`) to pass `deps`
    - Update any hook/server modules that call `enforceOnCheckin`, `enforceOnCheckout`, `applyAdminBlock`
    - Update test files to inject mock `CardRepository`
    - _Requirements: 6.2, 6.5_
  - [x] 5.3 Write property test for `checkBlocked` behavioral equivalence
    - **Property 5: checkBlocked behavioral equivalence**
    - **Validates: Requirements 6.5**

- [x] 6. Refactor `printButtonValidator.ts` to accept `deps` parameter
  - [x] 6.1 Refactor `evaluatePrintEligibility` in `src/core/validation/printButtonValidator.ts`
    - Add `deps: { cardRepo: CardRepository }` parameter to async function
    - Remove `import { localDb }` — replace with `deps.cardRepo.getByTenantAndCardId`
    - Keep `evaluatePrintEligibilitySync` unchanged (pure synchronous function)
    - Update `Card` type reference to `CardRecord` from `../interfaces/types`
    - _Requirements: 1.7, 1.9, 6.6_
  - [x] 6.2 Update call sites of `evaluatePrintEligibility`
    - Update any hook that calls `evaluatePrintEligibility` to inject `{ cardRepo }` from `#/lib/repositories`
    - Update test files to inject mock `CardRepository`
    - _Requirements: 6.2, 6.6_
  - [x] 6.3 Write property test for `evaluatePrintEligibility` behavioral equivalence
    - **Property 6: evaluatePrintEligibility behavioral equivalence**
    - **Validates: Requirements 6.6, 6.8**

- [x] 7. Refactor `localStatusCheck.ts` to accept `deps` parameter
  - [x] 7.1 Refactor `checkLocalBlockedStatus` in `src/core/nfc/localStatusCheck.ts`
    - Add `deps: { cardRepo: CardRepository; userRepo: UserRepository }` parameter
    - Remove `import { localDb }` — replace with `deps.cardRepo` and `deps.userRepo` usage
    - _Requirements: 1.8, 6.7_
  - [x] 7.2 Update call sites of `checkLocalBlockedStatus`
    - Update `src/hooks/useBlockedCheck.ts` to inject `{ cardRepo, userRepo }` from `#/lib/repositories`
    - Update `src/components/section/CardSection.tsx` to inject deps
    - Update test files to inject mock repositories
    - _Requirements: 6.2, 6.7_
  - [x] 7.3 Write property test for `checkLocalBlockedStatus` behavioral equivalence
    - **Property 7: checkLocalBlockedStatus behavioral equivalence**
    - **Validates: Requirements 6.7**

- [x] 8. Checkpoint — Domain layer purified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Create hooks-layer re-exports
  - [x] 9.1 Create `src/hooks/types.ts` with domain type re-exports
    - Re-export `CardPayload`, `SessionGrant`, `LogEntry`, `CardState`, `CardStatus`, `TxType`, `MAGIC`, `CARD_SCHEMA_VERSION` from `#/core/payload/types`
    - Re-export `NfcPhase` from `#/core/nfc/stateMachine`
    - Re-export `CardClassification`, `RawNfcResult` from `#/core/nfc/types`
    - Re-export `BlockCheckResult` from `#/core/validation/blockEnforcer`
    - Re-export `PrintEligibility` from `#/core/validation/printButtonValidator`
    - Re-export `UIDValidationResult` from `#/core/validation/uidGlobalValidator`
    - Re-export `LocalStatusResult` from `#/core/nfc/localStatusCheck`
    - _Requirements: 4.3_
  - [x] 9.2 Create `src/hooks/domain.ts` with pure domain function re-exports
    - Re-export `applyDebit`, `applyCheckin`, `applyBlockStatus`, `applyTopup`, `applyResetState`, `isWriteEligible`, `validateTransition`, `validateCheckoutBalance`, `validateTopup`, `MAX_TOPUP_AMOUNT`, `MAX_BALANCE` from `#/core/state-machine/engine`
    - Re-export `readCard`, `isNfcSupported`, `extractCardBytes` from `#/core/nfc/engine`
    - Re-export `decodePayload` from `#/core/payload/engine`
    - Re-export `prepareWrite`, `decryptCardBody` from `#/core/nfc/pipelineEngine`
    - Re-export `encodeTenantBind` from `#/core/payload/tenantBind`
    - _Requirements: 4.4_

- [x] 10. Update UI components to import from hooks-layer re-exports
  - [x] 10.1 Update `src/components/section/TerminalSection.tsx`
    - Replace `import { CardState, CardStatus } from "#/core/payload/types"` → `from "#/hooks/types"`
    - Replace `import { applyBlockStatus, ... } from "#/core/state-machine/engine"` → `from "#/hooks/domain"`
    - Replace `import type { CardPayload } from "#/core/payload/types"` → `from "#/hooks/types"`
    - _Requirements: 4.1, 4.4_
  - [x] 10.2 Update `src/components/section/KioskSection.tsx`
    - Replace `import { applyDebit, isWriteEligible } from "#/core/state-machine/engine"` → `from "#/hooks/domain"`
    - Replace `import { CardStatus } from "#/core/payload/types"` → `from "#/hooks/types"`
    - _Requirements: 4.1, 4.4_
  - [x] 10.3 Update `src/components/section/GateSection.tsx`
    - Replace `import { validateTransition, applyCheckin, applyBlockStatus } from "#/core/state-machine/engine"` → `from "#/hooks/domain"`
    - Replace `import { CardState, CardStatus } from "#/core/payload/types"` → `from "#/hooks/types"`
    - Replace `import type { CardPayload } from "#/core/payload/types"` → `from "#/hooks/types"`
    - _Requirements: 4.1, 4.4_
  - [x] 10.4 Update `src/components/section/CardSection.tsx`
    - Replace all `#/core/state-machine/engine` imports → `from "#/hooks/domain"`
    - Replace all `#/core/payload/types` imports → `from "#/hooks/types"`
    - Replace `#/core/nfc/pipelineEngine`, `#/core/nfc/engine`, `#/core/payload/engine`, `#/core/payload/tenantBind` imports → `from "#/hooks/domain"`
    - Remove direct `#/core/nfc/localStatusCheck` and `#/core/validation/uidGlobalValidator` imports (already moved to hooks in steps 4.2 and 7.2)
    - _Requirements: 4.1, 4.4_
  - [x] 10.5 Update `src/components/section/IssuanceTestSection.tsx`
    - Replace `#/core/nfc/engine`, `#/core/payload/engine`, `#/core/nfc/pipelineEngine` imports → `from "#/hooks/domain"`
    - Replace `#/core/payload/types` imports → `from "#/hooks/types"`
    - _Requirements: 4.1, 4.4_
  - [x] 10.6 Update `src/components/block/TransactionList.tsx`
    - Replace `import type { LogEntry } from "#/core/payload/types"` → `from "#/hooks/types"`
    - Replace `import { TxType } from "#/core/payload/types"` → `from "#/hooks/types"`
    - _Requirements: 4.1_
  - [x] 10.7 Update `src/components/block/UnifiedNfcScanner/` components
    - Update `StepIndicator.tsx`: replace `#/core/nfc/stateMachine` → `#/hooks/types`
    - Update `UnifiedNfcScanner.tsx`: replace `#/core/nfc/*` and `#/core/payload/types` → `#/hooks/types`
    - Update `RawDataInspector.tsx`: replace `#/core/nfc/types` → `#/hooks/types`
    - Update `NfcTapArea.tsx`: replace `#/core/nfc/stateMachine` → `#/hooks/types`
    - Update `CardInfoDisplay.tsx`: replace `#/core/payload/types` and `#/core/nfc/types` → `#/hooks/types`
    - Update `ActionButtons.tsx`: replace `#/core/payload/types` and `#/core/nfc/*` → `#/hooks/types`
    - _Requirements: 4.1_
  - [x] 10.8 Update `src/components/block/dialogs/` components
    - Update `IssuanceScanDrawer.tsx`: replace `#/core/payload/types` and `#/core/nfc/stateMachine` → `#/hooks/types`
    - Update `IssueCardDrawer.tsx`: replace `#/core/payload/types` and `#/core/nfc/stateMachine` → `#/hooks/types`
    - Update `NfcScanDrawer.tsx`: replace any `#/core/*` imports → `#/hooks/types`
    - Update `TopupDrawer.tsx`: replace any `#/core/*` imports → `#/hooks/types` or `#/hooks/domain`
    - _Requirements: 4.1_
  - [x] 10.9 Update `src/routes/dev.nfc-test.tsx`
    - Replace `#/core/nfc/pipelineEngine` → `#/hooks/domain`
    - Replace `#/core/payload/engine` → `#/hooks/domain`
    - Replace `#/core/payload/types` → `#/hooks/types`
    - _Requirements: 4.1_

- [x] 11. Checkpoint — UI layer decoupled
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Add boundary enforcement script and CI integration
  - [x] 12.1 Create `scripts/check-boundaries.ts`
    - Implement regex-based import scanner that walks `src/` recursively
    - Define rules: Domain→Gateways forbidden, UI→Domain forbidden, UI→Gateways forbidden (except `#/lib/utils`)
    - Exempt test files (`__tests__`, `.test.`, `.spec.`)
    - Print clear violation messages: `VIOLATION: {file}:{line} — {rule} — imports "{importPath}"`
    - Exit code 1 on violations, 0 on clean
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 5.8_
  - [x] 12.2 Add `check:boundaries` script to `package.json` and CI workflow step
    - Add `"check:boundaries": "tsx scripts/check-boundaries.ts"` to package.json scripts
    - Add `boundary-check` job to `.github/workflows/ci-test.yml`
    - _Requirements: 5.6_
  - [x] 12.3 Write property test for boundary enforcement script correctness
    - **Property 8: Boundary enforcement script correctness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.8**
  - [x] 12.4 Write property tests for domain layer import isolation
    - **Property 1: Domain layer import isolation**
    - **Validates: Requirements 1.1, 5.1**
  - [x] 12.5 Write property test for UI layer domain isolation
    - **Property 2: UI layer domain isolation**
    - **Validates: Requirements 4.1, 5.2**
  - [x] 12.6 Write property test for UI layer gateway isolation
    - **Property 3: UI layer gateway isolation**
    - **Validates: Requirements 4.2, 5.3**

- [x] 13. Final checkpoint — Verify zero violations and all tests pass
  - Run `pnpm check:boundaries` and confirm zero violations
  - Run `pnpm test:coverage` and confirm all tests pass
  - Run `pnpm typecheck` and confirm no type errors
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation — the codebase compiles and tests pass at every step
- Property tests validate behavioral equivalence between pre- and post-migration implementations
- Steps 1–2 are purely additive (new files only, no existing code changes)
- Steps 4–7 each modify one domain file + its call sites atomically
- Steps 9–10 handle UI decoupling via re-exports
- Step 12 locks in the rules permanently via CI

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 4, "tasks": ["2.5", "2.6"] },
    { "id": 5, "tasks": ["4.1", "5.1", "6.1", "7.1"] },
    { "id": 6, "tasks": ["4.2", "4.3", "5.2", "5.3", "6.2", "6.3", "7.2", "7.3"] },
    { "id": 7, "tasks": ["9.1", "9.2"] },
    { "id": 8, "tasks": ["10.1", "10.2", "10.3", "10.5", "10.6", "10.7", "10.8", "10.9"] },
    { "id": 9, "tasks": ["10.4"] },
    { "id": 10, "tasks": ["12.1"] },
    { "id": 11, "tasks": ["12.2", "12.3", "12.4", "12.5", "12.6"] }
  ]
}
```
