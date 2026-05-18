# Bugfix Requirements Document

## Introduction

The PWA does not function correctly in offline-first mode. When a user has a local-only account stored in IndexedDB, login should succeed with zero network connectivity. Currently, the unified login flow in `LoginSection.tsx` always attempts a server fetch as fallback — and when that fetch throws (no network), the catch block displays a connectivity error ("Gagal terhubung ke server") even though local login may have already been attempted or the user only has a local account. Additionally, the `useSessionGrant` hook has no offline fallback, the service worker registration is conditional on component mounting, and dev-mode PWA testing is disabled.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a local account exists in IndexedDB AND the device is offline AND the user submits correct local credentials THEN the system attempts a server fetch after local login succeeds, the fetch throws a network error, and the catch block displays "Gagal terhubung ke server" instead of completing the login

1.2 WHEN a local account exists in IndexedDB AND the device is offline AND the user submits incorrect credentials THEN the system attempts a server fetch, the fetch throws a network error, and the catch block displays "Gagal terhubung ke server" instead of "Username atau password salah"

1.3 WHEN the device is offline AND the user has previously obtained a session grant THEN the `useSessionGrant` hook fails entirely because `fetchSessionGrant` only uses network fetch with no cached/local fallback

1.4 WHEN the service worker has not yet been registered AND the `PwaUpdatePrompt` component has not mounted THEN the app has no service worker active and cannot serve cached assets offline

1.5 WHEN developing locally AND `devOptions.enabled` is `false` in VitePWA config THEN the service worker is never registered in development, making offline-first behavior impossible to test during development

1.6 WHEN the device is offline AND the admin is using the admin panel THEN there is no visual indicator of the connectivity status, leaving the admin unaware of whether the app is operating in offline mode

1.7 WHEN the device is offline AND the user navigates to any app route THEN the browser may show the default offline/dinosaur page instead of the cached app shell, because the service worker does not guarantee full app shell caching or proper offline navigation fallback

### Expected Behavior (Correct)

2.1 WHEN a local account exists in IndexedDB AND the device is offline AND the user submits correct local credentials THEN the system SHALL complete the login successfully using only the local PBKDF2 verification, store the tenant context, and redirect to the appropriate role route without attempting any network request

2.2 WHEN a local account exists in IndexedDB AND the device is offline AND the user submits incorrect credentials THEN the system SHALL display "Username atau password salah" without attempting a network request and without showing a connectivity error

2.3 WHEN the device is offline AND a previously-fetched session grant is cached locally (in IndexedDB or service worker cache) AND the grant has not expired THEN the system SHALL return the cached session grant instead of failing with a network error

2.4 WHEN the app loads for the first time THEN the system SHALL register the service worker eagerly (not dependent on a specific component mounting) so that subsequent visits can be served from cache even if the UI tree changes

2.5 WHEN developing locally AND the developer needs to test offline behavior THEN the system SHALL allow enabling the service worker in development mode via configuration (e.g., environment variable or `devOptions.enabled: true`)

2.6 WHEN the device is offline AND the admin is using the admin panel THEN the system SHALL display a visible online/offline status badge in the admin panel sidebar indicating the current connectivity state (e.g., a green dot for online, a red/gray dot for offline)

2.7 WHEN the device is offline AND the user navigates to any app route THEN the system SHALL always serve the cached app shell (HTML, JS, CSS, fonts, icons) from the service worker cache — the browser's default offline page SHALL never be shown once the PWA has been loaded at least once while online

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the device is online AND the user submits credentials that match a server account but not a local account THEN the system SHALL CONTINUE TO authenticate via the server `/api/auth/token` endpoint and redirect to the appropriate role

3.2 WHEN the device is online AND the user submits credentials that match both a local account and a server account THEN the system SHALL CONTINUE TO prefer the local login result (local-first) and redirect without waiting for the server

3.3 WHEN the device is online AND a session grant is requested THEN the system SHALL CONTINUE TO fetch a fresh session grant from the server and cache it for offline use

3.4 WHEN the service worker detects a new version is available THEN the system SHALL CONTINUE TO show the update prompt allowing the user to install the update

3.5 WHEN the device is online AND the user clicks "Hubungkan ke Server" THEN the system SHALL CONTINUE TO navigate to the server tenant selection flow as before

3.6 WHEN the app is built for production THEN the service worker SHALL CONTINUE TO precache all static assets and use the existing workbox routing strategies for API and navigation requests

3.7 WHEN the device is online AND the admin is using the admin panel THEN the system SHALL CONTINUE TO display the online status badge showing the connected state

3.8 WHEN the device is online AND the user navigates to any app route THEN the system SHALL CONTINUE TO fetch fresh content from the network (using NetworkFirst strategy) while updating the cache for future offline use
