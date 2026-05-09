# Koperasi Kegelapan NFC Wallet

Koperasi Kegelapan is an offline-first NFC wallet application built with TanStack Start and deployed to Cloudflare Workers. It is designed for cooperative membership card operations under the `mbcs/` app.

## Getting Started

Install dependencies and start the local development server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Build and Deploy

Build the app:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run tests:

```bash
npm run test
```

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## GitHub Actions Deployment

A GitHub Actions workflow has been added at `.github/workflows/mbcs-deploy.yml`.

The workflow:

- installs dependencies with `pnpm`
- builds the app in `mbcs/`
- deploys using `wrangler deploy`

### Required repository secrets

- `CLOUDFLARE_API_TOKEN`
- `CF_ACCOUNT_ID` (if your Cloudflare account requires it)

## Environment Variables

Create a `.env.local` file with the following values:

```env
BETTER_AUTH_SECRET=
DATABASE_URL=
VITE_SENTRY_DSN=
VITE_SENTRY_ORG=
VITE_SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

## Better Auth

Generate the Better Auth secret:

```bash
npx -y @better-auth/cli secret
```

Better Auth is configured in `src/lib/auth.ts` and provides authentication for the app.

## Project Structure

Important folders in `mbcs/`:

- `src/` — application source code
- `src/routes/` — TanStack Router file-based routes
- `src/lib/` — shared utilities and auth helpers
- `src/db/` — Drizzle ORM schema and database client
- `wrangler.jsonc` — Cloudflare Workers deployment config
- `drizzle.config.ts` — Drizzle Kit configuration
- `components.json` — Shadcn UI config

## Notes

- The app uses Cloudflare Workers with `nodejs_compat` enabled.
- The `deploy` script runs `npm run build && wrangler deploy`.
- The GitHub deployment workflow is now configured for the `main` branch.
