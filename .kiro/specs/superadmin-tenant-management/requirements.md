# Requirements Document

## Introduction

This document specifies the requirements for the Superadmin Tenant Management feature in the koperasi application. The feature provides a dedicated superadmin interface for managing all server tenants globally — including listing, viewing details, creating new tenants, and managing tenant status (activate/suspend/archive). The superadmin role operates outside the per-tenant context and requires dedicated authorization.

## Glossary

- **Superadmin**: A privileged account role that operates outside tenant context and has global management capabilities across all tenants
- **Tenant**: An organizational unit in the system representing a koperasi instance, identified by a unique slug and containing its own accounts
- **Tenant_Status**: The lifecycle state of a tenant, one of "active", "suspended", or "archived"
- **Slug**: A URL-safe identifier for a tenant, 3-50 characters, lowercase alphanumeric with hyphens
- **SuperadminLayout**: The page shell component providing navigation and structure for the superadmin area
- **TenantListPanel**: The component displaying a paginated, searchable list of all tenants
- **TenantDetailPanel**: The component showing full details of a selected tenant including its accounts
- **TenantCreateDialog**: The modal dialog component for creating a new tenant with an initial admin account
- **SuperadminSection**: The top-level orchestrator component managing state and coordinating between panels
- **API_Layer**: The server-side request handlers at `/api/superadmin/*` endpoints
- **D1_Database**: The Cloudflare D1 database storing tenant and account data via Drizzle ORM

## Requirements

### Requirement 1: Superadmin Authorization

**User Story:** As a system operator, I want all superadmin endpoints to be protected by role-based authorization, so that only superadmin accounts can manage tenants globally.

#### Acceptance Criteria

1. WHEN a request is made to any `/api/superadmin/*` endpoint, THE API_Layer SHALL verify that the requesting account has `role = "superadmin"` before executing any business logic for that endpoint
2. IF an authenticated account without `role = "superadmin"` attempts to access any `/api/superadmin/*` endpoint, THEN THE API_Layer SHALL return HTTP 403 Forbidden with a JSON response body containing an error message indicating insufficient permissions, and SHALL NOT execute any business logic
3. IF a request to any `/api/superadmin/*` endpoint has no authentication credentials or has invalid/expired credentials, THEN THE API_Layer SHALL return HTTP 401 Unauthorized with a JSON response body containing an error message indicating authentication is required
4. WHEN a non-superadmin user or unauthenticated user navigates to the `/superadmin` route, THE SuperadminSection SHALL redirect the user to the login page via client-side navigation
5. WHEN a valid superadmin account accesses any `/api/superadmin/*` endpoint, THE API_Layer SHALL process the request and return the appropriate success response

### Requirement 2: Tenant Listing

**User Story:** As a superadmin, I want to view a paginated list of all tenants with search capability, so that I can quickly find and manage any tenant on the server.

#### Acceptance Criteria

1. WHEN a superadmin requests the tenant list via `GET /api/superadmin/tenants`, THE API_Layer SHALL return a paginated list of tenants with fields: tenantId, slug, name, status, timezone, accountCount, and createdAt, along with pagination metadata (page, pageSize, total)
2. WHEN pagination parameters (page, pageSize) are provided, THE API_Layer SHALL return the correct subset of tenants ordered by createdAt descending, with pageSize clamped to a range of 1 to 100 (default 20), such that iterating through all pages yields exactly the total number of unique tenants with no duplicates or omissions
3. WHEN a search query parameter is provided, THE API_Layer SHALL filter tenants by case-insensitive substring matching against slug or name fields, returning only tenants where either field contains the query string
4. THE TenantListPanel SHALL display each tenant with columns: name, slug, status badge, timezone, account count, and created date
5. THE TenantListPanel SHALL display status badges with visual distinction: active as green, suspended as yellow, archived as red
6. WHEN the tenant list is loading, THE TenantListPanel SHALL display a loading indicator
7. IF pagination parameters are missing or invalid (non-integer, less than 1, or page exceeds available pages), THEN THE API_Layer SHALL fall back to default values (page 1, pageSize 20) and return an empty tenants array when the requested page exceeds available data

