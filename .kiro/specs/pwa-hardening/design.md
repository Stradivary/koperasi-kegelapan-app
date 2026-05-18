# Design Document: PWA Hardening

## Overview

This design converts the application from a TanStack Start SSR deployment (single Cloudflare Worker) into a fully static SPA with aggressive PWA precaching. The architecture splits into two independently deployable units: a static SPA on Cloudflare Pages and a dedicated API Worker for backend routes.

The key architectural change is removing all server-side rendering infrastructure and relying entirely on `vite-plugin-pwa`'s `generateSW` strategy for service worker management — eliminating the custom `src/sw.ts` and `scripts/build-sw.mjs` build pipeline.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Client)                       │
│                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────┐  │
│  │ TanStack     │   │ Service      │   │ IndexedDB  │  │
│  │ Router (SPA) │   │ Worker (gen) │   │ (Dexie)    │  │
│  └──────┬───────┘   └──────┬───────┘   └────────────┘  │
│         │                   │                            │
│         │  navigateFallback │  precache all assets       │
│         │  → index.html     │  at install time           │
└─────────┼───────────────────┼────────────────────────────┘
          │                   │
          │ /api/* requests   │ static assets (cache-first)
          ▼                   ▼
┌──────────────────┐  ┌──────────────────────────┐
│  API Worker      │  │  Cloudflare Pages        │
│  (wrangler.api)  │  │  (static dist/)          │
│                  │  │                          │
│  • /api/auth/*   │  │  • index.html            │
│  • /api/session  │  │  • *.js chunks           │
│  • /api/policy   │  │  • *.css                 │
│  • /api/reconcile│  │  • fonts, images         │
│  • /api/tenants/*│  │  • sw.js (generated)     │
│  • /api/super*   │  │  • manifest.webmanifest  │
│                  │  │                          │
│  D1 binding (DB) │  │  _routes.json (proxy)    │
└──────────────────┘  └──────────────────────────┘
```

## Components

### 1. Vite Configuration (SPA Mode)

The `vite.config.ts` is simplified to produce a static SPA build. SSR plugins are removed; the TanStack Router plugin replaces TanStack Start.

**Target `vite.config.ts`:**

```typescript
import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";

const config = defineConfig({
  plugins: [
    devtools(),
    basicSsl(),
    tailwindcss(),
    TanStackRouterVite(),
    viteReact(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      strategies: "generateSW",
      includeAssets: [
        "favicon.ico",
        "logo192.png",
        "logo512.png",
        "assets/TelkomselBatikSans-Bold.woff2",
        "assets/TelkomselBatikSans-Regular.woff2",
      ],
      manifest: {
        name: "Koperasi Kegelapan",
        short_name: "KK Wallet",
        description: "Dompet NFC Koperasi — By Telkomsel",
        theme_color: "#FF0025",
        background_color: "#001A41",
        display: "fullscreen",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "favicon.ico", sizes: "64x64 32x32 24x24 16x16", type: "image/x-icon" },
          { src: "logo192.png", type: "image/png", sizes: "192x192" },
          { src: "logo512.png", type: "image/png", sizes: "512x512", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,json}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
      devOptions: {
        enabled: process.env.PWA_DEV === "1",
      },
    }),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});

export default config;
```

**Key changes from current config:**
- Removed: `@cloudflare/vite-plugin` import and `cloudflare()` plugin
- Removed: `tanstackStart()` plugin
- Removed: `rollupOptions.external` for `cloudflare:` modules
- Added: `TanStackRouterVite()` from `@tanstack/router-plugin/vite`
- Added: `globPatterns` to workbox config for comprehensive precaching
- Added: `maximumFileSizeToCacheInBytes` for large chunk support
- Added: dev proxy for `/api` to local API Worker
- Changed: `navigateFallbackAllowlist` → `navigateFallbackDenylist` (simpler deny pattern)

### 2. Router Configuration (SPA Mode)

The root route changes from `@tanstack/react-start` SSR shell to a standard `@tanstack/react-router` SPA entry.

**Root route (`src/routes/__root.tsx`):**

```typescript
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body>
        <Outlet />
        <PwaUpdatePrompt />
        <PwaInstallPrompt />
        <Toaster />
      </body>
    </html>
  );
}
```

**Key changes:**
- Removed: `HeadContent`, `Scripts`, `shellComponent` from `@tanstack/react-start`
- Removed: Manual `navigator.serviceWorker.register()` call in `useEffect`
- Added: Standard `component` property with `Outlet`
- The `index.html` in `public/` or generated by Vite serves as the SPA shell

**SPA entry point (`src/main.tsx`):**

```typescript
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { createRoot } from "react-dom/client";

const { queryClient } = getContext();

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
```

### 3. Service Worker (Generated)

The service worker is entirely generated by `vite-plugin-pwa` using the `generateSW` strategy. No custom SW source file exists.

**Generated SW behavior (configured via workbox options):**
- Precaches all static assets matching `globPatterns` at install time
- Serves `index.html` for all navigation requests not matching `/api/`
- Uses `NetworkFirst` runtime caching for API requests with 5s timeout
- Handles `skipWaiting` automatically via `registerType: 'autoUpdate'`

**Registration:** Handled by `injectRegister: 'auto'` — the plugin injects a registration script into the HTML output. No manual `navigator.serviceWorker.register()` in application code.

### 4. API Worker

The API Worker is a standalone Cloudflare Worker that handles all `/api/*` routes. It uses the existing route handlers extracted from the TanStack Start server functions.

**Entry point (`api/src/index.ts`):**

```typescript
import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import { sessionGrantRoute } from "./routes/session-grant";
import { policyRoute } from "./routes/policy";
import { reconcileRoute } from "./routes/reconcile";
import { tenantsRoutes } from "./routes/tenants";
import { superadminRoutes } from "./routes/superadmin";
import { accountsRoutes } from "./routes/accounts";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

app.route("/api/auth", authRoutes);
app.route("/api/session-grant", sessionGrantRoute);
app.route("/api/policy", policyRoute);
app.route("/api/reconcile", reconcileRoute);
app.route("/api/tenants", tenantsRoutes);
app.route("/api/superadmin", superadminRoutes);
app.route("/api/accounts", accountsRoutes);

export default app;
```

### 5. Deployment Configuration

**Cloudflare Pages (`wrangler.jsonc` — Pages project):**

The Pages deployment is configured via the Cloudflare dashboard or `wrangler pages deploy`. The build output directory is `dist/`.

**`_routes.json` (in `public/` directory, copied to `dist/`):**

```json
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/api/*"]
}
```

This tells Cloudflare Pages to serve static assets for all paths except `/api/*`, which are proxied to the API Worker via a Pages Function or external service binding.

**API Worker (`wrangler.api.jsonc`):**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "koperasi-kegelapan-api",
  "compatibility_date": "2025-09-02",
  "compatibility_flags": ["nodejs_compat"],
  "main": "api/src/index.ts",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "koperasi-kegelapan",
      "database_id": "62122eed-8454-4751-986d-6dcf12fb3d2e",
      "migrations_dir": "drizzle"
    }
  ],
  "vars": {
    "SESSION_MASTER_KEY": "override-in-secrets"
  }
}
```

### 6. Package.json Changes

**Dependencies to remove:**
- `@tanstack/react-start`
- `@cloudflare/vite-plugin`
- `@tanstack/react-router-ssr-query`
- `workbox-precaching` (no longer imported in app code)
- `workbox-routing` (no longer imported in app code)
- `workbox-strategies` (no longer imported in app code)
- `workbox-expiration` (no longer imported in app code)
- `workbox-cacheable-response` (no longer imported in app code)
- `workbox-build` (no longer needed for custom build script)

**Dependencies to add:**
- `hono` (API Worker framework)

**Dependencies to keep:**
- `@tanstack/react-router` (already present)
- `@tanstack/router-plugin` (already present)
- `vite-plugin-pwa` (already present)
- `workbox-window` (used by `virtual:pwa-register/react`)

**Scripts changes:**

```json
{
  "scripts": {
    "dev": "vite --port 3000",
    "dev:api": "wrangler dev --config wrangler.api.jsonc --port 8787",
    "build": "vite build",
    "build:api": "wrangler deploy --config wrangler.api.jsonc --dry-run",
    "preview": "vite preview",
    "deploy:pages": "pnpm run build && wrangler pages deploy dist/",
    "deploy:api": "wrangler deploy --config wrangler.api.jsonc",
    "deploy": "pnpm run deploy:pages && pnpm run deploy:api"
  }
}
```

### 7. API Base URL Configuration

The SPA needs to know where the API Worker lives. This is handled via a build-time environment variable:

**`src/lib/api.ts`:**

```typescript
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
```

- In development: empty string (requests go to `/api/*` via Vite proxy)
- In production: either empty (if Pages proxies to Worker) or the Worker's URL (e.g., `https://koperasi-kegelapan-api.workers.dev`)

## Interfaces

### VitePWA Plugin Configuration Interface

```typescript
interface PwaConfig {
  registerType: "autoUpdate";
  injectRegister: "auto";
  strategies: "generateSW";
  includeAssets: string[];
  manifest: WebAppManifest;
  workbox: {
    globPatterns: string[];
    maximumFileSizeToCacheInBytes: number;
    navigateFallback: string;
    navigateFallbackDenylist: RegExp[];
    runtimeCaching: RuntimeCachingEntry[];
  };
  devOptions: { enabled: boolean };
}
```

### API Worker Env Interface

```typescript
interface Env {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
}
```

### Router Context Interface

```typescript
interface MyRouterContext {
  queryClient: QueryClient;
}
```

## Data Models

No data model changes. The D1 database schema, IndexedDB (Dexie) stores, and all domain models remain unchanged. The only change is the transport layer — API requests now target a separate Worker instead of same-origin server functions.

## Error Handling

### Offline Navigation
- All navigation requests to client routes return the cached `index.html` shell
- The SPA router renders the appropriate route component from precached JS chunks
- If a required chunk is somehow missing from cache, the router's error boundary displays a "please reconnect" message

### API Failures (Offline)
- API requests use `NetworkFirst` with 5-second timeout
- On timeout/failure, cached responses are served if available
- The existing outbox pattern (IndexedDB queue → reconcile on reconnect) handles write operations
- `networkMode: "always"` on TanStack Query ensures queries execute regardless of `navigator.onLine`

### Service Worker Update Failures
- If the new SW fails to install, the old SW continues serving cached assets
- The `PwaUpdatePrompt` component only shows when `needRefresh` is true (new SW waiting)
- Users can dismiss the prompt and continue using the current version

### Build Output Validation
- The `vite-plugin-pwa` plugin validates the manifest at build time
- Missing assets referenced in `includeAssets` produce build warnings
- The `maximumFileSizeToCacheInBytes` threshold prevents silent exclusion of large chunks

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Precache manifest completeness

*For any* static file in the Vite build output directory matching the configured glob patterns (`**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,json}`), that file SHALL appear in the generated precache manifest with a valid revision hash.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

### Property 2: Navigation fallback serves SPA shell for client routes

*For any* URL path that does NOT match the denylist pattern `/^\/api\//`, the service worker's `navigateFallback` configuration SHALL resolve to `/index.html`, enabling offline client-side routing.

**Validates: Requirements 4.1, 4.3**

### Property 3: API paths excluded from navigation fallback

*For any* URL path matching the pattern `/^\/api\//`, the service worker SHALL NOT apply the navigation fallback and SHALL instead pass the request through to the network (or runtime cache).

**Validates: Requirements 4.2**
