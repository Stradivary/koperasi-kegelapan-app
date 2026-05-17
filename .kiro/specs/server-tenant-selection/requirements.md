# Requirements Document

## Introduction

This document specifies the requirements for the Server Tenant Selection feature in the cooperative management app (koperasi). The feature enables server-mode tenant selection where users can search for available tenants on a server, select one, and authenticate with a password to establish a session. Additionally, it introduces sync conflict detection that prevents accidental overwrites when a local tenant pushes to the server — blocking the operation if a tenant with the same slug AND/OR admin username already exists.

The system covers three main flows:

1. Server tenant search & selection UI with debounced search and caching
2. Password-based authentication against a server tenant
3. Sync conflict detection with clear error messaging when name collisions are detected

## Glossary

- **Server_Tenant_Selection_UI**: The UI section component that allows users to search, select, and authenticate against server tenants
- **Search_Hook**: The client-side hook (useServerTenantSearch) that manages debounced search state and caching
- **Sync_Hook**: The client-side hook (useTenantSync) that handles pushing local tenants to the server with conflict detection
- **Search_API**: The server endpoint (/api/tenants/search) that queries active tenants by name or slug
- **Auth_API**: The server endpoint (/api/auth/token) that authenticates users against a server tenant
- **Sync_API**: The server endpoint (/api/tenants/sync) that accepts local tenant pushes with uniqueness enforcement
- **Tenant_Search_Result**: A data object containing tenantId, slug, and name returned from search
- **Sync_Request**: The payload sent to the server containing slug, name, timezone, adminUsername, and adminPasswordHash
- **Sync_Conflict**: A conflict response indicating the type of collision (slug_and_admin, slug_only, admin_only)
- **Sync_Status**: The current state of a sync operation (idle, syncing, success, conflict, error)
- **Local_Tenant_Config**: The IndexedDB-stored tenant configuration including mode, serverUrl, and sync metadata
- **Debounce_Timer**: A 300ms delay applied to search input before triggering an API call

## Requirements

### Requirement 1: Server Tenant Search

**User Story:** As a user connecting to a server, I want to search for available tenants by name or slug, so that I can find and select the cooperative I belong to.

#### Acceptance Criteria

1. WHEN a user types a search query of at least 2 characters and at most 100 characters, THE Search_API SHALL return matching active tenants where the query is a case-insensitive substring of the tenant name OR slug, with each result containing tenantId, slug, and name
2. WHEN a user types a search query shorter than 2 characters, THE Search_API SHALL reject the request with a 400 error indicating minimum query length
3. IF the requested limit is less than 1 or greater than 50 or not a valid integer, THEN THE Search_API SHALL reject the request with a 400 error indicating the valid limit range (1-50); otherwise THE Search_API SHALL return at most the specified limit of results (default 10)
4. THE Search_API SHALL only return tenants with status "active"
5. WHEN no tenants match the query, THE Search_API SHALL return an empty array with total count of zero
6. THE Search_API SHALL return results ordered alphabetically by tenant name to ensure deterministic ordering

### Requirement 2: Client-Side Debounced Search

**User Story:** As a user, I want the search to feel responsive without overwhelming the server, so that I get results quickly without unnecessary network calls.

#### Acceptance Criteria

1. WHEN a user types in the search input, THE Search_Hook SHALL debounce the input by 300 milliseconds before making an API call
2. WHILE the query is shorter than 2 characters, THE Search_Hook SHALL set results to an empty array, set loading to false, and not make an API call
3. WHEN a cached result exists for the current query, THE Search_Hook SHALL return the cached result without making an API call
4. WHEN a new query is typed before the previous debounce timer expires, THE Search_Hook SHALL reset the debounce timer and discard the previous pending request
5. THE Search_Hook SHALL expose loading (boolean), error (string or null), and results (TenantSearchResult array) states for UI consumption
6. WHEN a network error occurs during search, THE Search_Hook SHALL set the error state with a non-empty user-facing message and set results to an empty array
7. WHEN the Search_Hook is first initialized, THE Search_Hook SHALL have loading set to false, error set to null, and results set to an empty array

### Requirement 3: Tenant Selection and Authentication

**User Story:** As a user, I want to select a tenant from search results and authenticate with a password, so that I can establish a session with the correct cooperative.

#### Acceptance Criteria