### Requirement 3: Tenant Detail View

**User Story:** As a superadmin, I want to view the full details of a specific tenant including its accounts, so that I can understand the tenant's configuration and membership.

#### Acceptance Criteria

1. WHEN a superadmin requests tenant details via `GET /api/superadmin/tenants/:tenantId`, THE API_Layer SHALL return the tenant metadata (tenantId, slug, name, status, timezone, createdAt, updatedAt) and a list of all accounts belonging to that tenant
2. IF the requested tenantId does not exist in the database, THEN THE API_Layer SHALL return HTTP 404 Not Found
3. THE TenantDetailPanel SHALL display tenant metadata including name, slug, timezone, status, creation date, and last updated date
4. THE TenantDetailPanel SHALL list all accounts belonging to the tenant with fields: username, role, status, and creation date
5. WHEN a tenant detail response is returned, THE API_Layer SHALL include at least one account for that tenant
6. WHILE tenant detail data is being fetched, THE TenantDetailPanel SHALL display a loading indicator
7. WHEN the back button is clicked, THE TenantDetailPanel SHALL navigate back to the tenant list view

### Requirement 4: Tenant Creation

**User Story:** As a superadmin, I want to create new tenants with an initial admin account, so that I can onboard new koperasi instances onto the server.

#### Acceptance Criteria

1. WHEN a superadmin submits a valid create tenant request via `POST /api/superadmin/tenants`, THE API_Layer SHALL create both the tenant record (with status "active") and the initial admin account (with role "admin" and status "active") atomically in a single transaction
2. WHEN creating a tenant, THE API_Layer SHALL validate the slug (3-50 chars, lowercase alphanumeric + hyphens, no consecutive hyphens, starts/ends with letter or digit), name (2-100 chars, at least one non-whitespace), timezone (valid IANA timezone), admin username (3-50 chars, lowercase letters/digits/underscores/hyphens, no spaces), and admin password (8-128 characters)
3. IF the provided slug already exists in the database (case-insensitive), THEN THE API_Layer SHALL return HTTP 409 Conflict with details about the conflicting field
4. IF the provided admin username already exists in the database (case-insensitive), THEN THE API_Layer SHALL return HTTP 409 Conflict with details about the conflicting field
5. WHEN tenant creation succeeds, THE API_Layer SHALL return the new tenantId, slug, name, and adminAccountId
6. WHEN the superadmin types or modifies the tenant name input, THE TenantCreateDialog SHALL auto-generate a slug by converting the name to lowercase, replacing whitespace and non-alphanumeric characters with hyphens, collapsing consecutive hyphens into one, and trimming leading/trailing hyphens
7. THE TenantCreateDialog SHALL perform client-side validation matching the server-side validation rules before submission and disable the submit button while any validation error exists
8. IF tenant creation fails due to validation errors or a conflict response, THEN THE TenantCreateDialog SHALL display the specific error messages from the server response next to the relevant form fields
9. IF any required field (slug, name, timezone, adminUsername, adminPassword) is missing from the create tenant request, THEN THE API_Layer SHALL return HTTP 400 Bad Request with a list of validation errors indicating each missing or invalid field

### Requirement 5: Tenant Status Management

**User Story:** As a superadmin, I want to change a tenant's status (activate, suspend, archive), so that I can manage the lifecycle of tenants on the server.

#### Acceptance Criteria

