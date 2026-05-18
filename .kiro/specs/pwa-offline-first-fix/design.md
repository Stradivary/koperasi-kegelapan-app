# PWA Offline-First Fix — Bugfix Design

## Overview

The PWA fails to operate correctly in offline-first mode across multiple subsystems: the unified login flow in `LoginSection.tsx` always falls through to a server fetch even when local login succeeds or when the user only has a local account, causing a misleading connectivity error; the `useSessionGrant` hook has no offline/cached fallback; the service worker registration is coupled to the `PwaUpdatePrompt` component mounting rather than being eagerly registered; the VitePWA `devOptions.enabled` is `false` preventing dev-mode offline testing; there is no connectivity status indicator in the admin panel; and there is no guarantee the app shell is served from cache when offline.

The fix strategy is to:

1. Short-circuit the login flow when local login succeeds (skip server fetch entirely)
2. Add IndexedDB-based caching to `useSessionGrant`
3. Decouple service worker registration from `PwaUpdatePrompt` into an eager root-level registration
4. Enable `devOptions` for development PWA testing
5. Add an online/offline status badge to `AdminLayout`
6. Ensure the VitePWA workbox config includes a navigation fallback for the app shell

## Glossary

- **Bug_Condition (C)**: The set of conditions where the app is offline and attempts network-dependent operations that should succeed locally — login with local credentials, session grant retrieval, or navigation to cached routes
- **Property (P)**: The desired behavior when offline — local login completes without network, cached session grants are returned, app shell is always served from cache, and connectivity status is visible
- **Preservation**: Existing online behavior that must remain unchanged — server login, fresh session grant fetching, update prompts, and all online-mode UI interactions
- **`handleUnifiedLogin`**: The function in `LoginSection.tsx` that processes login form submission, attempting local then server authentication
- **`fetchSessionGrant`**: The function in `useSessionGrant.ts` that fetches a session grant from `/api/session-grant` with no offline fallback
- **`PwaUpdatePrompt`**: The component in `PwaUpdatePrompt.tsx` that calls `useRegisterSW` — currently the only place the service worker is registered
- **`AdminLayout`**: The layout component in `AdminLayout.tsx` that renders the admin panel sidebar and navigation

## Bug Details

### Bug Condition

The bug manifests across multiple scenarios where the device is offline and the app attempts network-dependent operations that should succeed using local data. The core issue is that the codebase was designed with an "online-first with local fallback" mindset rather than a true "offline-first" architecture.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type AppOperation (login | sessionGrant | navigation | adminView)
  OUTPUT: boolean

  LET isOffline = !navigator.onLine OR networkFetchWouldThrow()

  CASE input.type OF
    "login":
      RETURN isOffline
             AND localAccountExists(input.username)
             AND (localCredentialsValid(input.username, input.password)
                  OR localCredentialsInvalid(input.username, input.password))
             // Bug: server fetch is attempted regardless of local result

    "sessionGrant":
      RETURN isOffline
             AND cachedGrantExists(input.tenantId, input.accountId, input.deviceId)
             AND cachedGrantNotExpired()
             // Bug: only network fetch is attempted, no cache lookup

    "swRegistration":
      RETURN serviceWorkerNotRegistered()
             AND PwaUpdatePromptNotMounted()
             // Bug: SW registration depends on component mount

    "navigation":
      RETURN isOffline
             AND appShellPreviouslyCached()
             AND navigationFallbackNotConfigured()
             // Bug: no navigateFallback in workbox config

    "adminView":
      RETURN isOffline
             AND userIsInAdminPanel()
             AND noConnectivityIndicatorVisible()
             // Bug: no UI element shows offline status
  END CASE
