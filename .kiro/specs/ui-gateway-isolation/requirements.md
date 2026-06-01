# Requirements Document

## Introduction

This specification defines the requirements for resolving all 38 UI→Gateways boundary violations detected by `pnpm check:boundaries`. The UI layer (`src/components/`, `src/routes/`) currently imports directly from gateway modules (`src/lib/`, `src/db/`) in violation of the Clean Architecture dependency rule. The resolution strategy uses two approaches: (1) extending the existing `src/hooks/domain.ts` re-export barrel with pure utility re-exports, and (2) wrapping data-fetching gateway modules in custom React hooks that encapsulate infrastructure access. All 38 violations are resolved in a single batch with zero observable behavior changes.

## Glossary

- **UI_Layer**: Source files within `src/components/` and `src/routes/` directories (excluding test files)
- **Gateways_Layer**: Source files within `src/lib/` (except `src/lib/utils`) and `src/db/` directories
- **Hooks_Layer**: Source files within `src/hooks/` that serve as the interface adapter between UI and infrastructure
- **Boundary_Checker**: The `scripts/check-boundaries.ts` static analysis script invoked via `pnpm check:boundaries`
- **Re_Export_Barrel**: The `src/hooks/domain.ts` module that re-exports pure domain and utility functions for UI consumption
- **Gateway_Hook**: A custom React hook in `src/hooks/` that encapsulates access to a gateway module and exposes its functionality to UI components
- **Pure_Utility**: A module containing only pure functions or constant values with no side effects and no infrastructure dependencies (formatters, brand, haptics, slugValidation)
- **Data_Fetching_Module**: A module that performs IndexedDB queries, network requests, or other I/O operations (stationQueries, transactionLogService, indexeddb.lazy, local-db, api, syncPull, peerSyncCoordinator, errorTracker)

## Requirements

### Requirement 1: Pure Utility Re-exports

**User Story:** As a developer, I want pure utility modules accessible through the hooks layer re-export barrel, so that UI components can use formatters, brand constants, haptics, and slug validation without importing directly from the gateways layer.

#### Acceptance Criteria

1. WHEN a UI_Layer file requires formatting functions, THE Re_Export_Barrel SHALL export `formatTime` and `formatDuration` from `#/lib/formatters`
2. WHEN a UI_Layer file requires brand constants, THE Re_Export_Barrel SHALL export `BRAND`, `BRAND_FONTS`, and `SIGNAL_COLORS` from `#/lib/brand`
3. WHEN a UI_Layer file requires haptic feedback, THE Re_Export_Barrel SHALL export `triggerHaptic` from `#/lib/haptics`
4. WHEN a UI_Layer file requires slug utilities, THE Re_Export_Barrel SHALL export `createSlug`, `validateSlugFormat`, `SLUG_MIN_LENGTH`, and `SLUG_MAX_LENGTH` from `#/lib/slugValidation`
5. THE Re_Export_Barrel SHALL preserve the original function signatures and return types for all re-exported utilities

### Requirement 2: Station Data Gateway Hook

**User Story:** As a developer, I want a custom hook that encapsulates station card and user queries, so that UI components can access station data without importing directly from `#/lib/stationQueries`.

#### Acceptance Criteria

1. THE Hooks_Layer SHALL provide a `useStationCards` hook that wraps `getCardsWithUsers` from `#/lib/stationQueries`
2. THE Hooks_Layer SHALL provide a `useStationUsers` hook (or combined hook) that wraps `getUserRows` from `#/lib/stationQueries`
3. WHEN a UI_Layer component calls the station data hook, THE Gateway_Hook SHALL return the same data shape as the original `getCardsWithUsers` and `getUserRows` functions
4. THE Gateway_Hook SHALL re-export the `StationCardRow` and `StationUserRow` types for UI consumption

### Requirement 3: Transaction Log Gateway Hook

**User Story:** As a developer, I want a custom hook that encapsulates transaction log operations, so that UI components can query and record transactions without importing directly from `#/lib/transactionLogService`.

#### Acceptance Criteria

1. THE Hooks_Layer SHALL provide a `useTransactionLog` hook that wraps `getTransactions` and `recordTransaction` from `#/lib/transactionLogService`
2. WHEN a UI_Layer component calls the transaction log hook, THE Gateway_Hook SHALL return the same data shape as the original `getTransactions` function
3. THE Gateway_Hook SHALL re-export the `TransactionQuery`, `PaginatedTransactions`, and `TransactionInput` types for UI consumption

### Requirement 4: IndexedDB Lazy Store Gateway Hook

**User Story:** As a developer, I want a custom hook that encapsulates lazy-loaded IndexedDB store access, so that UI components can use tenant context, card snapshots, and other stores without importing directly from `#/lib/indexeddb.lazy`.

#### Acceptance Criteria

1. THE Hooks_Layer SHALL provide a `useIndexedDbStores` hook (or multiple focused hooks) that wraps the store accessors from `#/lib/indexeddb.lazy`
2. WHEN a UI_Layer component requires a specific IndexedDB store, THE Gateway_Hook SHALL expose the corresponding accessor function
3. THE Gateway_Hook SHALL preserve the lazy-loading behavior of the original `indexeddb.lazy` module

### Requirement 5: IndexedDB Direct Access Gateway Hook

**User Story:** As a developer, I want a custom hook that encapsulates direct IndexedDB store access, so that UI components can use tenant context and account stores without importing directly from `#/lib/indexeddb`.

#### Acceptance Criteria

