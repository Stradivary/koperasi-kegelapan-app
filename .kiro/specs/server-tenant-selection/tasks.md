# Implementation Plan: Server Tenant Selection

## Overview

Implement server-mode tenant selection with three main flows: (1) server tenant search & selection UI with debounced search, (2) password-based authentication against a server tenant, and (3) sync conflict detection when pushing local tenants to the server. The implementation uses TanStack Router file-based API routes, Drizzle ORM with Cloudflare D1, and React hooks for client-side state management.

## Tasks

- [x] 1. Implement Server Tenant Search API
  - [x] 1.1 Create the `/api/tenants/search` route handler
    - Create `src/routes/api/tenants/search.ts` with GET handler
    - Validate query parameter (min 2 chars, max 100 chars)
    - Validate limit parameter (1-50, default 10, must be valid integer)
    - Query D1 database for active tenants matching name OR slug (case-insensitive LIKE)
    - Return results ordered alphabetically by tenant name
    - Return `{ tenants: TenantSearchResult[], total: number }`
    - Return 400 for invalid query length or invalid limit
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.2 Create the `searchServerTenants` server function
    - Create `src/server/tenantSearch.ts` with the search logic
    - Use Drizzle ORM to query tenants table with LIKE matching on name and slug
    - Filter by `status = "active"` only
    - Apply limit and alphabetical ordering
    - _Requirements: 1.1, 1.4, 1.6_

  - [ ]\* 1.3 Write property tests for search correctness
    - **Property 1: Search Correctness** — verify results only contain active tenants matching query, never exceeding limit
    - **Property 2: Short Query Rejection** — verify queries < 2 chars return 400
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

- [x] 2. Implement Tenant Sync API with Conflict Detection
  - [x] 2.1 Create sync request validation logic
    - Create `src/server/tenantSync.ts` with validation functions
    - Validate slug: 3-50 chars, lowercase alphanumeric + hyphens, no consecutive hyphens, must start/end with letter or digit
    - Validate name: 2-100 chars, at least one non-whitespace character
    - Validate timezone: valid IANA timezone string
    - Validate adminUsername: 3-50 chars, lowercase letters/digits/underscores/hyphens, no spaces
    - Validate adminPasswordHash: format `iterations:saltHex:hashHex` with correct lengths
    - Return array of validation errors with field name and message
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 2.2 Implement sync conflict detection and tenant creation logic
    - Add `processTenantSync` function to `src/server/tenantSync.ts`
    - Check slug uniqueness (case-insensitive) in tenants table
    - Check admin username uniqueness (case-insensitive) in accounts table
    - Determine conflict type: "slug_and_admin", "slug_only", or "admin_only"
    - On conflict: return 409 with conflictType, existingTenantName, existingSlug
    - On no conflict: create tenant + admin account in a single transaction
    - Ensure atomicity — no partial writes on conflict or transaction failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 10.1, 10.2, 10.3, 10.4_

  - [x] 2.3 Create the `/api/tenants/sync` route handler
    - Create `src/routes/api/tenants/sync.ts` with POST handler
    - Parse and validate request body using validation from 2.1
    - Call `processTenantSync` from 2.2
    - Return 201 on success, 409 on conflict, 400 on validation failure
    - Handle database unique constraint violations as 409 (race condition)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.6, 10.1, 10.2_

  - [ ]\* 2.4 Write property tests for conflict detection
    - **Property 4: Conflict Type Correctness** — verify correct conflictType for all combinations of slug/admin existence
    - **Property 5: No Partial Writes on Conflict** — verify DB state unchanged after conflict
    - **Property 6: Sync Request Validation** — verify invalid fields produce 400 errors
    - **Property 8: Conflict Detection Soundness** — verify success implies no prior slug/admin existed
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5**

- [x] 3. Checkpoint - Ensure all server-side tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Client-Side Search Hook
  - [x] 4.1 Create the `useServerTenantSearch` hook
    - Create `src/hooks/useServerTenantSearch.ts`
    - Implement debounced search with 300ms delay
    - Skip API call for queries shorter than 2 characters (set results to empty, loading to false)
    - Implement client-side caching with Map ref
    - Cancel pending debounce on new input
    - Expose `{ query, setQuery, results, loading, error }` state
    - Handle network errors with user-facing message
    - Initialize with loading=false, error=null, results=[]
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]\* 4.2 Write property tests for debounced search hook
    - **Property 2: Short Query Rejection** — verify hook does not call API for queries < 2 chars
    - **Property 3: Cache Consistency** — verify same query returns cached result without API call
    - **Validates: Requirements 2.2, 2.3**

