# Implementation Plan: UI→Gateways Boundary Isolation

## Overview

Resolve all 38 UI→Gateways boundary violations using two strategies: (1) relocate pure utility modules to `src/lib/utils/` where they are exempt from the boundary rule, and (2) create hooks-layer re-export modules for data-fetching/I/O gateway modules. The `smartRelocate` tool handles automatic import updates for relocated files. Remaining UI imports that reference data-fetching gateways are manually updated to point at hooks-layer re-exports.

## Tasks

- [x] 1. Relocate pure utility files and create gateway re-export modules
  - [x] 1.1 Move `src/lib/formatters.ts` → `src/lib/utils/formatters.ts`
    - Use `smartRelocate` to move the file; all consumers get imports auto-updated to `#/lib/utils/formatters`
    - _Requirements: 1.1, 1.5, 11.2_

  - [x] 1.2 Move `src/lib/brand.ts` → `src/lib/utils/brand.ts`
    - Use `smartRelocate` to move the file; all consumers get imports auto-updated to `#/lib/utils/brand`
    - _Requirements: 1.2, 1.5, 11.2_

  - [x] 1.3 Move `src/lib/haptics.ts` → `src/lib/utils/haptics.ts`
    - Use `smartRelocate` to move the file; all consumers get imports auto-updated to `#/lib/utils/haptics`
    - _Requirements: 1.3, 1.5, 11.2_

  - [x] 1.4 Move `src/lib/slugValidation.ts` → `src/lib/utils/slugValidation.ts`
    - Use `smartRelocate` to move the file; all consumers get imports auto-updated to `#/lib/utils/slugValidation`
    - _Requirements: 1.4, 1.5, 11.2_

  - [x] 1.5 Create `src/hooks/useStationData.ts` with station query re-exports
    - Re-export `getCardsWithUsers`, `getUserRows` from `#/lib/stationQueries`
    - Re-export types `StationCardRow`, `StationUserRow`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 1.6 Create `src/hooks/useTransactionLog.ts` with transaction log re-exports
    - Re-export `getTransactions`, `recordTransaction` from `#/lib/transactionLogService`
    - Re-export types `TransactionQuery`, `PaginatedTransactions`, `TransactionInput`
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 1.7 Create `src/hooks/useIndexedDbStores.ts` with lazy store re-exports
    - Re-export `getTenantContextStore`, `getCardSnapshotStore`, `getWriteJournalStore`, `getPolicyCacheStore`, `getReconciliationOutbox`, `getLocalTenantConfigStore`, `getLocalAccountStore`, `getSessionGrantCacheStore`, `getAuthTokenCacheStore`, `getMakeIdempotencyKey`, `getIndexedDb` from `#/lib/indexeddb.lazy`
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 1.8 Extend `src/hooks/types.ts` with gateway type re-exports
    - Add type re-exports for `TenantContext`, `LocalTenantConfig`, `LocalAccount` from `#/lib/indexeddb`
    - Add type re-exports for `TransactionLog`, `Card`, `User` from `#/db/local-db`
    - Add type re-exports for `TransactionQuery`, `PaginatedTransactions`, `TransactionInput` from `#/lib/transactionLogService`
    - Add type re-exports for `StationCardRow`, `StationUserRow` from `#/lib/stationQueries`
    - Add type re-exports for `ErrorEvent` from `#/lib/errorTracker`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 1.9 Create `src/hooks/useApi.ts` with API gateway re-exports
    - Re-export `apiFetch`, `API_BASE_URL`, `getAccessToken`, `DeviceBlockedError` from `#/lib/api`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 1.10 Create `src/hooks/useSyncPull.ts` with sync pull re-export
    - Re-export `syncPull` from `#/lib/syncPull`
    - Re-export type `SyncPullResult` from `#/lib/syncPull`
    - _Requirements: 8.1_

  - [x] 1.11 Create `src/hooks/usePeerSync.ts` with peer sync coordinator re-exports
    - Re-export `notifyCheckin`, `verifyCheckinSynced`, `forcePushBeforeRead`, `setActiveTenantId`, `registerTriggerSync`, `peerSyncCoordinator` from `#/lib/peerSyncCoordinator`
    - Re-export types `PeerSyncStatus`, `PeerSyncCoordinator` from `#/lib/peerSyncCoordinator`
    - _Requirements: 8.2, 8.3_

  - [x] 1.12 Create `src/hooks/useErrorTracker.ts` with error tracker re-export
    - Re-export `trackError` from `#/lib/errorTracker`
    - Re-export type `ErrorEvent` from `#/lib/errorTracker`
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 1.13 Create `src/hooks/useLocalDb.ts` with local database re-exports
    - Re-export `localDb` from `#/db/local-db`
    - Re-export types `Card`, `User`, `TransactionLog` from `#/db/local-db`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 1.14 Create `src/hooks/useRepositories.ts` with repository re-exports
    - Re-export `cardRepo`, `userRepo`, `uidRemoteValidator`, `onlineStatus` from `#/lib/repositories`
    - _Requirements: 10.1, 10.2_

