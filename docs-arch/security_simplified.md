# Security Overview (Simplified)

[← Back to README](../README.md)

## Online Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API
    participant D as Database

    C->>A: Login (username + password)
    A->>D: Verify password hash (PBKDF2)
    A-->>C: Session ID + Refresh Token

    C->>A: Request Session Grant
    A->>A: Sign grant with HMAC key chain
    A-->>C: Signed Grant (24h TTL, role + device bound)

    C->>A: Refresh Token
    A->>A: Verify hash → rotate token
    A-->>C: New Refresh Token
    Note over A: Invalid token? Revoke ALL device sessions
```

## Offline Flow

```mermaid
sequenceDiagram
    participant T as NFC Terminal
    participant Card as NFC Card

    T->>T: Validate cached session grant (expiry, role, device)

    T->>Card: Read card (496 bytes)
    T->>T: Verify HMAC + chain hash + counter (no replay)

    alt Validation fails
        T-->>T: BLOCK card
    end

    T->>T: Update balance, increment counter, recompute HMAC
    T->>Card: Write to inactive buffer → swap active pointer
    T->>T: Queue transaction for sync when online
```

## Key Hierarchy

```mermaid
graph LR
    MK["Master Key<br/>(Secret)"] --> TK["Tenant Key"]
    TK --> SK["Session Key"]
    SK --> CK["Card HMAC Key"]
    TK --> Grant["Grant Signature"]
    CK --> Payload["Card Payload HMAC"]
```

## Key Controls

| Threat            | Mitigation                                   |
| ----------------- | -------------------------------------------- |
| Password breach   | PBKDF2 (100k iterations), hash stored only   |
| Token theft       | SHA-256 hash stored; rotate on every refresh |
| Token reuse       | Invalid token → revoke all device sessions   |
| Card cloning      | Monotonic counter check                      |
| Balance tampering | HMAC over full card payload                  |
| Replay attack     | Counter + chain hash validation              |
| Expired session   | 24h grant TTL enforced offline               |
| Stolen device     | Device-bound grants + remote revocation      |
