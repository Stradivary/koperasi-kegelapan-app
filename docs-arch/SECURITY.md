# Security Architecture

[← Back to README](../README.md)

## Overview

The system uses a **hybrid online/offline security model**. When online, the server issues cryptographically signed session grants. When offline, terminals validate card operations locally using those grants and card-embedded HMAC chains.

## Online Security Flow

```mermaid
sequenceDiagram
    participant Client as Client (PWA)
    participant API as API Worker (Hono)
    participant DB as Cloudflare D1

    Note over Client,DB: Authentication
    Client->>API: POST /api/auth {username, password}
    API->>DB: Lookup account
    DB-->>API: Stored hash (pbkdf2$salt$hash)
    API->>API: PBKDF2 verify (100k iterations, SHA-256, timing-safe)
    API->>DB: Create session (UUID + SHA-256(refreshToken))
    Note over API: Max 5 concurrent sessions per account
    API-->>Client: {sessionId, refreshToken, expiresAt}

    Note over Client,DB: Session Grant Issuance
    Client->>API: GET /api/session-grant
    API->>API: Derive tenant key = HMAC(masterKey, tenantId:keyVersion)
    API->>API: Derive session key = HMAC(tenantKey, "session-key")
    API->>API: Sign payload = HMAC(tenantKey, {keyVersion, expiresAt, ops, account, device})
    API-->>Client: GrantPayload + HMAC signature

    Note over Client,DB: Token Rotation
    Client->>API: POST /api/auth/refresh {sessionId, refreshToken}
    API->>DB: Verify SHA-256(token) matches stored hash
    API->>API: Generate new refresh token
    API->>DB: Update hash (rotation)
    API-->>Client: {sessionId, newRefreshToken, expiresAt}

    Note over Client,DB: Compromise Detection
    Client->>API: POST /api/auth/refresh {invalid token}
    API->>API: Hash mismatch detected
    API->>DB: Revoke ALL sessions for device
    API-->>Client: 401 - Re-authentication required
```

## Offline Security Flow

```mermaid
sequenceDiagram
    participant Terminal as NFC Terminal (PWA)
    participant IDB as IndexedDB
    participant Card as NTAG215 Card

    Note over Terminal,Card: 1. Session Grant Validation
    Terminal->>IDB: Load cached session grant
    Terminal->>Terminal: Check grant expiry (24h TTL)
    Terminal->>Terminal: Check allowedOps for role
    Terminal->>Terminal: Check device binding (deviceId match)
    alt Grant expired or invalid
        Terminal-->>Terminal: REJECT - require online re-auth
    end

    Note over Terminal,Card: 2. Card Read & Validation
    Terminal->>Card: NFC Read (NDEF / Raw bytes)
    Card-->>Terminal: 496-byte raw buffer

    Terminal->>Terminal: Decode payload (active buffer via trailer.activePtr)
    Terminal->>Terminal: Verify HMAC (key derived from sessionKey)
    Terminal->>Terminal: Verify chain hash integrity (SHA-256 linked entries)
    Terminal->>Terminal: Check counter monotonicity (no replay)
    Terminal->>Terminal: Validate state machine transition
    Terminal->>Terminal: Enforce financial limits (max tx, daily total)

    alt Validation fails
        Terminal-->>Terminal: BLOCK card (tamper/clone/replay)
    end

    Note over Terminal,Card: 3. Transaction Processing
    Terminal->>Terminal: Update balance
    Terminal->>Terminal: Increment counter
    Terminal->>Terminal: Append log entry
    Terminal->>Terminal: Recompute chain hash
    Terminal->>Terminal: Recompute HMAC over buffer

    Note over Terminal,Card: 4. Safe Write (A/B Buffer Swap)
    Terminal->>Card: Write to INACTIVE buffer
    Terminal->>Card: Update trailer.activePtr (atomic swap)
    Card-->>Terminal: Write confirmed

    Note over Terminal,Card: 5. Outbox Queue
    Terminal->>IDB: Queue transaction to reconciliation outbox
    Note over IDB: Synced to server when connectivity returns
```

## Key Hierarchy

```mermaid
graph TD
    MK["SESSION_MASTER_KEY<br/>(Cloudflare Secret)"]
    TK["Tenant Key<br/>HMAC(masterKey, tenantId:keyVersion)"]
    SK["Session Key<br/>HMAC(tenantKey, 'session-key')"]
    CK["Card HMAC Key<br/>Derived from session key"]

    MK --> TK
    TK --> SK
    SK --> CK

    TK -->|"Signs"| Grant["Session Grant Signature"]
    CK -->|"Protects"| Payload["Card Payload HMAC"]
```

## Security Controls Summary

| Control             | Implementation                                            |
| ------------------- | --------------------------------------------------------- |
| Password hashing    | PBKDF2 (100k iterations, SHA-256, 16-byte salt)           |
| Token storage       | SHA-256 hash stored, never raw token                      |
| Token rotation      | New refresh token on every refresh call                   |
| Compromise response | Revoke ALL device sessions on invalid token               |
| Session limit       | Max 5 concurrent sessions per account                     |
| Session grant       | HMAC-signed, 24h TTL, role-scoped, device-bound           |
| Card integrity      | HMAC over full payload buffer                             |
| Tamper detection    | Chain hash (SHA-256 linked log entries)                   |
| Replay protection   | Monotonic counter enforcement                             |
| Clone detection     | Counter mismatch vs backend projection                    |
| Financial limits    | Max transaction amount, max daily total (policy-enforced) |
| Device blocking     | Server-side device block list, middleware enforcement     |
| Rate limiting       | 60 req/min per device on sync routes                      |
| Dependency scanning | OWASP Dependency Check + npm audit (CI)                   |
| Static analysis     | SonarCloud (weekly + on PR)                               |
| CORS                | Strict origin allowlist via middleware                    |

## Threat Model (Offline)

```mermaid
graph LR
    subgraph Threats
        T1["Card Cloning"]
        T2["Balance Tampering"]
        T3["Replay Attack"]
        T4["Expired Session"]
        T5["Stolen Device"]
    end

    subgraph Mitigations
        M1["Counter monotonicity check"]
        M2["HMAC integrity verification"]
        M3["Counter + chain hash validation"]
        M4["Grant expiry enforcement (24h)"]
        M5["Device-bound grants + remote revocation"]
    end

    T1 --> M1
    T2 --> M2
    T3 --> M3
    T4 --> M4
    T5 --> M5
```
