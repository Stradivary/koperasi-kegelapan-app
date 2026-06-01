# Requirements Document

## Introduction

This specification defines the requirements for migrating the existing codebase to a strict Clean Architecture without changing any observable behavior. The migration eliminates dependency violations where the Domain layer (`src/core/`) imports from infrastructure/data layers (`src/db/`, `src/lib/`), and where the UI layer (`src/components/`) bypasses the Hooks/Controllers layer to access Domain and Infrastructure directly. The result is a codebase where dependencies only point inward, enforced by automated lint rules in CI.

## Glossary

- **Domain_Layer**: The innermost architectural layer (`src/core/`) containing pure business logic (crypto, state-machine, payload, validation). Has zero external dependencies.
- **Use_Cases_Layer**: The application orchestration layer (`src/server/`) that coordinates Domain logic and defines repository interfaces. Depends only on Domain_Layer.
- **Hooks_Layer**: The interface adapter layer (`src/hooks/`) that adapts Use_Cases_Layer for the UI framework. Depends on Use_Cases_Layer and Domain_Layer types.
- **Gateways_Layer**: The data access adapter layer (`src/db/`, `src/lib/`) that implements repository interfaces defined by Use_Cases_Layer. Depends on Use_Cases_Layer and Domain_Layer types.
- **UI_Layer**: The outermost presentation layer (`src/components/`, `src/routes/`) that renders views. Depends only on Hooks_Layer.
- **Repository_Interface**: A TypeScript interface defined in Domain_Layer or Use_Cases_Layer that abstracts data access operations, enabling dependency inversion.
- **Dependency_Rule**: The architectural constraint that source code dependencies only point inward — outer layers depend on inner layers, never the reverse.
- **Shared_Utility**: A pure function with no domain or infrastructure logic (e.g., `cn` from `src/lib/utils.ts`) that is exempt from layer boundary restrictions.
- **Boundary_Lint_Rule**: An ESLint/oxlint rule that statically enforces import restrictions between architectural layers in CI.

## Requirements

### Requirement 1: Domain Layer Purification

**User Story:** As a developer, I want the Domain layer to have zero outward dependencies, so that business logic remains portable, testable, and decoupled from infrastructure concerns.

#### Acceptance Criteria

1. THE Domain_Layer SHALL contain zero import statements referencing modules from Gateways_Layer (`#/db/*`, `#/lib/api`, `#/lib/formatters`, `#/lib/transactionLogService`).
2. WHEN a Domain_Layer module requires data access, THE Domain_Layer SHALL define a Repository_Interface that declares the required operations as an abstract contract.
3. THE Domain_Layer SHALL export all Repository_Interface definitions from a dedicated interfaces directory (`src/core/interfaces/`).
4. WHEN `src/core/validation/uidGlobalValidator.ts` requires card lookup, THE Domain_Layer SHALL accept a repository parameter implementing a `CardRepository` interface instead of importing `localDb` directly.
5. WHEN `src/core/validation/uidGlobalValidator.ts` requires network validation, THE Domain_Layer SHALL accept a gateway parameter implementing a `UIDRemoteValidator` interface instead of importing `apiFetch` directly.
6. WHEN `src/core/validation/blockEnforcer.ts` requires card record access, THE Domain_Layer SHALL accept a repository parameter implementing a `CardRepository` interface instead of importing `localDb` directly.
7. WHEN `src/core/validation/printButtonValidator.ts` requires card record access, THE Domain_Layer SHALL accept a repository parameter implementing a `CardRepository` interface instead of importing `localDb` directly.
8. WHEN `src/core/nfc/localStatusCheck.ts` requires card and user record access, THE Domain_Layer SHALL accept a repository parameter implementing `CardRepository` and `UserRepository` interfaces instead of importing `localDb` directly.
9. THE Domain_Layer SHALL retain all existing pure synchronous functions (`normalizeUID`, `validateFormat`, `evaluatePrintEligibilitySync`, `checkBlockedSync`) without modification to their signatures or behavior.

### Requirement 2: Repository Interface Definitions

**User Story:** As a developer, I want well-defined repository interfaces in the Domain layer, so that infrastructure implementations can be swapped without modifying business logic.

#### Acceptance Criteria

1. THE Domain_Layer SHALL define a `CardRepository` interface with methods for querying card records by tenant and card identifier.
2. THE Domain_Layer SHALL define a `UserRepository` interface with methods for querying user records by tenant and user identifier.
3. THE Domain_Layer SHALL define a `UIDRemoteValidator` interface with a method for checking UID existence across tenants via network.
4. THE Domain_Layer SHALL define an `OnlineStatusProvider` interface with a method for determining current network connectivity state.
5. THE Domain_Layer SHALL define all Repository_Interface types using only Domain_Layer types (no infrastructure types in interface signatures).
6. WHEN a Repository_Interface method returns data, THE Domain_Layer SHALL use Domain-owned type definitions for the return shape rather than re-exporting infrastructure types.

### Requirement 3: Gateway Layer Implementation

**User Story:** As a developer, I want the Gateways layer to implement repository interfaces, so that data access is properly encapsulated behind abstractions.

#### Acceptance Criteria

