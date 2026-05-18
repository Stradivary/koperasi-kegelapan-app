# Implementation Plan: PWA Hardening

## Overview

Convert the application from TanStack Start SSR (single Cloudflare Worker) to a fully static SPA with aggressive PWA precaching and a split deployment: Cloudflare Pages for static assets + a dedicated Hono-based API Worker. The implementation removes all SSR infrastructure, eliminates the custom service worker, and relies entirely on `vite-plugin-pwa`'s `generateSW` strategy.

## Tasks

- [ ] 1. Remove SSR infrastructure and configure SPA mode
  - [ ] 1.1 Rewrite `vite.config.ts` to SPA mode
    - Remove `@cloudflare/vite-plugin` import and `cloudflare()` plugin call
    - Remove `tanstackStart()` plugin call and `@tanstack/react-start/plugin/vite` import
    - Remove `rollupOptions.external` for `cloudflare:` modules
    - Add `TanStackRouterVite()` from `@tanstack/router-plugin/vite`
    - Add `globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,json}"]` to workbox config
    - Add `maximumFileSizeToCacheInBytes: 5 * 1024 * 1024` to workbox config
    - Change `navigateFallbackAllowlist` to `navigateFallbackDenylist: [/^\/api\//]`
    - Add dev server proxy: `"/api" → "http://localhost:8787"`
    - _Requirements: 1.1, 1.3, 1.5, 3.6, 3.7, 4.1, 4.2, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ] 1.2 Create SPA entry point `index.html` and `src/main.tsx`
    - Create `index.html` in project root with `<div id="root">` mount point, meta tags, and manifest link
    - Create `src/main.tsx` with `createRouter`, `RouterProvider`, `QueryClientProvider`, and `createRoot` render call
    - Wire up `routeTree` from generated route tree and `queryClient` from existing context provider
    - _Requirements: 1.2, 1.4_

  - [ ] 1.3 Rewrite `src/routes/__root.tsx` for SPA mode
    - Remove `HeadContent`, `Scripts`, `shellComponent` from `@tanstack/react-router`
    - Remove `useEffect` with manual `navigator.serviceWorker.register()` call
    - Change to standard `component` property with `Outlet`
    - Retain `PwaUpdatePrompt`, `PwaInstallPrompt`, `Toaster`, `TooltipProvider`
    - _Requirements: 1.4, 2.4, 7.4_

- [ ] 2. Remove custom service worker infrastructure
  - [ ] 2.1 Delete `src/sw.ts` and `scripts/build-sw.mjs`
    - Remove the custom service worker source file
    - Remove the post-build script that compiled and injected the precache manifest
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 2.2 Verify VitePWA `generateSW` + `injectRegister: 'auto'` handles registration
    - Confirm no remaining manual `navigator.serviceWorker.register()` calls exist in the codebase
    - Confirm `injectRegister: 'auto'` is set in VitePWA config (done in task 1.1)
    - _Requirements: 2.4, 2.5_

- [ ] 3. Checkpoint - Verify SPA build produces static output
  - Ensure `pnpm run build` produces a `dist/` directory with `index.html`, JS chunks, CSS, and a generated `sw.js`
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Create API Worker with Hono
  - [ ] 4.1 Set up API Worker project structure
    - Create `api/src/index.ts` with Hono app, `Env` type (`DB: D1Database`, `SESSION_MASTER_KEY: string`), and route mounting
    - Create `wrangler.api.jsonc` with D1 binding, compatibility flags, and entry point `api/src/index.ts`
    - Add `hono` dependency to `package.json`
    - _Requirements: 5.2, 5.3_

  - [ ] 4.2 Extract `/api/session-grant` handler to Hono route
    - Create `api/src/routes/session-grant.ts`
    - Port GET handler logic from `src/routes/api/session-grant.ts`
    - _Requirements: 5.1_

  - [ ] 4.3 Extract `/api/policy` handler to Hono route
    - Create `api/src/routes/policy.ts`
    - Port handler logic from `src/routes/api/policy.ts`
    - _Requirements: 5.1_

  - [ ] 4.4 Extract `/api/reconcile` handler to Hono route
    - Create `api/src/routes/reconcile.ts`
    - Port handler logic from `src/routes/api/reconcile.ts`
    - _Requirements: 5.1_

  - [ ] 4.5 Extract `/api/accounts` handler to Hono route
    - Create `api/src/routes/accounts.ts`
    - Port handler logic from `src/routes/api/accounts.ts`
    - _Requirements: 5.1_

  - [ ] 4.6 Extract `/api/auth/*` handlers to Hono route
    - Create `api/src/routes/auth.ts`
    - Port handler logic from `src/routes/api/auth/token.ts`
    - _Requirements: 5.1_

  - [ ] 4.7 Extract `/api/tenants/*` handlers to Hono routes
    - Create `api/src/routes/tenants.ts`
    - Port handler logic from `src/routes/api/tenants/sync.ts` and `src/routes/api/tenants/search.ts`
    - _Requirements: 5.1_

  - [ ] 4.8 Extract `/api/superadmin/*` handlers to Hono routes
    - Create `api/src/routes/superadmin.ts`
    - Port handler logic from `src/routes/api/superadmin/tenants/index.ts`, `$tenantId.ts`, `$tenantId.status.ts`
    - _Requirements: 5.1_