1. THE Hooks_Layer SHALL provide hook access to `tenantContextStore` and `localAccountStore` functionality from `#/lib/indexeddb`
2. WHEN a UI_Layer component requires IndexedDB store operations, THE Gateway_Hook SHALL expose the store methods through a hook interface
3. THE Gateway_Hook SHALL re-export relevant IndexedDB types (`TenantContext`, `LocalTenantConfig`, `LocalAccount`) for UI consumption

### Requirement 6: Local Database Gateway Hook

**User Story:** As a developer, I want a custom hook that encapsulates Dexie local database access, so that UI components can query cards, users, and transactions without importing directly from `#/db/local-db`.

#### Acceptance Criteria

1. THE Hooks_Layer SHALL provide hook access to `localDb` table queries currently used by UI_Layer components
2. WHEN a UI_Layer component requires direct database table access, THE Gateway_Hook SHALL expose the query functionality through a hook interface
3. THE Gateway_Hook SHALL re-export the `TransactionLog` type and other database types needed by UI_Layer components

### Requirement 7: API Module Gateway Hook

**User Story:** As a developer, I want a custom hook that encapsulates HTTP API access, so that UI components can make authenticated API calls without importing directly from `#/lib/api`.

#### Acceptance Criteria

1. THE Hooks_Layer SHALL provide a `useApi` hook (or equivalent) that wraps `apiFetch` and `API_BASE_URL` from `#/lib/api`
2. WHEN a UI_Layer component requires an authenticated API call, THE Gateway_Hook SHALL expose the `apiFetch` function and base URL through a hook interface
3. THE Gateway_Hook SHALL re-export the `DeviceBlockedError` class for UI error handling

### Requirement 8: Sync and Coordination Gateway Hooks

**User Story:** As a developer, I want custom hooks that encapsulate sync pull and peer sync coordination, so that UI components can trigger sync operations without importing directly from gateway modules.

#### Acceptance Criteria

1. THE Hooks_Layer SHALL provide hook access to `syncPull` functionality from `#/lib/syncPull`
2. THE Hooks_Layer SHALL provide hook access to `PeerSyncCoordinator` functionality from `#/lib/peerSyncCoordinator`
3. WHEN a UI_Layer component triggers a sync operation, THE Gateway_Hook SHALL delegate to the underlying gateway module

### Requirement 9: Error Tracker Gateway Hook

**User Story:** As a developer, I want a custom hook that encapsulates error tracking, so that UI components can report errors without importing directly from `#/lib/errorTracker`.

#### Acceptance Criteria

1. THE Hooks_Layer SHALL provide hook access to `trackError` from `#/lib/errorTracker`
2. WHEN a UI_Layer component reports an error, THE Gateway_Hook SHALL delegate to the underlying `trackError` function
3. THE Gateway_Hook SHALL re-export the `ErrorEvent` type for UI consumption

### Requirement 10: Repository Re-export Compliance

**User Story:** As a developer, I want the existing `#/lib/repositories` import in UI components resolved, so that all gateway access goes through the hooks layer.

#### Acceptance Criteria

1. WHEN a UI_Layer component requires repository access, THE Hooks_Layer SHALL provide the repository instances through a hook or re-export
2. THE Hooks_Layer SHALL ensure UI_Layer components do not import directly from `#/lib/repositories`

### Requirement 11: UI Component Import Migration

**User Story:** As a developer, I want all 38 UI→Gateways violations resolved by updating import statements in UI components, so that the boundary checker reports zero violations.

#### Acceptance Criteria

1. WHEN the Boundary_Checker scans all UI_Layer files, THE Boundary_Checker SHALL report zero violations for the "UI must not import from Gateways (except utils)" rule
2. THE UI_Layer components SHALL import pure utilities from the Re_Export_Barrel instead of from `#/lib/formatters`, `#/lib/brand`, `#/lib/haptics`, or `#/lib/slugValidation`
3. THE UI_Layer components SHALL import data-fetching functionality from Gateway_Hooks instead of from `#/lib/stationQueries`, `#/lib/transactionLogService`, `#/lib/indexeddb.lazy`, `#/lib/indexeddb`, `#/db/local-db`, `#/lib/api`, `#/lib/syncPull`, `#/lib/peerSyncCoordinator`, or `#/lib/errorTracker`
4. THE UI_Layer components SHALL import repository access from the Hooks_Layer instead of from `#/lib/repositories`

### Requirement 12: Behavioral Equivalence

**User Story:** As a developer, I want the migration to produce zero observable behavior changes, so that all existing functionality continues to work identically after the refactoring.

#### Acceptance Criteria

1. THE migrated UI_Layer components SHALL produce identical rendered output for all input states
2. THE migrated UI_Layer components SHALL trigger identical side effects (API calls, IndexedDB writes, haptic feedback) for all user interactions
3. THE Gateway_Hooks SHALL propagate errors identically to the original direct imports
4. WHEN the existing test suite runs after migration, THE test suite SHALL pass without assertion changes

### Requirement 13: Single Batch Migration

**User Story:** As a developer, I want all 38 violations resolved in a single batch, so that there are no intermediate partially-migrated states in the codebase.

#### Acceptance Criteria

1. THE migration SHALL resolve all 38 UI→Gateways violations in a single commit-ready changeset
2. WHEN `pnpm check:boundaries` runs after the migration, THE Boundary_Checker SHALL report exactly zero total violations (down from 38)
3. IF any new Gateway_Hook introduces a TypeScript compilation error, THEN THE migration SHALL not be considered complete until all type errors are resolved