END FUNCTION
```

### Examples

- **Login success blocked**: User has local account "admin1" with valid password. Device is offline. User submits correct credentials → `localLogin` returns a valid result → code continues to `fetch("/api/auth/token")` → fetch throws → catch block shows "Gagal terhubung ke server" instead of completing the login that already succeeded locally
- **Login error masked**: User has local account but enters wrong password. Device is offline. `localLogin` returns `null` → code attempts server fetch → fetch throws → catch shows "Gagal terhubung ke server" instead of "Username atau password salah"
- **Session grant fails offline**: Admin panel loads, `useSessionGrant` calls `fetchSessionGrant` → network fetch throws → error state is set → NFC operations are blocked even though a valid cached grant exists
- **No service worker on fresh load**: User installs PWA, navigates away from root before `PwaUpdatePrompt` mounts → no service worker registered → next offline visit shows browser offline page
- **Admin unaware of offline state**: Admin is using the panel, device loses connectivity → no visual indicator → admin attempts sync operation and gets unexpected error

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Online server login via `/api/auth/token` must continue to work for server-only accounts
- Online session grant fetching must continue to return fresh grants from the server
- The PWA update prompt must continue to appear when a new version is detected
- The "Hubungkan ke Server" flow must continue to navigate to server tenant selection
- Production builds must continue to precache all static assets via workbox
- All existing workbox routing strategies for API requests must remain unchanged
- Local-first preference (local login result takes priority over server) must be preserved when online

**Scope:**
All inputs that do NOT involve offline operation should be completely unaffected by this fix. This includes:

- Online login attempts (both local and server)
- Online session grant requests
- PWA update detection and installation
- All admin panel CRUD operations (cards, members, audit)
- NFC card operations when a valid grant exists
- Server sync operations

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Missing early return in `handleUnifiedLogin`**: In `LoginSection.tsx` lines 89-115, when `localLogin` succeeds (returns a non-null result), the function correctly stores the tenant context and calls `redirectToRole` — but the code structure uses `return` after redirect. The actual bug is that when `localLogin` returns `null` (credentials don't match any local account), the code unconditionally attempts `fetch("/api/auth/token")`. When offline, this fetch throws and the `catch` block sets a generic connectivity error, masking the real "wrong credentials" error. The fix needs to detect offline state and skip the server fetch when offline.

2. **No caching layer in `useSessionGrant`**: The `fetchSessionGrant` function in `useSessionGrant.ts` only performs a network fetch. There is no IndexedDB or Cache API fallback. When offline, the fetch throws immediately and the hook enters an error state, blocking all grant-dependent operations.

3. **Service worker registration coupled to component lifecycle**: In `__root.tsx`, `PwaUpdatePrompt` is rendered in the shell, and `useRegisterSW` inside it is the only registration point. If the component tree fails to render or is delayed, the SW is never registered. Additionally, `injectRegister: null` in `vite.config.ts` means VitePWA does not auto-inject registration — it relies entirely on the manual `useRegisterSW` call.

4. **`devOptions.enabled: false`**: In `vite.config.ts`, the VitePWA plugin has `devOptions: { enabled: false }`, which prevents the service worker from being registered during development, making it impossible to test offline behavior locally.

5. **No `navigateFallback` in workbox config**: The VitePWA configuration in `vite.config.ts` does not specify `workbox.navigateFallback` or `workbox.runtimeCaching`, meaning client-side navigation to app routes while offline may not be intercepted by the service worker, resulting in the browser's default offline page.

6. **No connectivity status UI**: The `AdminLayout` component has no mechanism to detect or display the current online/offline state.

## Correctness Properties

Property 1: Bug Condition - Offline Local Login Completes Without Network

_For any_ login attempt where a local account exists in IndexedDB and the device is offline, the fixed `handleUnifiedLogin` function SHALL either (a) complete the login successfully using only local PBKDF2 verification when credentials are correct, or (b) display "Username atau password salah" when credentials are incorrect — without attempting any network request and without displaying a connectivity error.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Online Login Behavior Unchanged

_For any_ login attempt where the device is online, the fixed `handleUnifiedLogin` function SHALL produce the same result as the original function — local-first authentication with server fallback — preserving the existing login flow for online users including server-only accounts.

**Validates: Requirements 3.1, 3.2**

Property 3: Bug Condition - Cached Session Grant Returned Offline

_For any_ session grant request where the device is offline and a valid (non-expired) cached grant exists in IndexedDB, the fixed `useSessionGrant` hook SHALL return the cached grant instead of entering an error state.

**Validates: Requirements 2.3**

Property 4: Preservation - Online Session Grant Fetches Fresh Data

_For any_ session grant request where the device is online, the fixed `useSessionGrant` hook SHALL continue to fetch a fresh grant from the server and cache it locally, preserving the existing refresh scheduling behavior.

**Validates: Requirements 3.3**

Property 5: Bug Condition - Service Worker Registered Eagerly

_For any_ app load, the service worker SHALL be registered eagerly at the root level (not dependent on `PwaUpdatePrompt` component mounting), ensuring subsequent offline visits are served from cache.

**Validates: Requirements 2.4**

Property 6: Bug Condition - App Shell Always Served From Cache

_For any_ navigation request where the device is offline and the app has been loaded at least once while online, the service worker SHALL serve the cached app shell — the browser's default offline page SHALL never be shown.

**Validates: Requirements 2.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/components/section/LoginSection.tsx`