- [ ] 5. Checkpoint - Verify API Worker runs locally
  - Ensure `wrangler dev --config wrangler.api.jsonc` starts without errors
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Wire deployment configuration and cleanup
  - [ ] 6.1 Create `public/_routes.json` for Cloudflare Pages
    - Add `_routes.json` with `"include": ["/*"]` and `"exclude": ["/api/*"]`
    - This tells Pages to serve static assets and exclude API paths
    - _Requirements: 8.4_

  - [ ] 6.2 Create `src/lib/api.ts` for API base URL configuration
    - Export `API_BASE_URL` from `import.meta.env.VITE_API_BASE_URL ?? ""`
    - Empty string in dev (Vite proxy handles it), absolute URL in production if needed
    - _Requirements: 5.5_

  - [ ] 6.3 Update `package.json` scripts and dependencies
    - Remove SSR dependencies: `@tanstack/react-start`, `@cloudflare/vite-plugin`, `@tanstack/react-router-ssr-query`
    - Remove custom SW dependencies: `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response`, `workbox-build`
    - Add `hono` to dependencies
    - Keep `workbox-window` (used by `virtual:pwa-register/react`)
    - Update scripts: `dev`, `dev:api`, `build`, `deploy:pages`, `deploy:api`, `deploy`
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ] 6.4 Remove old TanStack Start API route files
    - Delete `src/routes/api/` directory (all handlers now live in `api/src/routes/`)
    - Delete old `wrangler.jsonc` (replaced by `wrangler.api.jsonc` for the API Worker)
    - _Requirements: 1.1, 5.4_

  - [ ] 6.5 Update existing `fetch()` calls to use `API_BASE_URL`
    - Update `src/hooks/useTenantSync.ts` to prefix fetch URL with `API_BASE_URL`
    - Update `src/routes/dev.nfc-test.tsx` to prefix fetch URL with `API_BASE_URL`
    - Audit for any other hardcoded `/api/` fetch calls and update them
    - _Requirements: 5.5_

- [ ] 7. Checkpoint - Full build and deployment verification
  - Ensure `pnpm run build` succeeds and `dist/` contains `index.html`, `sw.js`, all chunks, `_routes.json`
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Property-based tests for PWA correctness
  - [ ]* 8.1 Write property test for precache manifest completeness
    - **Property 1: Precache manifest completeness**
    - For any static file in the build output matching `**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,json}`, verify it appears in the generated SW precache manifest with a valid revision hash
    - Use `fast-check` to generate arbitrary file paths matching glob patterns and verify inclusion
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

  - [ ]* 8.2 Write property test for navigation fallback behavior
    - **Property 2: Navigation fallback serves SPA shell for client routes**
    - For any URL path that does NOT match `/^\/api\//`, verify the navigateFallback config resolves to `/index.html`
    - Use `fast-check` to generate arbitrary non-API URL paths and verify fallback applies
    - **Validates: Requirements 4.1, 4.3**

  - [ ]* 8.3 Write property test for API path exclusion from fallback
    - **Property 3: API paths excluded from navigation fallback**
    - For any URL path matching `/^\/api\//`, verify the navigateFallbackDenylist prevents fallback
    - Use `fast-check` to generate arbitrary `/api/*` paths and verify they are excluded
    - **Validates: Requirements 4.2**

- [ ] 9. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The API route extraction (tasks 4.2–4.8) ports existing handler logic — no new business logic is introduced
- The `workbox-window` package is retained for the `virtual:pwa-register/react` import used by `PwaUpdatePrompt`
- During development, the Vite dev server proxies `/api` to the local API Worker on port 8787

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "4.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8"] },
    { "id": 2, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 3, "tasks": ["6.4", "6.5"] },
    { "id": 4, "tasks": ["8.1", "8.2", "8.3"] }
  ]
}
```