- [x] 2. Update remaining UI component imports (data-fetching gateways)
  - [x] 2.1 Update `CardSection.tsx` gateway imports
    - Replace `#/db/local-db` with `#/hooks/useLocalDb`
    - Replace `#/lib/syncPull` with `#/hooks/useSyncPull`
    - Replace `#/lib/repositories` with `#/hooks/useRepositories`
    - Replace `#/lib/errorTracker` with `#/hooks/useErrorTracker`
    - Replace `#/lib/stationQueries` with `#/hooks/useStationData`
    - _Requirements: 11.3, 11.4_

  - [x] 2.2 Update `StationCardsPanel.tsx` to import types from `#/hooks/useStationData`
    - Replace type import from `#/lib/stationQueries` with `#/hooks/useStationData`
    - _Requirements: 2.4, 11.3_

  - [x] 2.3 Update `TransactionsSection.tsx` gateway imports
    - Replace `#/lib/transactionLogService` with `#/hooks/useTransactionLog`
    - Replace `#/lib/indexeddb.lazy` with `#/hooks/useIndexedDbStores`
    - Replace `#/db/local-db` type import with `#/hooks/types`
    - _Requirements: 3.1, 4.1, 11.3_

  - [x] 2.4 Update `DevicesSection.tsx` gateway imports
    - Replace `#/lib/indexeddb` type import with `#/hooks/types`
    - Replace `#/lib/indexeddb.lazy` with `#/hooks/useIndexedDbStores`
    - Replace `#/lib/api` with `#/hooks/useApi`
    - _Requirements: 4.1, 5.3, 7.1, 11.3_

  - [x] 2.5 Update `SettingsSection.tsx` gateway imports
    - Replace `#/db/local-db` with `#/hooks/useLocalDb`
    - Replace `#/lib/api` with `#/hooks/useApi`
    - Replace `#/lib/indexeddb` type import with `#/hooks/types`
    - Replace `#/lib/indexeddb.lazy` with `#/hooks/useIndexedDbStores`
    - _Requirements: 5.3, 6.1, 7.1, 11.3_

  - [x] 2.6 Update `AdminLayout.tsx` to import `getTenantContextStore` from `#/hooks/useIndexedDbStores`
    - Replace `#/lib/indexeddb.lazy` with `#/hooks/useIndexedDbStores`
    - _Requirements: 4.1, 11.3_

  - [x] 2.7 Update `KioskLayout.tsx` to import `getTenantContextStore` from `#/hooks/useIndexedDbStores`
    - Replace `#/lib/indexeddb.lazy` with `#/hooks/useIndexedDbStores`
    - _Requirements: 4.1, 11.3_

  - [x] 2.8 Update `ScoutBrowsePanel.tsx` to import `LocalTenantConfig` type from `#/hooks/types`
    - Replace type import from `#/lib/indexeddb` with `#/hooks/types`
    - _Requirements: 5.3, 11.3_

  - [x] 2.9 Update `GateSection.tsx` to import `notifyCheckin` from `#/hooks/usePeerSync`
    - Replace import from `#/lib/peerSyncCoordinator` with `#/hooks/usePeerSync`
    - _Requirements: 8.2, 11.3_

  - [x] 2.10 Update `IssuanceTestSection.tsx` to import `API_BASE_URL` from `#/hooks/useApi`
    - Replace import from `#/lib/api` with `#/hooks/useApi`
    - _Requirements: 7.1, 11.3_

  - [x] 2.11 Update `KioskSection.tsx` to import `localDb` from `#/hooks/useLocalDb`
    - Replace import from `#/db/local-db` with `#/hooks/useLocalDb`
    - _Requirements: 6.1, 11.3_

  - [x] 2.12 Update `MemberSection.tsx` to import `localDb`, `User` from `#/hooks/useLocalDb`
    - Replace import from `#/db/local-db` with `#/hooks/useLocalDb`
    - _Requirements: 6.1, 6.3, 11.3_

  - [x] 2.13 Update `SuperadminSection.tsx` to import `API_BASE_URL` from `#/hooks/useApi`
    - Replace import from `#/lib/api` with `#/hooks/useApi`
    - _Requirements: 7.1, 11.3_

  - [x] 2.14 Update `dev.nfc-test.tsx` to import `API_BASE_URL` from `#/hooks/useApi`
    - Replace import from `#/lib/api` with `#/hooks/useApi`
    - _Requirements: 7.1, 11.3_

  - [x] 2.15 Update `tenant.$tenantId.tsx` to import `getTenantContextStore` from `#/hooks/useIndexedDbStores`
    - Replace import from `#/lib/indexeddb.lazy` with `#/hooks/useIndexedDbStores`
    - _Requirements: 4.1, 11.3_

