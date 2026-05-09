<!-- intent-skills:start -->
## Skill Loading

Before substantial work:
- Skill check: run `npx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `npx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# AGENTS.md — Membership Benefit Card (MBC) System

## Project Overview

Full-stack, offline-first, multi-tenant platform managing NFC-based membership cards for cooperatives (koperasi). Members tap NFC cards at physical terminals to check in/out with usage-based tariff deduction from prepaid balance.

## Scaffolding Command

```bash
npx @tanstack/cli@latest create my-tanstack-app --agent --tailwind --add-ons better-auth,neon,form,sentry,shadcn,tanstack-query,drizzle,cloudflare
```

Template: SaaS Starter (React)

## Chosen Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | TanStack Start (React) | 1.167.x |
| Router | TanStack Router (file-based) | latest |
| UI | Tailwind CSS v4 + Shadcn UI + Radix UI | 4.1.x |
| Forms | TanStack Form | latest |
| Data Fetching | TanStack Query | latest |
| ORM | Drizzle ORM | 0.45.x |
| Database | PostgreSQL via Neon | — |
| Auth | Better Auth | 1.5.x |
| Monitoring | Sentry | 10.42.x |
| Validation | Zod v4 | 4.3.x |
| Deployment | Cloudflare Workers | — |
| Package Manager | pnpm | 10.x |
| Language | TypeScript | 6.x |
| Build | Vite 8 + Nitro | — |

## Integrations

- **Better Auth**: Email/password auth with TanStack Start cookie plugin. Server config at `src/lib/auth.ts`, client at `src/lib/auth-client.ts`.
- **Neon**: Serverless PostgreSQL. Connection via `DATABASE_URL` env var.
- **TanStack Form**: Client-side form management with Zod validation.
- **Sentry**: Error tracking and performance monitoring. Auto-configured in `src/router.tsx` and `instrument.server.mjs`.
- **Shadcn UI**: Component library. Add components with `pnpm dlx shadcn@latest add <component>`. Config at `components.json`.
- **TanStack Query**: Server state management with SSR integration via `@tanstack/react-router-ssr-query`.
- **Drizzle ORM**: Type-safe SQL with PostgreSQL dialect. Schema at `src/db/schema.ts`, config at `drizzle.config.ts`.
- **Cloudflare Workers**: Edge deployment via `@cloudflare/vite-plugin` and `wrangler`. Config at `wrangler.jsonc`.

## Environment Variables

```env
# Sentry
VITE_SENTRY_DSN=           # Sentry DSN (from Sentry dashboard)
VITE_SENTRY_ORG=           # Sentry organization slug
VITE_SENTRY_PROJECT=       # Sentry project slug
SENTRY_AUTH_TOKEN=         # Sentry auth token for source maps

# Better Auth
BETTER_AUTH_URL=http://localhost:3000   # App URL
BETTER_AUTH_SECRET=                     # Generate: npx -y @better-auth/cli secret

# Database
DATABASE_URL="postgresql://username:password@localhost:5432/mydb"  # Neon connection string
```

All env vars go in `.env.local` (gitignored). For Cloudflare deployment, set secrets via `wrangler secret put <KEY>`.

## Key Scripts

| Script | Command | Purpose |
|---|---|---|
| Dev server | `pnpm run dev` | Start dev server on port 3000 |
| Build | `pnpm run build` | Production build |
| Preview | `pnpm run preview` | Preview production build |
| Test | `pnpm run test` | Run Vitest |
| Deploy | `pnpm run deploy` | Build + deploy to Cloudflare |
| DB Generate | `pnpm run db:generate` | Generate Drizzle migrations |
| DB Migrate | `pnpm run db:migrate` | Run migrations |
| DB Push | `pnpm run db:push` | Push schema to DB (dev) |
| DB Studio | `pnpm run db:studio` | Open Drizzle Studio |

## Project Structure

```
mbcs/
├── src/
│   ├── components/          # Shared UI components
│   │   └── ui/              # Shadcn UI components
│   ├── db/
│   │   ├── index.ts         # Drizzle client instance
│   │   └── schema.ts        # Drizzle schema definitions
│   ├── hooks/               # Custom React hooks
│   ├── integrations/
│   │   ├── better-auth/     # Auth UI components
│   │   └── tanstack-query/  # Query provider + devtools
│   ├── lib/
│   │   ├── auth.ts          # Better Auth server config
│   │   ├── auth-client.ts   # Better Auth client
│   │   └── utils.ts         # cn() utility
│   ├── routes/
│   │   ├── api/auth/        # Auth API routes
│   │   ├── demo/            # Demo pages (can be removed)
│   │   ├── __root.tsx       # Root layout (HTML shell)
│   │   ├── index.tsx        # Home page
│   │   └── about.tsx        # About page
│   ├── router.tsx           # Router factory with Query integration
│   └── styles.css           # Global styles (Tailwind)
├── public/                  # Static assets
├── drizzle/                 # Generated migrations (after db:generate)
├── .env.local               # Environment variables (gitignored)
├── components.json          # Shadcn UI config
├── drizzle.config.ts        # Drizzle Kit config
├── instrument.server.mjs    # Sentry server instrumentation
├── tsconfig.json            # TypeScript config
├── vite.config.ts           # Vite + plugins config
├── wrangler.jsonc           # Cloudflare Workers config
└── package.json             # Dependencies and scripts
```