1. WHEN a superadmin submits a status change with a target status in the request body via `PATCH /api/superadmin/tenants/:tenantId/status`, THE API_Layer SHALL update the tenant status and return the updated tenantId, status, and updatedAt timestamp
2. THE API_Layer SHALL only permit valid status transitions: active to suspended, suspended to active, active to archived, and suspended to archived
3. IF an invalid status transition is attempted, THEN THE API_Layer SHALL return HTTP 422 Unprocessable Entity with an error message indicating the current status, the requested status, and why the transition is not allowed
4. IF a status change is requested for a tenantId that does not exist, THEN THE API_Layer SHALL return HTTP 404 Not Found
5. WHEN a status change action is triggered, THE TenantDetailPanel SHALL display a confirmation dialog showing the tenant name, current status, and target status before executing the change
6. WHILE a status update is in progress, THE TenantDetailPanel SHALL disable the status change actions and show a loading indicator
7. WHEN a status update completes successfully, THE TenantDetailPanel SHALL update the displayed tenant status to reflect the new status and re-enable the status change actions

### Requirement 6: Superadmin Layout and Navigation

**User Story:** As a superadmin, I want a dedicated layout with navigation, so that I can efficiently access different management sections.

#### Acceptance Criteria

1. THE SuperadminLayout SHALL provide a sidebar with navigation items for Tenants and Accounts sections, with the currently active section visually highlighted
2. THE SuperadminLayout SHALL display the application name, a "Superadmin" role label, and a logout button in the sidebar
3. WHEN the logout button is clicked, THE SuperadminLayout SHALL end the superadmin session and navigate the user to the login page
4. WHEN the viewport width is below 768px, THE SuperadminLayout SHALL hide the sidebar and display a fixed bottom navigation bar with items for Tenants and Accounts, and a hamburger menu that opens a slide-in drawer containing the full navigation
5. WHEN a navigation item is selected, THE SuperadminLayout SHALL display the content section corresponding to the selected item and update the visual highlight to indicate the new active section
6. WHEN the mobile drawer is open, IF the user taps the overlay or the close button, THEN THE SuperadminLayout SHALL dismiss the drawer

### Requirement 7: Error Handling

**User Story:** As a superadmin, I want clear error feedback when operations fail, so that I can understand what went wrong and take corrective action.

#### Acceptance Criteria

1. IF a network error or server error (HTTP 5xx) occurs during any API call, THEN THE SuperadminSection SHALL display an error toast notification indicating the type of failure (network connectivity or server error) and the operation that failed, auto-dismissing after 5 seconds
2. IF the D1 database is unavailable or a database query fails, THEN THE API_Layer SHALL return HTTP 500 Internal Server Error with a response body indicating a database error occurred
3. IF an API error occurs while previously fetched data exists in the TanStack Query cache, THEN THE SuperadminSection SHALL continue displaying the cached data and SHALL NOT replace the rendered content with a blank or empty state
4. IF a tenant creation request fails due to a race condition on unique constraints, THEN THE API_Layer SHALL detect the constraint violation and return HTTP 409 Conflict
5. IF a mutation (create tenant or change status) fails, THEN THE SuperadminSection SHALL re-enable the form or action controls so the user can correct input and retry the operation

### Requirement 8: Slug Uniqueness Invariant

**User Story:** As a system operator, I want tenant slugs to be globally unique (case-insensitive), so that each tenant has an unambiguous URL-safe identifier.

#### Acceptance Criteria

1. THE D1_Database SHALL enforce a unique constraint on the slug column of the tenants table, and THE API_Layer SHALL store all slugs in lowercase so that the constraint effectively prevents case-insensitive duplicates
2. WHEN a new tenant is created, THE API_Layer SHALL query the existing tenants using a case-insensitive comparison on the slug field and reject the request with HTTP 409 Conflict before insertion if a matching slug already exists
3. IF a unique constraint violation occurs during tenant creation due to a race condition between the pre-check and the insert, THEN THE API_Layer SHALL catch the constraint violation error, re-check which field conflicted (slug or admin username), and return HTTP 409 Conflict with a response body indicating the conflict type and the existing tenant's name and slug
4. WHEN a slug is submitted for tenant creation, THE API_Layer SHALL normalize the slug to lowercase before both the uniqueness check and the database insertion