- [x] 5. Implement Client-Side Sync Hook
  - [x] 5.1 Create the `useTenantSync` hook
    - Create `src/hooks/useTenantSync.ts`
    - Manage SyncStatus state (idle, syncing, success, conflict, error)
    - Implement `syncToServer` function that calls POST /api/tenants/sync
    - Parse 409 responses into SyncConflict object (conflictType, existingTenantName, existingSlug)
    - On success: update LocalTenantConfig mode to "synced", store syncedAt and serverTenantId in IndexedDB
    - Implement `reset` function to clear state back to idle
    - Ignore duplicate calls while status is "syncing"
    - Handle network errors without exposing raw technical details
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]\* 5.2 Write unit tests for useTenantSync hook
    - Test status transitions: idle → syncing → success/conflict/error
    - Test reset function clears conflict and error
    - Test duplicate call prevention during syncing
    - _Requirements: 6.1, 6.4, 6.6_

- [x] 6. Checkpoint - Ensure all hook tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Server Tenant Selection UI
  - [x] 7.1 Create the `ServerTenantSelectionSection` component
    - Create `src/components/section/ServerTenantSelectionSection.tsx`
    - Render search input with placeholder text indicating search functionality
    - Integrate `useServerTenantSearch` hook
    - Display loading indicator when search is in progress
    - Display tenant cards (name + slug) for each result
    - Display "no results" message when results array is empty after search
    - Display error message when Search_Hook error state is set
    - Provide back button to return to previous screen
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 7.2 Implement tenant authentication flow in the UI
    - Add login form (username + password fields) shown after tenant selection
    - Username field max 50 chars, password field max 128 chars
    - Call existing `/api/auth/token` endpoint with credentials
    - On success: store TenantContext in IndexedDB, redirect to `/tenant/{tenantId}/{role}`
    - On failure: display "Username atau password salah" (generic error)
    - On timeout (10s): display "Tidak dapat terhubung ke server"
    - On tenant inactive: display "Tenant tidak lagi aktif"
    - Preserve username on failure, clear password, focus password input
    - Dismiss previous error on new submission
    - Handle IndexedDB storage failure with retry option
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]\* 7.3 Write property test for authentication error opacity
    - **Property 7: Authentication Error Opacity** — verify all failed auth attempts return identical generic error
    - **Validates: Requirements 3.4**

- [x] 8. Implement Sync Conflict UI
  - [x] 8.1 Create the sync conflict dialog component
    - Create `src/components/block/SyncConflictDialog.tsx`
    - Display modal dialog when SyncStatus is "conflict"
    - Show conflictType, existing tenant name, and existing slug
    - For "slug_and_admin": inform both slug and admin username are taken
    - For "slug_only": inform slug is taken by displayed existing tenant
    - For "admin_only": inform admin username is taken
    - Provide dismiss action that resets sync state and closes dialog
    - Prevent interaction with underlying UI while dialog is displayed
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 8.2 Integrate sync button and conflict dialog into AdminSection
    - Add "Sync ke Server" button in admin section
    - Wire `useTenantSync` hook to the button
    - Show SyncConflictDialog when conflict is detected
    - Show success feedback when sync completes
    - _Requirements: 6.1, 6.2, 7.1_

- [x] 9. Wire routing and integration
  - [x] 9.1 Integrate ServerTenantSelectionSection into the app routing
    - Add server tenant selection as an option in the login/index route
    - Wire `onComplete` callback to navigate to role-specific route
    - Wire `onBack` callback to return to previous screen
    - Ensure the flow: search → select → authenticate → redirect works end-to-end
    - _Requirements: 3.3, 8.5, 8.8_

  - [ ]\* 9.2 Write integration tests for the full flow
    - Test search → select → authenticate → redirect flow
    - Test sync → conflict → dialog → dismiss flow
    - _Requirements: 3.3, 7.1, 7.5_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TanStack Router file-based routing, Drizzle ORM, Cloudflare D1, and fast-check for property testing
- Existing auth flow at `/api/auth/token` is reused for tenant authentication

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "4.1"] },
    { "id": 2, "tasks": ["2.3", "4.2", "5.1"] },
    { "id": 3, "tasks": ["2.4", "5.2", "7.1"] },
    { "id": 4, "tasks": ["7.2", "8.1"] },
    { "id": 5, "tasks": ["7.3", "8.2", "9.1"] },
    { "id": 6, "tasks": ["9.2"] }
  ]
}
```