## Architectural Decisions

1. **Isomorphic by default**: All TanStack Start code runs on both server and client. Use `createServerFn` for server-only operations (DB queries, secrets, encryption).
2. **File-based routing**: Routes are defined by file structure in `src/routes/`. The route tree is auto-generated in `routeTree.gen.ts`.
3. **SSR with Query integration**: TanStack Query is integrated with the router via `setupRouterSsrQueryIntegration` for automatic SSR data hydration.
4. **Cloudflare Workers deployment**: The app runs on Cloudflare's edge network. `nodejs_compat` flag is enabled for Node.js API compatibility.
5. **Drizzle + Neon**: Type-safe ORM with serverless PostgreSQL. Schema changes go through `db:generate` → `db:push` workflow.
6. **Vite plugin order matters**: In `vite.config.ts`, `tanstackStart()` must come before `viteReact()`. The Cloudflare and Nitro plugins are also configured.

## Deployment Notes

- Target: Cloudflare Workers
- `wrangler.jsonc` sets `compatibility_date: "2025-09-02"` and `nodejs_compat` flag
- Deploy with `pnpm run deploy` (runs `vite build && wrangler deploy`)
- First deploy requires `npx wrangler login` for authentication
- Environment secrets: use `wrangler secret put <KEY>` for production env vars
- The `instrument.server.mjs` is copied to `.output/server` during build for Sentry

## Known Gotchas

1. **verbatimModuleSyntax is enabled** in `tsconfig.json` — the TanStack Start skill warns this can leak server bundles into client. Monitor for issues; may need to disable.
2. **Drizzle config type error**: `process.env.DATABASE_URL` can be `undefined`. The app will fail at runtime if `DATABASE_URL` is not set. This is expected — set it in `.env.local`.
3. **Nitro is pinned to nightly**: `"nitro": "npm:nitro-nightly@latest"` — this is intentional per the TanStack CLI scaffold.
4. **Build scripts need approval**: After fresh `pnpm install`, run `pnpm approve-builds` to allow `@sentry/cli`, `sharp`, and `workerd` post-install scripts.
5. **Dev script uses dotenv-cli**: The dev command wraps with `dotenv -e .env.local` to load env vars. This is a bash command — on Windows, use Git Bash or WSL.
6. **Sentry DSN optional**: If `VITE_SENTRY_DSN` is not set, Sentry logs a warning but the app runs fine.

## Next Steps

1. Set up Neon database and configure `DATABASE_URL` in `.env.local`
2. Generate `BETTER_AUTH_SECRET` with `npx -y @better-auth/cli secret`
3. Define the MBC domain schema in `src/db/schema.ts` (tenants, members, transactions, etc.)
4. Run `pnpm run db:generate` and `pnpm run db:push` to create tables
5. Implement multi-tenant routing middleware
6. Build NFC card operations core library (client-side encryption/decryption)
7. Create terminal UIs (Gate, Terminal, Station, Scout)
8. Set up Sentry DSN for error monitoring
9. Deploy to Cloudflare Workers with `pnpm run deploy`

## TanStack Intent Skills (32 available)

Key skills for this project:
- `@tanstack/start-client-core#start-core` — Core Start patterns
- `@tanstack/start-client-core#start-core/server-functions` — createServerFn for DB/auth
- `@tanstack/start-client-core#start-core/middleware` — Request middleware, auth guards
- `@tanstack/start-client-core#start-core/deployment` — Cloudflare Workers deployment
- `@tanstack/start-client-core#start-core/server-routes` — REST API endpoints
- `@tanstack/router-core#router-core/auth-and-guards` — Route protection
- `@tanstack/router-core#router-core/data-loading` — Loaders, caching, pending states
- `@tanstack/devtools-vite#devtools-vite-plugin` — Devtools configuration
- `dotenv#dotenv` — Environment variable management

Load a skill before making changes in its domain:
```bash
npx @tanstack/intent@latest load <package>#<skill>
```
