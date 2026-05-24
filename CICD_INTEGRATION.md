# CI/CD Integration Guide

## Architecture Overview

```
push / PR
   │
   ├─► ci-test.yml          ← lint (oxlint), typecheck, unit tests, e2e
   │       │
   │   (success on master)
   │       │
   └─► deploy.yml           ← build + wrangler deploy → Cloudflare Workers

push / PR / weekly schedule
   │
   └─► static-analysis.yml  ← npm audit, OWASP Dependency-Check, SonarCloud
```

---

## 1. Local pre-commit hooks (Husky + lint-staged)

Run once after cloning to activate hooks:

```sh
pnpm install        # triggers `prepare` which runs `husky`
```

Every `git commit` will automatically run `lint-staged`:

- **`.ts` / `.tsx` / `.js` / `.jsx`** — `oxlint --fix` then `oxfmt`
- **`.json` / `.md` / `.css` / `.html` / `.yaml` / `.toml`** — `oxfmt`

If lint or format fails the commit is aborted. Fix errors then re-commit.

---

## 2. GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret                  | How to get it                                                                                              | Used by               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare Dashboard → My Profile → API Tokens → Create Token (use the "Edit Cloudflare Workers" template) | `deploy.yml`          |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → right sidebar on any page                                                           | `deploy.yml`          |
| `SONAR_TOKEN`           | SonarCloud → My Account → Security → Generate Token                                                        | `static-analysis.yml` |

`GITHUB_TOKEN` is automatically provided by GitHub — no action needed.

---

## 3. SonarCloud Setup

1. Sign in at <https://sonarcloud.io> with your GitHub account.
2. Click **+** → **Analyze new project** → import `stradivary/koperasi-kegelapan`.
3. Choose **GitHub Actions** as the analysis method.
4. Copy the generated token and add it as `SONAR_TOKEN` (see table above).
5. Verify the values in `sonar-project.properties`:

```properties
sonar.projectKey=stradivary_koperasi-kegelapan
sonar.organization=stradivary   # must match your SonarCloud org slug
```

Coverage is fed automatically — the `unit-test` job in `ci-test.yml` uploads
`coverage/lcov.info` which SonarCloud reads.

---

## 4. Cloudflare Workers Deployment

The `deploy.yml` workflow triggers **only after `ci-test.yml` succeeds on
`master`/`main`** (via `workflow_run`). You can also trigger it manually from
the Actions tab with `workflow_dispatch`.

For the API token, select these permissions when creating it in Cloudflare:

- **Account** → Workers Scripts: Edit
- **Account** → Workers KV Storage: Edit (if using KV)
- **Account** → D1: Edit (if using D1)

---

## 5. OWASP Dependency-Check

Runs as part of `static-analysis.yml`. The full OWASP scan downloads the NVD
vulnerability database (~500 MB) on first run; subsequent runs use a cached
copy. Reports are uploaded as workflow artifacts and retained for 30 days.

To fail the build on OWASP findings, add the `--failBuildOnCVSS 7` flag to the
`args` block in `static-analysis.yml`.

The fast `pnpm audit --audit-level=high` step runs on every PR for immediate
feedback without the download overhead.

---

## 6. Workflow summary

| Workflow              | Trigger                                | Jobs                                          |
| --------------------- | -------------------------------------- | --------------------------------------------- |
| `ci-test.yml`         | push, PR → master/main/develop         | lint, typecheck, unit-test, e2e-test          |
| `deploy.yml`          | ci-test success on master/main; manual | deploy (Pages + Workers)                      |
| `static-analysis.yml` | push/PR → master/main; weekly Monday   | npm-audit, owasp-dependency-check, sonarcloud |

---

## 7. Available scripts

```sh
pnpm lint           # oxlint src/
pnpm lint:fix       # oxlint src/ --fix
pnpm format         # oxfmt .
pnpm format:check   # oxfmt --check .
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest run
pnpm test:coverage  # vitest run --coverage  (outputs coverage/lcov.info)
pnpm e2e            # playwright test
pnpm deploy         # deploy:pages + deploy:api
pnpm deploy:pages   # build + wrangler pages deploy
pnpm deploy:api     # wrangler deploy --config wrangler.api.jsonc
```
