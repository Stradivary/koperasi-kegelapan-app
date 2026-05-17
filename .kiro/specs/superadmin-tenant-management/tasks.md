# Implementation Plan: Superadmin Tenant Management

## Overview

Implement a dedicated superadmin interface for global tenant management. The implementation covers: (1) extending the AccountRole enum with "superadmin", (2) authorization middleware for superadmin API endpoints, (3) server-side CRUD logic for tenants, (4) four API route handlers under `/api/superadmin/tenants`, and (5) client-side components (SuperadminLayout, TenantListPanel, TenantDetailPanel, TenantCreateDialog, SuperadminSection) with TanStack Query integration. The stack uses TanStack Router file-based routes, Drizzle ORM with Cloudflare D1, shadcn/ui, and fast-check for property testing.

## Tasks

- [ ] 1. Extend data model and create authorization middleware
  - [ ] 1.1 Extend AccountRole enum in schema and add superadmin authorization guard
    - In `src/db/schema.ts`, add `"superadmin"` and `"kiosk"` to the `role` enum in the accounts table
    - Create `src/server/superadminAuth.ts` with a `requireSuperadmin` guard function that:
      - Verifies the request has valid authentication (returns 401 if missing/invalid)
      - Checks the authenticated account has `role = "superadmin"` (returns 403 if not)
      - Returns the authenticated account info on success
    - Reuse existing auth token verification from `src/server/auth.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [ ]\* 1.2 Write property test for authorization invariant
    - **Property 1: Authorization Invariant** — for any account role, access is granted if and only if role is "superadmin"; all other roles receive 403
    - **Validates: Requirements 1.1, 1.2**

- [ ] 2. Implement superadmin tenant server logic
  - [ ] 2.1 Create tenant list query logic
    - Create `src/server/superadminTenants.ts` with a `listTenants` function
    - Accept parameters: page (default 1), pageSize (default 20, clamped 1-100), search (optional)
    - Query tenants table with optional case-insensitive LIKE filter on slug and name
    - Include account count via subquery/join
    - Return paginated results ordered by createdAt descending
    - Return `{ tenants, total, page, pageSize }`
    - _Requirements: 2.1, 2.2, 2.3, 2.7_

  - [ ] 2.2 Create tenant detail query logic
    - Add `getTenantDetail` function to `src/server/superadminTenants.ts`
    - Query tenant by tenantId, return 404 if not found
    - Include all accounts belonging to the tenant
    - Return tenant metadata + accounts array
    - _Requirements: 3.1, 3.2, 3.5_

  - [ ] 2.3 Create tenant creation logic
    - Add `createTenant` function to `src/server/superadminTenants.ts`
    - Validate all fields using existing validators from `tenantSync.ts` (validateSlug, validateName, validateTimezone, validateAdminUsername) plus password validation (8-128 chars)
    - Check slug uniqueness (case-insensitive) and admin username uniqueness
    - Create tenant + admin account atomically in a single D1 transaction
    - Hash admin password using existing `hashPassword` from `server/auth.ts`
    - Return 409 on conflict, 400 on validation failure, 201 on success
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.9, 8.1, 8.2, 8.3, 8.4_

  - [ ] 2.4 Create tenant status update logic
    - Add `updateTenantStatus` function to `src/server/superadminTenants.ts`
    - Validate status transition against allowed set: {active→suspended, suspended→active, active→archived, suspended→archived}
    - Return 404 if tenant not found, 422 if invalid transition
    - Update tenant status and updatedAt timestamp
    - Return updated tenantId, status, updatedAt
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]\* 2.5 Write property tests for server logic
    - **Property 2: Slug Uniqueness** — for any two create requests with same slug (case-insensitive), the second always returns 409
    - **Property 3: Status Transition Validity** — for any current status and target status, update succeeds iff transition is in the allowed set
    - **Property 4: Pagination Completeness** — iterating all pages yields exactly `total` unique tenants with no duplicates
    - **Property 5: Create Tenant Atomicity** — after successful creation, both tenant and admin account exist; on failure, neither exists
    - **Validates: Requirements 2.2, 4.1, 4.3, 5.2, 5.3, 8.1, 8.2**

- [ ] 3. Implement API route handlers
  - [ ] 3.1 Create `GET /api/superadmin/tenants` route
    - Create `src/routes/api/superadmin/tenants/index.ts` with GET handler
    - Call `requireSuperadmin` guard first
    - Parse query params: page, pageSize, search
    - Call `listTenants` from server logic
    - Return JSON response with tenant list and pagination metadata
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.7_

  - [ ] 3.2 Create `POST /api/superadmin/tenants` route
    - Add POST handler to `src/routes/api/superadmin/tenants/index.ts`
    - Call `requireSuperadmin` guard first
    - Parse and validate request body (slug, name, timezone, adminUsername, adminPassword)
    - Call `createTenant` from server logic
    - Return 201 with created tenant info, or appropriate error responses
    - _Requirements: 1.1, 4.1, 4.2, 4.3, 4.4, 4.5, 4.9, 8.1_

  - [ ] 3.3 Create `GET /api/superadmin/tenants/$id` route
    - Create `src/routes/api/superadmin/tenants/$tenantId.ts` with GET handler
    - Call `requireSuperadmin` guard first
    - Extract tenantId from route params
    - Call `getTenantDetail` from server logic
    - Return JSON response with tenant detail or 404
    - _Requirements: 1.1, 3.1, 3.2_

  - [ ] 3.4 Create `PATCH /api/superadmin/tenants/$id/status` route
    - Create `src/routes/api/superadmin/tenants/$tenantId.status.ts` with PATCH handler
    - Call `requireSuperadmin` guard first
    - Parse request body for target status
    - Call `updateTenantStatus` from server logic
    - Return updated status or appropriate error responses
    - _Requirements: 1.1, 5.1, 5.2, 5.3, 5.4_

- [ ] 4. Checkpoint - Ensure all server-side tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement SuperadminLayout component
  - [ ] 5.1 Create the SuperadminLayout component
    - Create `src/components/layout/SuperadminLayout.tsx`
    - Render sidebar with navigation items: Tenants, Accounts (visually highlighted active section)
    - Display app name, "Superadmin" role label, and logout button in sidebar
    - Responsive: desktop sidebar, mobile bottom nav bar (below 768px) with hamburger menu opening a slide-in drawer
    - Logout action ends session and navigates to login page
    - Accept `activeSection`, `onSectionChange`, and `children` props
    - Use shadcn/ui components (Sheet for drawer, Button, etc.)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 6. Implement TenantListPanel component
  - [ ] 6.1 Create the TenantListPanel component
    - Create `src/components/block/TenantListPanel.tsx`
    - Render tenant table with columns: name, slug, status badge, timezone, account count, created date
    - Status badges: active=green, suspended=yellow, archived=red
    - Search input for filtering tenants
    - "Create Tenant" button
    - Pagination controls (previous/next, page indicator)
    - Loading indicator when data is being fetched
    - Click on tenant row navigates to detail view
    - _Requirements: 2.4, 2.5, 2.6_

- [ ] 7. Implement TenantDetailPanel component
  - [ ] 7.1 Create the TenantDetailPanel component
    - Create `src/components/block/TenantDetailPanel.tsx`
    - Display tenant metadata: name, slug, timezone, status, createdAt, updatedAt
    - List all accounts with columns: username, role, status, createdAt
    - Status change action buttons (activate/suspend/archive) based on current status
    - Confirmation dialog before executing status change (shows tenant name, current status, target status)
    - Back button to return to tenant list
    - Loading indicator while fetching
    - Disable status actions and show loading while update is in progress
    - _Requirements: 3.3, 3.4, 3.6, 3.7, 5.5, 5.6, 5.7_

- [ ] 8. Implement TenantCreateDialog component
  - [ ] 8.1 Create the TenantCreateDialog component
    - Create `src/components/block/TenantCreateDialog.tsx`
    - Modal dialog with form fields: tenant name, slug (auto-generated), timezone picker, admin username, admin password
    - Auto-generate slug from name: lowercase, replace non-alphanumeric with hyphens, collapse consecutive hyphens, trim leading/trailing hyphens
    - Client-side validation matching server rules (slug, name, timezone, username, password)
    - Disable submit button while validation errors exist or while submitting
    - Display server error messages next to relevant fields on failure
    - Use shadcn/ui Dialog, Input, Button, Label components
    - _Requirements: 4.6, 4.7, 4.8_

  - [ ]\* 8.2 Write property test for validation consistency
    - **Property 7: Validation Consistency** — for any input, client-side and server-side validation produce equivalent accept/reject decisions
    - **Validates: Requirements 4.2, 4.7**

- [ ] 9. Implement SuperadminSection orchestrator and route
  - [ ] 9.1 Create the SuperadminSection component
    - Create `src/components/section/SuperadminSection.tsx`
    - Manage active view state (list vs detail) and selected tenant ID
    - Use TanStack Query for data fetching (tenant list, tenant detail)
    - Handle mutations (create tenant, status change) with TanStack Query mutations
    - Show error toasts via Sonner on network/server errors (auto-dismiss 5s)
    - Keep cached data visible on error (stale-while-revalidate)
    - Re-enable form/action controls on mutation failure
    - Redirect non-superadmin users to login page
    - _Requirements: 1.4, 7.1, 7.3, 7.5_

  - [ ] 9.2 Create the `/superadmin` route file
    - Create `src/routes/superadmin.tsx` with TanStack Router route definition
    - Render SuperadminSection with auth check
    - Wire SuperadminLayout with SuperadminSection
    - _Requirements: 1.4, 6.1_

- [ ] 10. Checkpoint - Ensure all component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Integration and wiring
  - [ ] 11.1 Wire all components together and verify end-to-end flow
    - Ensure SuperadminSection correctly coordinates between TenantListPanel, TenantDetailPanel, and TenantCreateDialog
    - Verify navigation flow: list → detail → back, list → create → success → list refresh
    - Verify status change flow: detail → confirm → update → refresh
    - Verify error handling: toast on failure, cached data preserved, controls re-enabled
    - Verify authorization: non-superadmin redirect, API 403 responses
    - _Requirements: 1.4, 2.1, 3.7, 4.1, 5.7, 7.1, 7.3, 7.5_

  - [ ]\* 11.2 Write property test for tenant detail consistency
    - **Property 6: Tenant Detail Consistency** — for any tenant in the system, the detail response includes at least one account
    - **Validates: Requirements 3.5**

- [ ] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TanStack Router file-based routing, Drizzle ORM, Cloudflare D1, shadcn/ui, and fast-check for property testing
- Existing validators from `src/server/tenantSync.ts` are reused for tenant creation validation
- Existing auth utilities from `src/server/auth.ts` are reused for password hashing and token verification
- The `accounts` table role enum needs extending to include "superadmin" and "kiosk"

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["2.5", "3.1", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["5.1", "6.1", "7.1", "8.1"] },
    { "id": 4, "tasks": ["8.2", "9.1"] },
    { "id": 5, "tasks": ["9.2", "11.1"] },
    { "id": 6, "tasks": ["11.2"] }
  ]
}
```
