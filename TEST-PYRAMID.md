# Test Pyramid — Koperasi Kegelapan App

## Overview

```
                         ╱╲
                        ╱  ╲
                       ╱    ╲
                      ╱  E2E  ╲          116 tests
                     ╱  (11 files) ╲        Playwright + Real Chromium
                    ╱────────────────╲
                   ╱                    ╲
                  ╱   Integration Tests   ╲     ~469 tests
                 ╱      (61 files)          ╲    Vitest + jsdom (hooks, server, API routes)
                ╱────────────────────────────╲
               ╱                                ╲
              ╱         Unit Tests                ╲    ~2000 tests
             ╱          (103 files)                 ╲   Vitest (pure logic, components, utilities)
            ╱────────────────────────────────────────╲
           ╱                                            ╲
          ╱            Static Analysis                    ╲   Entire codebase
         ╱     TypeScript (tsc) + OxLint + OxFmt           ╲   Compile-time checks
        ╱────────────────────────────────────────────────────╲
```

## Test Count Summary

| Level               | Test Cases     | Test Files     | Tool           | Scope                                               |
| ------------------- | -------------- | -------------- | -------------- | --------------------------------------------------- |
| **E2E**             | 116            | 11             | Playwright     | Full app in real browser                            |
| **Integration**     | ~469           | 61             | Vitest + jsdom | Hooks, server handlers, API routes, sync logic      |
| **Unit**            | ~2,000         | 103            | Vitest         | Pure functions, components, utilities, core engines |
| **Static Analysis** | ∞ (continuous) | All `.ts/.tsx` | tsc + OxLint   | Type safety + code patterns                         |
|                     |                |                |                |                                                     |
| **Total (Vitest)**  | **2,469**      | **164**        |                |                                                     |
| **Total (E2E)**     | **116**        | **11**         |                |                                                     |
| **Grand Total**     | **2,585**      | **175**        |                |                                                     |

## Test Distribution by Domain

### Unit Tests (~2,000 tests across 103 files)

Tests that verify **isolated logic** without external dependencies or complex mocking.

| Domain        | Files | What They Test                                                       |
| ------------- | ----- | -------------------------------------------------------------------- |
| Core Logic    | 27    | Crypto engine, NFC engine, state machine, payload engine, validators |
| Components    | 35    | React component rendering, props, user interactions                  |
| Lib/Utilities | 38    | Formatters, slug validation, device fingerprint, haptics, utils      |
| Other         | 3     | DB schema, route config                                              |

**Characteristics:**

- No network calls
- Minimal or no mocking
- Test pure functions and component output
- Fast execution (milliseconds per test)

### Integration Tests (~469 tests across 61 files)

Tests that verify **multiple modules working together**, often with mocked external boundaries.

| Domain     | Files | What They Test                                                                      |
| ---------- | ----- | ----------------------------------------------------------------------------------- |
| Hooks      | 29    | React hooks with mocked stores/APIs (useLoginAuth, useSyncEngine, useNfcCard, etc.) |
| Server     | 22    | Server-side handlers with mocked DB (auth, sync, reconcile, superadmin)             |
| API Routes | 10    | Hono route handlers with mocked middleware (cards, sync, superadmin)                |

**Characteristics:**

- Mock external boundaries (DB, network, IndexedDB)
- Test module interactions and data flow
- Verify request/response contracts
- Medium execution speed (seconds per test)

### E2E Tests (116 tests across 11 files)

Tests that verify **complete user workflows** through a real browser.

| Test File                   | Tests | What It Validates                                                 |
| --------------------------- | ----- | ----------------------------------------------------------------- |
| `login-flows.spec.ts`       | 13    | Login form, validation, auth success/failure, session persistence |
| `api-auth.spec.ts`          | 18    | API authentication endpoints, token handling                      |
| `flows.spec.ts`             | 16    | General application workflows                                     |
| `role-routing.spec.ts`      | 14    | Role-based page access and redirects                              |
| `superadmin.spec.ts`        | 12    | Superadmin panel: login, tenant management, accounts              |
| `admin-cards.spec.ts`       | 9     | Admin card management CRUD                                        |
| `member-management.spec.ts` | 8     | Member creation, editing, listing                                 |
| `settings.spec.ts`          | 8     | Settings page, sync status, device list                           |
| `api-sync.spec.ts`          | 7     | Sync pull/push API contracts                                      |
| `transactions.spec.ts`      | 6     | Transaction filtering and display                                 |
| `admin-navigation.spec.ts`  | 5     | Admin menu and navigation                                         |

**Characteristics:**

- Real Chromium browser
- Real HTTP requests to dev server
- Full DOM rendering with CSS
- Tests actual user journeys end-to-end
- Slowest execution (seconds to minutes)

## Static Analysis (Continuous)

Not counted as "tests" but provides the foundation layer:

| Tool                            | What It Checks                                                |
| ------------------------------- | ------------------------------------------------------------- |
| **TypeScript (`tsc --noEmit`)** | Type correctness, null safety, unused code, import resolution |
| **OxLint**                      | Code patterns, React hooks rules, consistent imports          |
| **OxFmt**                       | Code formatting consistency                                   |

## When Each Level Runs

```
┌─────────────────────────────────────────────────────────┐
│  git commit (pre-commit + commit-msg)                   │
│  ├─ Static Analysis: OxLint + OxFmt (staged files)      │
│  └─ Dependency Audit: pnpm audit                        │
├─────────────────────────────────────────────────────────┤
│  git push (pre-push)                                    │
│  ├─ Static Analysis: tsc --noEmit (entire project)      │
│  └─ Unit + Integration: vitest run (2,469 tests)        │
├─────────────────────────────────────────────────────────┤
│  CI Pipeline / Manual                                   │
│  └─ E2E: playwright test (116 tests)                    │
└─────────────────────────────────────────────────────────┘
```

## Ratio Analysis

```
Unit + Integration : E2E  =  2,469 : 116  =  ~21:1
```

This follows the recommended test pyramid ratio where the majority of tests are fast unit/integration tests, with fewer expensive E2E tests covering critical user paths.

## Running Tests

```bash
# Unit + Integration tests
pnpm test                    # vitest run (all 2,469 tests)
pnpm test:coverage           # with coverage report

# E2E tests
pnpm e2e                     # playwright test (all 116 tests)
pnpm e2e:ui                  # interactive Playwright UI

# Static analysis
pnpm typecheck               # tsc --noEmit
pnpm lint                    # oxlint src/
pnpm format:check            # oxfmt --check
```