1. WHEN a user selects a tenant from the search results, THE Server_Tenant_Selection_UI SHALL display a login form containing a username field (maximum 50 characters) and a password field (maximum 128 characters) for that tenant
2. WHEN a user submits valid credentials, THE Auth_API SHALL return account context including accountId, tenantId, tenantSlug, tenantName, and role within 5 seconds
3. WHEN authentication succeeds, THE Server_Tenant_Selection_UI SHALL store the TenantContext (tenantId, tenantSlug, tenantName, deviceId, accountId, role, terminalId, updatedAt) in IndexedDB and redirect to the role-specific route (/tenant/{tenantId}/{role}) where role is one of: admin, gate, kiosk, scout, station, or terminal
4. WHEN a user submits invalid credentials, THE Auth_API SHALL return a 401 authentication error with a generic error message that does not reveal whether the username or password was incorrect
5. WHEN the selected tenant has become inactive between search and authentication, THE Auth_API SHALL return a 401 error indicating tenant inactivity
6. IF storing the TenantContext in IndexedDB fails after successful authentication, THEN THE Server_Tenant_Selection_UI SHALL display an error message indicating the session could not be saved and allow the user to retry without re-entering credentials

### Requirement 4: Sync Conflict Detection

**User Story:** As an admin syncing a local tenant to the server, I want to be blocked if a conflicting tenant already exists, so that I do not accidentally overwrite or duplicate another cooperative's data.

#### Acceptance Criteria

1. WHEN a sync request is submitted AND both the slug AND admin username already exist on the server (case-insensitive match), THE Sync_API SHALL return a 409 response with conflictType "slug_and_admin"
2. WHEN a sync request is submitted AND only the slug already exists on the server (case-insensitive match), THE Sync_API SHALL return a 409 response with conflictType "slug_only"
3. WHEN a sync request is submitted AND only the admin username already exists on the server (case-insensitive match), THE Sync_API SHALL return a 409 response with conflictType "admin_only"
4. WHEN a sync request is submitted AND neither slug nor admin username exists on the server, THE Sync_API SHALL create the tenant and admin account and return a 201 response containing the assigned tenantId, slug, and name
5. WHEN a conflict is detected, THE Sync_API SHALL return the existing tenant name and slug associated with the conflicting resource in the 409 response body (for admin_only conflicts, the tenant to which the existing admin belongs)
6. WHEN a conflict is detected, THE Sync_API SHALL NOT insert any rows into the database
7. IF a sync request is submitted with a slug and admin username that belong to the same existing tenant (re-sync scenario), THEN THE Sync_API SHALL return a 409 response with conflictType "slug_and_admin" rather than silently overwriting the existing data

### Requirement 5: Sync Request Validation

**User Story:** As a system, I want to validate sync request data before processing, so that only well-formed data enters the database.

#### Acceptance Criteria

1. THE Sync_API SHALL validate that slug is 3-50 characters, containing only lowercase letters (a-z), digits (0-9), and hyphens, must start and end with a lowercase letter or digit, and must not contain consecutive hyphens
2. THE Sync_API SHALL validate that name is 2-100 characters and contains at least one non-whitespace character
3. THE Sync_API SHALL validate that timezone is a valid IANA timezone string
4. THE Sync_API SHALL validate that adminUsername is 3-50 characters containing only lowercase letters (a-z), digits (0-9), underscores, and hyphens, with no spaces
5. THE Sync_API SHALL validate that adminPasswordHash matches the format "iterations:saltHex:hashHex" where iterations is a positive integer, saltHex is a 32-character hexadecimal string, and hashHex is a 64-character hexadecimal string
6. IF any validation fails, THEN THE Sync_API SHALL reject the entire request with a 400 error response containing an array of objects each identifying the invalid field name and a message indicating the validation rule that failed
7. IF all required fields (slug, name, timezone, adminUsername, adminPasswordHash) are missing from the request body, THEN THE Sync_API SHALL return a 400 error indicating all missing fields in a single response

### Requirement 6: Client-Side Sync State Management

**User Story:** As an admin, I want clear feedback about the sync operation status, so that I know whether my tenant was synced successfully or if there is a conflict to resolve.

#### Acceptance Criteria

1. THE Sync_Hook SHALL expose the current Sync_Status (idle, syncing, success, conflict, error) with an initial value of "idle" upon hook initialization
2. WHEN a conflict response is received, THE Sync_Hook SHALL expose the Sync_Conflict details including conflictType, existingTenantName, and existingSlug
3. WHEN a sync operation succeeds, THE Sync_Hook SHALL update the Local_Tenant_Config mode to "synced" and store the syncedAt timestamp (client-side epoch milliseconds) and the serverTenantId returned in the success response
4. THE Sync_Hook SHALL provide a reset function that sets Sync_Status to "idle" and clears both the conflict object and error string to null
5. WHEN a network error occurs during sync, THE Sync_Hook SHALL set Sync_Status to "error" and set the error string to a non-empty message that does not expose raw technical details such as stack traces or HTTP response bodies
6. IF syncToServer is called while Sync_Status is "syncing", THEN THE Sync_Hook SHALL ignore the subsequent call and not initiate a second network request