**Function**: `handleUnifiedLogin`

**Specific Changes**:

1. **Add offline detection before server fetch**: After `localLogin` returns `null`, check `navigator.onLine`. If offline, immediately set error to "Username atau password salah" and return — do not attempt the server fetch.
2. **Ensure local login success short-circuits completely**: Verify the existing `return` after `redirectToRole` prevents falling through to the server fetch (code review confirms this is already correct for the success case).

---

**File**: `src/hooks/useSessionGrant.ts`

**Function**: `fetchSessionGrant` and `useSessionGrant`

**Specific Changes**:

1. **Add IndexedDB cache for session grants**: Create a `sessionGrantStore` in IndexedDB (or use the existing `localDb`) to persist fetched grants keyed by `(tenantId, accountId, deviceId)`.
2. **Cache-then-network strategy**: On `refresh()`, first check IndexedDB for a cached grant. If found and not expired, use it immediately. Then attempt network fetch in background (if online) to refresh the cache.
3. **Offline fallback**: If network fetch fails and a cached grant exists (even if close to expiry), return the cached grant rather than entering error state.
4. **Cache write-through**: After a successful network fetch, write the grant to IndexedDB for future offline use.

---

**File**: `src/routes/__root.tsx`

**Specific Changes**:

1. **Eager service worker registration**: Add a `useEffect` or inline script that calls `navigator.serviceWorker.register('/sw.js')` at the root level, independent of `PwaUpdatePrompt`. Alternatively, move the `useRegisterSW` call to the `RootDocument` component directly.
2. **Keep `PwaUpdatePrompt` for update UI**: The component continues to handle the update prompt UI, but registration is no longer solely its responsibility.

---

**File**: `vite.config.ts`

**Specific Changes**:

1. **Enable devOptions conditionally**: Change `devOptions: { enabled: false }` to `devOptions: { enabled: process.env.PWA_DEV === '1' }` or similar environment-variable-driven toggle.
2. **Add workbox navigateFallback**: Add `workbox: { navigateFallback: '/index.html' }` (or the appropriate app shell entry point) to ensure offline navigation is handled.
3. **Add runtimeCaching for API routes**: Configure workbox `runtimeCaching` with `NetworkFirst` strategy for API routes to enable offline fallback from cache.

---

**File**: `src/components/layout/AdminLayout.tsx`

**Specific Changes**:

1. **Add online/offline status badge**: Create a small connectivity indicator (green dot = online, red/gray dot = offline) in the sidebar header area, visible in both desktop and mobile views.
2. **Use `navigator.onLine` + event listeners**: Add `useState` + `useEffect` that listens to `online`/`offline` window events to reactively update the badge.

---

**File**: New file `src/hooks/useOnlineStatus.ts`

**Specific Changes**:

1. **Create reusable hook**: Extract the online/offline detection logic into a shared hook that returns `isOnline: boolean` and can be used by both `AdminLayout` and `LoginSection`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that mock `navigator.onLine = false` and `fetch` to throw `TypeError: Failed to fetch`, then exercise the login flow and session grant hook. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:

1. **Offline Local Login Success Test**: Mock offline state, mock `localLogin` to return valid result, call `handleUnifiedLogin` → expect redirect without fetch attempt (will fail on unfixed code because fetch is still called after successful local login — actually, code review shows the `return` after redirect should prevent this; the real bug is case 2)
2. **Offline Local Login Failure Test**: Mock offline state, mock `localLogin` to return `null`, call `handleUnifiedLogin` → expect "Username atau password salah" error (will fail on unfixed code — shows "Gagal terhubung ke server")
3. **Offline Session Grant Test**: Mock offline state, call `useSessionGrant` refresh → expect cached grant returned (will fail on unfixed code — enters error state)
4. **SW Registration Without PwaUpdatePrompt Test**: Render app without `PwaUpdatePrompt` mounted → expect SW still registered (will fail on unfixed code)

**Expected Counterexamples**:

- Login flow shows connectivity error instead of credential error when offline and local login returns null
- Session grant hook enters error state instead of returning cached data
- Possible causes: missing offline detection before server fetch, no cache layer in session grant hook

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  CASE input.type OF
    "login" AND credentialsValid:
      result := handleUnifiedLogin_fixed(input)
      ASSERT result.redirectedToRole = true
      ASSERT result.networkFetchAttempted = false

    "login" AND credentialsInvalid:
      result := handleUnifiedLogin_fixed(input)
      ASSERT result.error = "Username atau password salah"
      ASSERT result.networkFetchAttempted = false

    "sessionGrant":
      result := useSessionGrant_fixed(input)
      ASSERT result.grant != null
      ASSERT result.grant.expiresAt > now()

    "navigation":
      result := serviceWorker.handleFetch(navigationRequest)
      ASSERT result.status = 200
      ASSERT result.body = cachedAppShell
  END CASE
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleUnifiedLogin_original(input) = handleUnifiedLogin_fixed(input)
  ASSERT useSessionGrant_original(input) = useSessionGrant_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many test cases automatically across the input domain (various username/password combinations, online states, grant configurations)
- It catches edge cases that manual unit tests might miss (e.g., race conditions between online/offline transitions)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for online login and session grant operations, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Online Login Preservation**: Verify that online login with server-only accounts continues to authenticate via `/api/auth/token` and redirect correctly
2. **Online Session Grant Preservation**: Verify that online session grant fetching continues to return fresh grants and schedule refresh timers
3. **Update Prompt Preservation**: Verify that the PWA update prompt continues to appear when `needRefresh` is true
4. **Local-First Priority Preservation**: Verify that when both local and server accounts exist and device is online, local login result takes priority

### Unit Tests

- Test `handleUnifiedLogin` with offline state and valid local credentials → expect successful redirect
- Test `handleUnifiedLogin` with offline state and invalid credentials → expect "Username atau password salah"
- Test `handleUnifiedLogin` with offline state and no local account → expect "Username atau password salah" (not connectivity error)
- Test `useSessionGrant` with offline state and cached grant → expect cached grant returned
- Test `useSessionGrant` with offline state and expired cached grant → expect error state
- Test `useOnlineStatus` hook responds to online/offline events
- Test `AdminLayout` renders connectivity badge with correct state

### Property-Based Tests

- Generate random (username, password, onlineState, localAccountExists) tuples and verify: when offline, no network fetch is attempted; when online, server fallback works for non-local accounts
- Generate random session grant states (cached/not-cached, expired/valid, online/offline) and verify: offline + valid cache → grant returned; online → fresh fetch attempted
- Generate random navigation requests with various cache states and verify: offline + cached → app shell served; online → network-first strategy used

### Integration Tests

- Test full offline login flow: set up local tenant → go offline → login with correct credentials → verify redirect to admin panel
- Test full offline login flow with wrong password: set up local tenant → go offline → login with wrong password → verify "Username atau password salah" shown
- Test session grant caching: fetch grant online → go offline → verify grant still available in admin panel
- Test service worker registration: load app → verify SW registered → go offline → navigate → verify app shell served
- Test connectivity badge: load admin panel → toggle online/offline → verify badge updates reactively
