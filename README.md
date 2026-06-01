# Koperasi Kegelapan - Offline NFC Wallet

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Stradivary_koperasi-kegelapan-app&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Stradivary_koperasi-kegelapan-app)

A tap-based payment system that operates without real-time backend connectivity. Wallet state (balance, session, tamper-evident log) is stored encrypted on NTAG215 NFC cards, allowing terminals to authorise transactions offline using cryptographic proofs.

---

## Table of Contents

- [High-Level Design (HLD)](./docs-arch/HIGH_LEVEL_DESIGN.md)
- [Security Architecture](./docs-arch/SECURITY.md)
- [Folder Structure & Clean Architecture](./docs-arch/FOLDER_STRUCTURE.md)
- [Software Quality](./docs-arch/SOFTWARE_QUALITY.md)
- [Architecture Stack](#architecture-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Routes](#api-routes)
- [Frontend Routes](#frontend-routes)
- [Database](#database)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Testing](#testing)
- [UI Components](#ui-components)
- [Documentation](#documentation)
- [CI/CD](#cicd)

---

## Architecture Stack

| Layer     | Tech                                   | Deployment         |
| --------- | -------------------------------------- | ------------------ |
| Frontend  | React 19, TanStack Router, Vite 8, PWA | Cloudflare Pages   |
| API       | Hono on Cloudflare Workers             | Cloudflare Workers |
| Database  | Drizzle ORM + Cloudflare D1 (SQLite)   | Cloudflare D1      |
| NFC       | Web NFC API (NTAG215/216)              | Browser            |
| Analytics | Cloudflare Analytics Engine            | Cloudflare Workers |

The frontend is a Progressive Web App with offline-first capabilities (vite-plugin-pwa + Workbox). The API worker handles authentication, session grants, reconciliation, and sync. Both are deployed independently to Cloudflare.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 11+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (bundled via devDependencies)
- An NFC-capable Android device (for Web NFC features - Chrome only)

## Getting Started

```bash
pnpm install
```

Start the frontend dev server (port 3000) and API worker (port 8787) in separate terminals:

```bash
pnpm dev
pnpm dev:api
```

The frontend proxies `/api` requests to the local worker automatically via Vite's dev server proxy.

## Project Structure

```
koperasi-kegelapan/
├── api/src/               # Hono API worker (Cloudflare Workers)
│   ├── lib/               # Shared utilities (logger, token extraction)
│   ├── middleware/         # CORS, device block, rate limiting, analytics
│   └── routes/            # API route handlers (11 route modules)
├── src/                   # React frontend (SPA)
│   ├── components/        # UI components (atomic design)
│   │   ├── ui/            # Shadcn/Radix primitives
│   │   ├── block/         # Composed UI blocks
│   │   ├── layout/        # Layout shells (admin, kiosk)
│   │   └── section/       # Page-level sections
│   ├── core/              # Domain logic
│   │   ├── crypto/        # AES-GCM, HKDF, HMAC, PBKDF2
│   │   ├── nfc/           # NFC adapters, engine, pipeline
│   │   ├── payload/       # Card binary encode/decode (496-byte format)
│   │   ├── state-machine/ # Card state transitions
│   │   └── validation/    # Card and transaction validation
│   ├── db/                # Database schemas (Drizzle + Dexie/IndexedDB)
│   ├── domain/            # Domain models (card, member, transaction)
│   ├── hooks/             # React hooks (NFC, sync, auth, etc.)
│   ├── integrations/      # External service integrations (TanStack Query)
│   ├── lib/               # Utilities (sync, device, error tracking, etc.)
│   ├── routes/            # TanStack Router file-based routes
│   └── server/            # Server-side functions (auth, sync, reconcile)
├── drizzle/               # D1 migration files
├── e2e/                   # Playwright end-to-end tests
├── docs/                  # Specification docs (git submodule)
├── docs-arch/             # Architecture documentation (HLD, Security, etc.)
├── public/                # Static assets, PWA icons, manifest
├── wrangler.jsonc         # Cloudflare Pages config
└── wrangler.api.jsonc     # Cloudflare Workers config (D1, Analytics Engine)
```

## API Routes

The Hono API worker exposes the following route groups:

| Route                     | Description                                   |
| ------------------------- | --------------------------------------------- |
| `/api/auth`               | Login, token refresh, logout                  |
| `/api/accounts`           | Account CRUD (admin/operator accounts)        |
| `/api/cards`              | Card registration, status, balance management |
| `/api/session-grant`      | Session grant issuance for offline operations |
| `/api/policy`             | Tenant policy distribution                    |
| `/api/reconcile`          | Offline transaction reconciliation            |
| `/api/sync`               | Bidirectional sync (push/pull)                |
| `/api/sync/sse`           | Real-time sync events (Server-Sent Events)    |
| `/api/sync/push-entities` | Entity push (members, cards)                  |
| `/api/tenants`            | Tenant management                             |
| `/api/superadmin`         | Cross-tenant superadmin operations            |
| `/api/client-errors`      | Client error reporting (Analytics Engine)     |

Middleware applied globally: CORS, device block enforcement.
Middleware applied to sync routes: rate limiting (60 req/min per device), analytics tracking.

## Frontend Routes

| Route Pattern                                 | Description                    |
| --------------------------------------------- | ------------------------------ |
| `/`                                           | Login / tenant selection       |
| `/tenant/:tenantId/admin/*`                   | Admin layout (redirect)        |
| `/tenant/:tenantId/_adminLayout/cards`        | Card management                |
| `/tenant/:tenantId/_adminLayout/members`      | Member management              |
| `/tenant/:tenantId/_adminLayout/transactions` | Transaction log                |
| `/tenant/:tenantId/_adminLayout/settings`     | Tenant settings                |
| `/tenant/:tenantId/_kioskLayout/gate`         | Gate check-in/out              |
| `/tenant/:tenantId/_kioskLayout/terminal`     | Terminal (debit/checkout)      |
| `/tenant/:tenantId/_kioskLayout/kiosk`        | Kiosk (top-up)                 |
| `/tenant/:tenantId/_kioskLayout/scout`        | Scout (read-only balance)      |
| `/superadmin`                                 | Superadmin panel               |
| `/devices`                                    | Device management              |
| `/dev/*`                                      | Dev/test pages (NFC, issuance) |

## Database

The API uses Cloudflare D1 with Drizzle ORM. Schema is defined in `src/db/schema.ts` with 11 tables:

`tenants`, `accounts`, `users`, `cards`, `sessionGrants`, `auditLog`, `devices`, `authSessions`, `transactionLog`, `syncCursors`, `cardEvents`

Migrations live in `drizzle/`.

### Local D1 (development)

```bash
pnpm db:generate          # Generate migrations from schema
pnpm db:local:migrate     # Apply migrations to local D1
pnpm db:seed              # Seed local database
```

### Remote D1 (production)

```bash
pnpm db:remote:migrate    # Apply migrations to remote D1
```

### Reset local state

```bash
rm -rf .wrangler/state
pnpm db:local:migrate
```

## Scripts

| Command               | Description                           |
| --------------------- | ------------------------------------- |
| `pnpm dev`            | Start frontend dev server (port 3000) |
| `pnpm dev:api`        | Start API worker locally (port 8787)  |
| `pnpm build`          | Build frontend for production         |
| `pnpm build:api`      | Dry-run API worker build              |
| `pnpm test`           | Run unit tests (Vitest)               |
| `pnpm test:coverage`  | Run tests with coverage               |
| `pnpm e2e`            | Run Playwright end-to-end tests       |
| `pnpm e2e:ui`         | Run Playwright with UI                |
| `pnpm lint`           | Lint with oxlint                      |
| `pnpm lint:fix`       | Lint and auto-fix                     |
| `pnpm format`         | Format with oxfmt                     |
| `pnpm format:check`   | Check formatting without changes      |
| `pnpm typecheck`      | TypeScript type checking              |
| `pnpm deploy`         | Deploy both Pages and API             |
| `pnpm deploy:pages`   | Build + deploy frontend only          |
| `pnpm deploy:api`     | Deploy API worker only                |
| `pnpm db:generate`    | Generate Drizzle migrations           |
| `pnpm db:seed`        | Seed local database                   |
| `pnpm db:seed:remote` | Seed remote database                  |
| `pnpm db:studio`      | Open Drizzle Studio                   |

## Deployment

Frontend deploys to Cloudflare Pages, API deploys as a Cloudflare Worker:

```bash
pnpm deploy:pages    # Build + deploy frontend
pnpm deploy:api      # Deploy API worker
pnpm deploy          # Both
```

For production secrets (e.g. `SESSION_MASTER_KEY`), use:

```bash
wrangler secret put SESSION_MASTER_KEY --config wrangler.api.jsonc
```

## Testing

- **Unit tests**: Vitest + fast-check (property-based) - `pnpm test`
- **E2E tests**: Playwright (11 spec files) - `pnpm e2e`

E2E test coverage includes: login flows, admin navigation, card management, member management, transactions, settings, role routing, superadmin, API auth, and API sync.