### Requirement 7: Sync Conflict UI

**User Story:** As an admin encountering a sync conflict, I want to see clear details about what conflicted, so that I can decide how to resolve it.

#### Acceptance Criteria

1. WHEN Sync_Status is "conflict", THE Server_Tenant_Selection_UI SHALL display a modal conflict dialog showing the conflictType, the existing tenant name, and the existing slug
2. WHEN conflictType is "slug_and_admin", THE conflict dialog SHALL inform the user that both the slug and admin username are already taken on the server
3. WHEN conflictType is "slug_only", THE conflict dialog SHALL inform the user that the slug is already taken on the server by the displayed existing tenant
4. WHEN conflictType is "admin_only", THE conflict dialog SHALL inform the user that the admin username is already taken on the server
5. THE conflict dialog SHALL provide a dismiss action that resets the sync state to idle and closes the dialog
6. WHILE the conflict dialog is displayed, THE Server_Tenant_Selection_UI SHALL prevent interaction with the underlying UI elements

### Requirement 8: Server Tenant Search UI

**User Story:** As a user, I want a clear and responsive search interface for finding server tenants, so that I can quickly locate my cooperative.

#### Acceptance Criteria

1. THE Server_Tenant_Selection_UI SHALL display a search input field with placeholder text indicating search functionality
2. WHEN the user enters at least 2 characters in the search input field, THE Server_Tenant_Selection_UI SHALL trigger the Search_Hook to query matching tenants
3. WHEN the Search_Hook loading state is true, THE Server_Tenant_Selection_UI SHALL display a loading indicator
4. WHEN search results are available, THE Server_Tenant_Selection_UI SHALL display each tenant as a selectable card showing tenant name and slug
5. WHEN the user selects a tenant card, THE Server_Tenant_Selection_UI SHALL navigate the user to the login form for the selected tenant
6. WHEN search results are available and the result list is empty, THE Server_Tenant_Selection_UI SHALL display a message indicating no tenants matched the query
7. WHEN the Search_Hook error state is set, THE Server_Tenant_Selection_UI SHALL display an error message to the user
8. THE Server_Tenant_Selection_UI SHALL provide a back button to return to the previous screen

### Requirement 9: Authentication Error Handling

**User Story:** As a user, I want clear error messages when authentication fails, so that I can understand what went wrong and try again.

#### Acceptance Criteria

1. WHEN authentication fails due to invalid credentials, THE Server_Tenant_Selection_UI SHALL display "Username atau password salah" without revealing which field was incorrect
2. IF the authentication request does not receive a response within 10 seconds, THEN THE Server_Tenant_Selection_UI SHALL display "Tidak dapat terhubung ke server"
3. WHEN authentication fails due to tenant inactivity, THE Server_Tenant_Selection_UI SHALL display "Tenant tidak lagi aktif"
4. WHEN authentication fails, THE Server_Tenant_Selection_UI SHALL preserve the username field value, clear the password field, and keep focus on the password input so the user can re-enter credentials
5. WHEN a new authentication attempt is submitted, THE Server_Tenant_Selection_UI SHALL dismiss any previously displayed error message

### Requirement 10: Race Condition Handling on Sync

**User Story:** As a system, I want to handle concurrent sync attempts gracefully, so that duplicate tenants are never created even under race conditions.

#### Acceptance Criteria

1. WHEN two devices attempt to sync the same slug within the same time window, THE Sync_API SHALL ensure only one request succeeds and the other receives a 409 conflict response, enforced by the database unique constraint on slug
2. WHEN a sync fails due to a database unique constraint violation, THE Sync_API SHALL return a 409 conflict response containing the conflictType and existing tenant reference, consistent with the conflict response format defined in Requirement 4
3. THE Sync_API SHALL perform conflict checks, tenant insertion, and admin account insertion within a single database transaction so that either all rows are committed or none are
4. IF the transaction fails after partial execution (e.g., tenant row inserted but account insertion fails), THEN THE Sync_API SHALL roll back all changes and return an error response indicating the sync was not completed
