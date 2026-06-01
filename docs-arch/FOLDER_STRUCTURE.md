# Folder Structure & Clean Architecture

[← Back to README](../README.md)

## Current Structure

```
koperasi-kegelapan/
├── api/src/                    # API Worker (Cloudflare Workers)
│   ├── lib/                    # Shared utilities
│   ├── middleware/             # CORS, device block, rate limit, analytics
│   ├── routes/                 # Route handlers (11 modules)
│   └── __tests__/             # API integration tests
├── src/                        # Frontend Application
│   ├── components/
│   │   ├── ui/                 # Shadcn primitives (Button, Dialog, etc.)
│   │   ├── block/              # Composed UI blocks (NfcTapArea, DataTable)
│   │   ├── layout/            # Layout shells (AdminLayout, KioskLayout)
│   │   └── section/           # Page sections (GateSection, AdminSection)
│   ├── core/                   # Domain logic (framework-agnostic)
│   │   ├── crypto/            # AES-GCM, HKDF, HMAC, PBKDF2
│   │   ├── nfc/               # NFC adapters, engine, pipeline, state machine
│   │   ├── payload/           # Card binary encode/decode (496-byte)
│   │   ├── state-machine/     # Card state transitions
│   │   └── validation/        # Card & transaction validation
│   ├── db/                     # Database layer
│   │   ├── schema.ts          # Drizzle ORM schema (D1)
│   │   ├── local-db.ts        # Dexie IndexedDB schema
│   │   └── seed.ts            # Database seeding
│   ├── domain/                 # Domain models
│   │   ├── card/              # Card domain logic
│   │   ├── member/            # Member domain logic
│   │   └── transaction/       # Transaction domain logic
│   ├── hooks/                  # React hooks
│   │   ├── nfc/               # NFC-specific hooks
│   │   └── *.ts               # Auth, sync, session, reconciliation hooks
│   ├── integrations/           # External integrations (TanStack Query)
│   ├── lib/                    # Shared utilities
│   │   ├── sync*.ts           # Sync engine (push, pull, conflict resolver)
│   │   ├── indexeddb.ts       # IndexedDB store definitions
│   │   └── *.ts               # API client, formatters, device utils
│   ├── routes/                 # TanStack Router (file-based routing)
│   └── server/                 # Server-side logic (auth, reconcile, grants)
├── drizzle/                    # D1 SQL migrations
├── e2e/                        # Playwright E2E tests
├── docs/                       # Spec documentation (git submodule)
├── docs-arch/                  # Architecture docs (this folder)
└── public/                     # Static assets, PWA manifest, icons
```

## Ideal Clean Architecture (Target - Future Branch)

```
koperasi-kegelapan/
├── api/                            # Backend (Cloudflare Workers)
│   └── src/
│       ├── application/            # Use cases / application services
│       │   ├── auth/
│       │   ├── card/
│       │   ├── reconciliation/
│       │   └── sync/
│       ├── domain/                 # Pure domain models & business rules
│       │   ├── entities/
│       │   ├── value-objects/
│       │   └── events/
│       ├── infrastructure/         # External concerns
│       │   ├── persistence/        # Drizzle repositories
│       │   ├── crypto/             # Server-side crypto
│       │   └── analytics/          # Analytics Engine adapter
│       └── presentation/           # HTTP layer
│           ├── middleware/
│           └── routes/
├── src/                            # Frontend (React PWA)
│   ├── app/                        # App bootstrap, providers, router
│   ├── features/                   # Feature modules (vertical slices)
│   │   ├── auth/
│   │   │   ├── hooks/
│   │   │   ├── components/
│   │   │   └── services/
│   │   ├── card/
│   │   │   ├── hooks/
│   │   │   ├── components/
│   │   │   └── services/
│   │   ├── gate/
│   │   ├── terminal/
│   │   ├── kiosk/
│   │   └── admin/
│   ├── core/                       # Framework-agnostic domain logic
│   │   ├── crypto/
│   │   ├── nfc/
│   │   ├── payload/
│   │   ├── state-machine/
│   │   └── validation/
│   ├── shared/                     # Shared across features
│   │   ├── components/
│   │   │   ├── ui/                 # Shadcn primitives
│   │   │   └── layout/            # Layout shells
│   │   ├── hooks/                  # Generic hooks
│   │   ├── lib/                    # Utilities
│   │   └── types/                  # Shared TypeScript types
│   ├── infrastructure/             # External adapters
│   │   ├── api/                    # API client
│   │   ├── indexeddb/             # Dexie stores
│   │   └── nfc/                   # Web NFC adapter
│   └── routes/                     # TanStack Router (thin, delegates to features)
├── packages/                       # Shared packages (optional monorepo)
│   └── domain/                     # Shared domain types between API & frontend
├── drizzle/
├── e2e/
└── docs/
```

