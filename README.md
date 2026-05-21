# Koperasi Kegelapan — Offline NFC Wallet

A tap-based payment system that operates without real-time backend connectivity. Wallet state (balance, session, tamper-evident log) is stored encrypted on NTAG215 NFC cards, allowing terminals to authorise transactions offline using cryptographic proofs.

## Architecture

| Layer    | Tech                                 | Deployment         |
| -------- | ------------------------------------ | ------------------ |
| Frontend | React 19, TanStack Router, Vite, PWA | Cloudflare Pages   |
| API      | Hono on Cloudflare Workers           | Cloudflare Workers |
| Database | Drizzle ORM + Cloudflare D1 (SQLite) | Cloudflare D1      |
| NFC      | Web NFC API (NTAG215/216)            | Browser            |

The frontend is a Progressive Web App with offline-first capabilities. The API worker handles session grants, reconciliation, and sync. Both are deployed independently to Cloudflare.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm i -g wrangler`)
- An NFC-capable Android device (for Web NFC features)

## Getting Started

```bash
pnpm install
```

Start the frontend dev server (port 3000) and API worker (port 8787) in separate terminals:

```bash
pnpm dev
pnpm dev:api
```

The frontend proxies `/api` requests to the local worker automatically.

## Project Structure

```
mbcs/
├── api/src/           # Hono API worker (Cloudflare Workers)
│   ├── middleware/    # Auth, validation middleware
│   ├── routes/        # API route handlers
│   └── lib/           # Shared utilities
├── src/               # React frontend (SPA)
│   ├── components/    # UI components (Shadcn/Radix)
│   ├── core/          # Domain logic (card ops, crypto)
│   ├── db/            # Local IndexedDB/Dexie schemas
│   ├── hooks/         # React hooks (NFC, sync, etc.)
│   ├── integrations/  # External service integrations
│   ├── lib/           # Utilities, error tracking
│   ├── routes/        # TanStack file-based routes
│   └── server/        # Server functions
├── drizzle/           # D1 migration files
├── e2e/               # Playwright end-to-end tests
├── public/            # Static assets, PWA icons
└── wrangler.api.jsonc # Workers config (D1, Analytics Engine)
```

## Database

The API uses Cloudflare D1 with Drizzle ORM. Migrations live in `drizzle/`.

### Local D1 (development)

```bash
pnpm db:generate          # Generate migrations from schema
pnpm db:local:migrate     # Apply migrations to local D1
pnpm db:seed              # Seed local database
```

Query local D1:

```bash
pnpm db:local:query -- "SELECT name FROM sqlite_master WHERE type='table';"
```

### Remote D1 (production)

```bash
pnpm db:remote:migrate    # Apply migrations to remote D1
pnpm db:remote:query -- "SELECT name FROM sqlite_master WHERE type='table';"
```

### Reset local state

```bash
rm -rf .wrangler/state
pnpm db:local:migrate
```

## Scripts

| Command              | Description                           |
| -------------------- | ------------------------------------- |
| `pnpm dev`           | Start frontend dev server (port 3000) |
| `pnpm dev:api`       | Start API worker locally (port 8787)  |
| `pnpm build`         | Build frontend for production         |
| `pnpm build:api`     | Dry-run API worker build              |
| `pnpm test`          | Run unit tests (Vitest)               |
| `pnpm test:coverage` | Run tests with coverage               |
| `pnpm e2e`           | Run Playwright end-to-end tests       |
| `pnpm e2e:ui`        | Run Playwright with UI                |
| `pnpm lint`          | Lint with oxlint                      |
| `pnpm lint:fix`      | Lint and auto-fix                     |
| `pnpm format`        | Format with oxfmt                     |
| `pnpm typecheck`     | TypeScript type checking              |
| `pnpm deploy`        | Deploy both Pages and API             |

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

- **Unit tests**: Vitest — `pnpm test`
- **E2E tests**: Playwright — `pnpm e2e`

## UI Components

Uses [Shadcn UI](https://ui.shadcn.com/) with Radix primitives and Tailwind CSS v4.

```bash
pnpm dlx shadcn@latest add button
```

## Documentation

Full system specifications live in the `docs/` submodule, covering product spec, system design, tech specs, API spec, data spec, security spec, and ADRs.

## License

Private — all rights reserved.