1. THE Gateways_Layer SHALL provide a concrete implementation of `CardRepository` backed by IndexedDB (`localDb.cards`).
2. THE Gateways_Layer SHALL provide a concrete implementation of `UserRepository` backed by IndexedDB (`localDb.users`).
3. THE Gateways_Layer SHALL provide a concrete implementation of `UIDRemoteValidator` backed by the existing `apiFetch` HTTP client.
4. THE Gateways_Layer SHALL provide a concrete implementation of `OnlineStatusProvider` backed by `navigator.onLine`.
5. WHEN a Gateways_Layer implementation is created, THE Gateways_Layer SHALL import the corresponding Repository_Interface from Domain_Layer and satisfy its contract.
6. THE Gateways_Layer SHALL preserve all existing query logic (compound key lookups, filter expressions, error handling) from the original Domain_Layer implementations.

### Requirement 4: UI Layer Decoupling

**User Story:** As a developer, I want UI components to access domain logic exclusively through the Hooks layer, so that presentation is decoupled from business rules and data access.

#### Acceptance Criteria

1. THE UI_Layer SHALL contain zero import statements referencing modules from Domain_Layer (`src/core/*`) except for type-only imports re-exported through Hooks_Layer.
2. THE UI_Layer SHALL contain zero import statements referencing modules from Gateways_Layer (`src/db/*`, `src/lib/api`, `src/lib/formatters`, `src/lib/transactionLogService`).
3. WHEN a UI component requires domain types (e.g., `CardPayload`, `NfcPhase`, `CardStatus`), THE Hooks_Layer SHALL re-export those types for UI_Layer consumption.
4. WHEN a UI component requires domain logic execution (e.g., `applyDebit`, `validateTransition`), THE Hooks_Layer SHALL expose that logic through hook functions or controller modules.
5. THE UI_Layer SHALL retain access to Shared_Utility imports (`cn` from `src/lib/utils.ts`) without restriction.
6. IF a UI_Layer module imports from a restricted layer, THEN THE Boundary_Lint_Rule SHALL report a lint error at build time.

### Requirement 5: Boundary Enforcement via Lint Rules

**User Story:** As a developer, I want automated lint rules enforcing architectural boundaries, so that future changes cannot accidentally introduce dependency violations.

#### Acceptance Criteria

1. THE Boundary_Lint_Rule SHALL prevent Domain_Layer modules from importing any module outside Domain_Layer.
2. THE Boundary_Lint_Rule SHALL prevent UI_Layer modules from importing Domain_Layer modules directly (type re-exports through Hooks_Layer are permitted).
3. THE Boundary_Lint_Rule SHALL prevent UI_Layer modules from importing Gateways_Layer modules (except Shared_Utility).
4. THE Boundary_Lint_Rule SHALL allow Hooks_Layer modules to import from Use_Cases_Layer and Domain_Layer.
5. THE Boundary_Lint_Rule SHALL allow Gateways_Layer modules to import from Use_Cases_Layer and Domain_Layer.
6. THE Boundary_Lint_Rule SHALL be integrated into the CI pipeline and block merges on violation.
7. THE Boundary_Lint_Rule SHALL provide a clear error message identifying the violating import and the architectural rule being broken.
8. WHERE the `cn` utility from `src/lib/utils.ts` is imported, THE Boundary_Lint_Rule SHALL exempt that specific import path from layer restrictions.

### Requirement 6: Behavioral Preservation

**User Story:** As a developer, I want the migration to produce zero observable behavior changes, so that existing functionality remains intact and users are unaffected.

#### Acceptance Criteria

1. THE System SHALL maintain identical function signatures for all public API surfaces after migration (same parameter types, same return types).
2. THE System SHALL pass all existing unit tests without modification to test assertions.
3. THE System SHALL pass all existing integration tests without modification to test assertions.
4. WHEN `validateUID` is called with the same inputs before and after migration, THE System SHALL produce identical `UIDValidationResult` outputs.
5. WHEN `checkBlocked` is called with the same inputs before and after migration, THE System SHALL produce identical `BlockCheckResult` outputs.
6. WHEN `evaluatePrintEligibility` is called with the same inputs before and after migration, THE System SHALL produce identical `PrintEligibility` outputs.
7. WHEN `checkLocalBlockedStatus` is called with the same inputs before and after migration, THE System SHALL produce identical `LocalStatusResult` outputs.
8. THE System SHALL preserve all error handling semantics (fail-closed behavior in UID validation, IndexedDB read failure handling in print validation).

### Requirement 7: Migration Execution Strategy

**User Story:** As a developer, I want the migration executed as atomic commits in a single PR, so that each step is independently verifiable and reversible.

#### Acceptance Criteria

1. THE System SHALL execute the migration as a single pull request with atomic commits per logical step.
2. WHEN a migration step is committed, THE System SHALL have all existing tests passing at that commit.
3. THE System SHALL introduce Repository_Interface definitions before modifying any consuming code.
4. THE System SHALL introduce Gateways_Layer implementations before removing direct imports from Domain_Layer.
5. THE System SHALL update call sites (hooks, server modules) to inject repository implementations before removing old import paths.
6. IF a migration step causes a test failure, THEN THE System SHALL revert that step and investigate before proceeding.
7. THE System SHALL not introduce new runtime dependencies or third-party packages as part of this migration.
