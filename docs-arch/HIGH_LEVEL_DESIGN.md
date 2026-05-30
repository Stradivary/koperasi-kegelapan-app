# High-Level Design (HLD)

[← Back to README](../README.md)

## System Overview

```mermaid
graph TB
    subgraph CF["Cloudflare Edge Network"]
        Pages["Cloudflare Pages<br/>React 19 SPA (PWA)<br/>TanStack Router + Vite 8"]
        Workers["Cloudflare Workers<br/>Hono API Framework"]
        D1["Cloudflare D1<br/>SQLite (Drizzle ORM)"]
        AE["Analytics Engine"]

        Pages -->|"/api/*"| Workers
        Workers --> D1
        Workers --> AE
    end

    subgraph Terminal["NFC Terminal (Android PWA)"]
        SW["Service Worker<br/>(Workbox)"]
        IDB["IndexedDB (Dexie)<br/>Policy Cache | Card Snapshots<br/>Reconcile Outbox | Tenant Context"]
        Crypto["Crypto Engine<br/>AES-GCM, HKDF, HMAC"]
        Pipeline["NFC Pipeline Engine<br/>Read → Validate → Process → Write"]
    end

    subgraph Card["NTAG215 NFC Card"]
        Payload["496-byte Encrypted Payload<br/>Identity | Wallet | Session<br/>Transaction Log (A/B) | Trailer"]
    end

    Pages --> SW
    Terminal -->|"Web NFC API"| Card
    Terminal -->|"Online Sync"| Workers
    Pipeline --> Crypto
    Pipeline --> IDB
```

## Component Interaction (Atomic UI Layers)

```mermaid
graph LR
    Route["Route<br/>(params extraction)"]
    Section["Section<br/>(hooks, state, orchestration)"]
    Block["Block<br/>(pure render, props callbacks)"]
    Layout["Layout/UI<br/>(slots, primitives)"]

    Route --> Section --> Block --> Layout
```

| Layer       | Folder                    | Responsibility                                |
| ----------- | ------------------------- | --------------------------------------------- |
| **Route**   | `src/routes/`             | Extract route params, pass to Section         |
| **Section** | `src/components/section/` | Call hooks, own state, orchestrate Blocks     |
| **Block**   | `src/components/block/`   | Render data, handle user activity via props   |
| **Layout**  | `src/components/layout/`  | Define slot structure (children, named slots) |
| **UI**      | `src/components/ui/`      | Primitive atoms (Button, Input, Badge, …)     |

## Data Flow — Online vs Offline

```mermaid
sequenceDiagram
    participant T as Terminal (PWA)
    participant IDB as IndexedDB
    participant API as Cloudflare Workers
    participant D1 as Cloudflare D1

    Note over T,D1: === ONLINE MODE ===
    T->>API: POST /api/auth (login)
    API->>D1: Verify credentials
    D1-->>API: Account data
    API-->>T: Session + Refresh Token

    T->>API: GET /api/session-grant
    API-->>T: Signed grant (24h TTL)
    T->>IDB: Store grant locally

    T->>API: GET /api/policy
    API-->>T: Tenant policy
    T->>IDB: Cache policy

    Note over T,D1: === OFFLINE MODE ===
    T->>IDB: Load session grant
    T->>T: Validate grant (expiry, ops, device)
    T->>T: NFC Read → Decode → Validate → Process → Write
    T->>IDB: Queue to reconciliation outbox

    Note over T,D1: === RECONNECT ===
    T->>API: POST /api/reconcile (outbox batch)
    API->>D1: Persist transactions
    API-->>T: Reconciliation result
    T->>IDB: Clear outbox entries
```

## Card State Machine

```mermaid
stateDiagram-v2
    [*] --> IDLE: Card issued
    IDLE --> CHECKED_IN: Gate check-in
    CHECKED_IN --> TERMINAL_OP: Debit/Credit at terminal
    TERMINAL_OP --> CHECKED_IN: Transaction complete
    CHECKED_IN --> CHECKED_OUT: Gate check-out
    CHECKED_OUT --> IDLE: Session cleared

    IDLE --> BLOCKED_TAMPER: Tamper detected
    CHECKED_IN --> BLOCKED_TAMPER: Tamper detected
    TERMINAL_OP --> BLOCKED_TAMPER: Tamper detected

    IDLE --> BLOCKED_FRAUD: Fraud flagged
    IDLE --> EXPIRED: Card expired
```

## Deployment Topology

```mermaid
graph TB
    subgraph Production
        ProdPages["Cloudflare Pages<br/>ahmadmuzaki.my.id"]
        ProdAPI["Cloudflare Workers<br/>API (wrangler.api.jsonc)"]
        ProdD1["D1 Production"]
    end

    subgraph Staging
        StagPages["Cloudflare Pages<br/>dev.ahmadmuzaki.my.id"]
        StagAPI["Cloudflare Workers<br/>API (wrangler.api.staging.jsonc)"]
        StagD1["D1 Staging"]
    end

    subgraph CI["GitHub Actions"]
        CITest["ci-test.yml<br/>lint + typecheck + test"]
        Deploy["deploy.yml<br/>build + deploy"]
        Static["static-analysis.yml<br/>OWASP + SonarCloud"]
    end

    CITest -->|"pass"| Deploy
    Deploy -->|"develop branch"| Staging
    Deploy -->|"v* tag"| Production
```