- [ ] 3. Final verification
  - [-] 3.1 Verify zero violations and type correctness
    - Run `pnpm tsc --noEmit` to verify zero type errors
    - Run `pnpm check:boundaries` to verify zero boundary violations
    - Run `pnpm vitest --run src/__tests__/architecture/ui-domain-isolation.test.ts` to verify the architecture test passes
    - _Requirements: 11.1, 12.4, 13.2, 13.3_

  - [ ]\* 3.2 Write property test for re-export behavioral equivalence
    - **Property 1: Re-export behavioral equivalence**
    - Verify that calling pure utility functions via `#/lib/utils/formatters` produces identical results to the original module reference
    - **Validates: Requirements 1.5, 12.1**

  - [ ]\* 3.3 Write property test for slug validation round-trip consistency
    - **Property 4: Slug validation round-trip consistency**
    - Verify that `createSlug(input)` via `#/lib/utils/slugValidation` produces a slug consistent with `validateSlugFormat` expectations
    - **Validates: Requirements 1.4, 1.5**

  - [-] 3.4 Run full test suite to confirm behavioral equivalence
    - Run `pnpm vitest --run` to verify all existing tests pass without assertion changes
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 12.4, 13.1, 13.2_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Pure utility files (formatters, brand, haptics, slugValidation) are moved to `src/lib/utils/` — the boundary regex `/["']#\/lib\/(?!utils)/` exempts `#/lib/utils` imports naturally
- `smartRelocate` automatically updates ALL import paths across the codebase for relocated files, so no manual UI import updates are needed for pure utilities
- Data-fetching modules (stationQueries, transactionLogService, indexeddb.lazy, local-db, api, syncPull, peerSyncCoordinator, errorTracker, repositories) go through hooks-layer re-exports because they perform I/O
- The existing `ui-domain-isolation.test.ts` serves as the definitive acceptance test (Property 3)

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": [
        "1.1",
        "1.2",
        "1.3",
        "1.4",
        "1.5",
        "1.6",
        "1.7",
        "1.8",
        "1.9",
        "1.10",
        "1.11",
        "1.12",
        "1.13",
        "1.14"
      ]
    },
    {
      "id": 1,
      "tasks": [
        "2.1",
        "2.2",
        "2.3",
        "2.4",
        "2.5",
        "2.6",
        "2.7",
        "2.8",
        "2.9",
        "2.10",
        "2.11",
        "2.12",
        "2.13",
        "2.14",
        "2.15"
      ]
    },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4"] }
  ]
}
```