## Architecture Layer Diagram

```mermaid
graph TB
    subgraph Presentation["Presentation Layer"]
        Routes["Routes<br/>(param extraction only)"]
        Sections["Sections<br/>(orchestration)"]
        Blocks["Blocks<br/>(pure render)"]
        UI["UI Primitives<br/>(Shadcn/Radix)"]
    end

    subgraph Application["Application Layer (Hooks)"]
        AuthHooks["useLoginAuth<br/>useSessionGrant"]
        NfcHooks["useUnifiedNfc<br/>useKioskAutoScan"]
        SyncHooks["useSyncEngine<br/>useReconciliation"]
        QueryHooks["TanStack Query<br/>integrations"]
    end

    subgraph Domain["Domain / Core Layer"]
        CryptoEngine["crypto/engine<br/>AES-GCM, HKDF, HMAC"]
        NfcPipeline["nfc/pipelineEngine<br/>Read → Validate → Write"]
        PayloadEngine["payload/engine<br/>496-byte encode/decode"]
        StateMachine["state-machine/engine<br/>Card transitions"]
        Validation["validation/<br/>Block enforcer, UID validator"]
    end

    subgraph Infrastructure["Infrastructure Layer"]
        API["API Client<br/>(lib/api.ts)"]
        IDB["IndexedDB<br/>(Dexie stores)"]
        WebNFC["Web NFC API<br/>(adapters)"]
        SW["Service Worker<br/>(Workbox)"]
    end

    Routes --> Sections
    Sections --> Blocks
    Blocks --> UI

    Sections --> AuthHooks
    Sections --> NfcHooks
    Sections --> SyncHooks

    AuthHooks --> API
    NfcHooks --> NfcPipeline
    NfcHooks --> WebNFC
    SyncHooks --> API
    SyncHooks --> IDB
    QueryHooks --> API

    NfcPipeline --> CryptoEngine
    NfcPipeline --> PayloadEngine
    NfcPipeline --> StateMachine
    NfcPipeline --> Validation
```

## Dependency Rule

```mermaid
graph LR
    P["Presentation"] -->|"depends on"| A["Application"]
    A -->|"depends on"| D["Domain/Core"]
    A -->|"depends on"| I["Infrastructure"]
    D -.->|"NO dependency on"| I
    D -.->|"NO dependency on"| P

    style D fill:#e8f5e9,stroke:#4caf50
    style P fill:#e3f2fd,stroke:#2196f3
    style A fill:#fff3e0,stroke:#ff9800
    style I fill:#fce4ec,stroke:#e91e63
```

> **Core/Domain layer has ZERO external dependencies.** It contains pure TypeScript logic
> (crypto algorithms, payload encoding, state machine rules, validation) that can be tested
> in isolation without React, IndexedDB, or network access.

## Layer Rules

| Layer              | Can Import From      | Cannot Import From       |
| ------------------ | -------------------- | ------------------------ |
| **Routes**         | Sections             | Blocks, Hooks, Core, Lib |
| **Sections**       | Blocks, Hooks        | Routes, Core directly    |
| **Blocks**         | UI primitives        | Hooks, Core, API         |
| **Hooks**          | Core, Infrastructure | Components               |
| **Core/Domain**    | Nothing (pure logic) | Everything else          |
| **Infrastructure** | Core (types only)    | Hooks, Components        |
