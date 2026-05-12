# NFC Wallet Implementation Plan

## Purpose

Create a concrete implementation plan for the offline NFC wallet system, aligned to the repository's Spec Driven Development (SDD) model and current documentation layers.

This plan is stored in `.agents/specs` so it can be referenced by agent workflows and developer planning.

## Scope

The plan covers the following layered implementation workstreams:

- Product and acceptance criteria validation
- System design mapping
- Technical implementation references
- API and backend projection contracts
- Data schema and storage details
- Security controls and risk boundaries
- Test coverage and verification

## References

- `docs/docs/product-spec/`
- `docs/docs/system-design/`
- `docs/docs/tech-specs/`
- `docs/docs/api-spec/`
- `docs/docs/data-spec/`
- `docs/docs/security-spec/`
- `docs/docs/test-spec/`

## Implementation Approach

### 1. Audit and gap analysis

- Review the Product Spec acceptance criteria and map each to existing System, Tech, API, Data, Security, and Test docs.
- Identify gaps where specs are missing or draft-only.
- Mark draft items in the docs and do not begin implementation before Layer 1–3 coverage is complete for each feature area.

### 2. Define core implementation streams

#### A. Offline card transaction flow

Key docs:
- `docs/docs/system-design/4_card-state-machine.md`
- `docs/docs/tech-specs/6_state-machine-session-rules.md`
- `docs/docs/tech-specs/7_write-update-strategy.md`
- `docs/docs/tech-specs/14_transaction-log-format.md`
- `docs/docs/api-spec/5_cards.md`

Tasks:
- Implement card state transitions: `IDLE`, `CHECKED_IN`, `TERMINAL_OPERATION`, `CHECKED_OUT`
- Enforce write eligibility and stale-session rules
- Implement A/B buffer safe write process
- Store signed log entries and balance updates on card
- Ensure card-side validation occurs before any state-changing write

#### B. Session grant lifecycle

Key docs:
- `docs/docs/system-design/12_key-trust-model.md`
- `docs/docs/tech-specs/12_key-hierarchy-session-grants.md`
- `docs/docs/api-spec/3_session-grants.md`
- `docs/docs/security-spec/5_offline-trust-model.md`

Tasks:
- Implement backend session grant issuance and validation
- Store and refresh local session grants in terminal UI
- Reject state-changing operations on expired or invalid grants
- Scope grants by `tenantId`, `accountId`, `deviceId`, and permitted operations

#### C. Tamper, replay, and fraud detection

Key docs:
- `docs/docs/system-design/3_security-model.md`
- `docs/docs/tech-specs/5_tamper-detection-validation.md`
- `docs/docs/system-design/10_verification-rules.md`
- `docs/docs/security-spec/4_card-tamper-detection.md`
- `docs/docs/security-spec/7_financial-risk-controls.md`

Tasks:
- Validate card payload authenticity and integrity on read
- Detect modifications outside valid write path
- Reject cloned/replayed cards via counter mismatch
- Enforce block state semantics: `BLOCKED_TAMPER`, `BLOCKED_FRAUD`, `EXPIRED`
- Implement backend flagging and operator notification for suspicious events

#### D. Local-first terminal sync and outbox

Key docs:
- `docs/docs/tech-specs/8_backend-frontend-interfaces.md`
- `docs/docs/data-spec/5_multitenancy-auth-local-first.md`
- `docs/docs/api-spec/4_policy.md`
- `docs/docs/api-spec/6_reconciliation.md`

Tasks:
- Implement IndexedDB local replica for tenant state, policy cache, and reconciliation outbox
- Add outbox entries for offline card writes with deterministic idempotency keys
- Sync outbox and then refresh backend checkpoint on reconnect
- Implement conflict rules: server-authoritative backend projection, card-authoritative offline state until reconciliation

#### E. Backend reconciliation and audit model

Key docs:
- `docs/docs/api-spec/6_reconciliation.md`
- `docs/docs/api-spec/7_terminal-reports.md`
- `docs/docs/data-spec/3_backend-db-schema.md`
- `docs/docs/tech-specs/9_risk-financial-limits.md`

Tasks:
- Implement reconciliation endpoint and batch processing
- Persist backend card projection with reconciled counter and balance
- Flag limit breaches while accepting non-breaching batch events
- Record audit trail entries with card ID, counter, amount, timestamp, and hash

#### F. UI architecture and composition

Key docs:
- `docs/docs/tech-specs/8_backend-frontend-interfaces.md`
- `docs/docs/system-design/13_client-roles.md`
- `docs/docs/product-spec/4_acceptance-criteria.md`

Tasks:
- Use shadcn atomic design principles: `ui/`, `block/`, `layout/`, `section/`
- Keep UI components small and reusable; avoid heavy page-level logic in presentational components
- Separate data loading and state from rendering using React hooks + context + components
- Implement mobile-first flows for terminal/gate/kiosk UI and desktop-first flows for admin
- Keep the terminal/gate UI focused on a small set of actions with clear status, errors, and offline state

#### G. Routing and tenant management

Key docs:
- `docs/docs/tech-specs/8_backend-frontend-interfaces.md`
- `docs/docs/data-spec/5_multitenancy-auth-local-first.md`

Tasks:
- Configure TanStack Router routes for tenant-scoped flows: `/tenant/:tenantId/terminal`, `/tenant/:tenantId/gate`, `/tenant/:tenantId/kiosk`, `/tenant/:tenantId/admin`
- Implement a tenant selector / tenant switcher after login and protect tenant-scoped routes
- Keep route-level loaders and error boundaries thin; delegate domain logic to hooks and services
- Maintain tenant awareness in local IndexedDB namespaces and policy caches

#### H. NFC, payload engine, and crypto pipeline

Key docs:
- `docs/docs/tech-specs/4_cryptography.md`
- `docs/docs/tech-specs/5_tamper-detection-validation.md`
- `docs/docs/system-design/8_crypto-model.md`
- `docs/docs/data-spec/2_card-binary-schema.md`
- `docs/docs/data-spec/4_encoding-conventions.md`

Tasks:
- Implement an NFC pipeline hook/service responsible for card read, validation, and write workflows
- Keep cryptography separate from UI: a `useNfcCard` hook, `nfcEngine`, `pipelineEngine`, and a `cryptoEngine` module should provide plain APIs for read, verify, sign, encrypt, decrypt, and replay detection
- Ensure the pipeline can be tested independently from the UI and from network sync logic
- Maintain a clear contract for the card payload engine: `readCard()`, `decodePayload()`, `validateCard()`, `prepareWrite()`, `encodePayload()`, `commitWrite()`, `recoverFromIncompleteWrite()`
- Implement a payload engine that encodes/decodes the full 496-byte card structure and enforces all field-level encoding rules

#### Payload engine responsibilities

- Parse the active buffer from the card using `trailer.activePtr`
- Decode/encode:
  - Header / Identifier
  - Identity block
  - Wallet + Runtime block
  - Session block
  - Log region entries
  - Trailer / Meta block
- Enforce encoding conventions:
  - Little-endian for all multi-byte integers
  - UTF-8 null-padded strings
  - `uint24` values stored as 3 bytes
  - Reserved fields written as zeros and ignored on read
- Support payload validation and round-trip integrity before any card write

#### Sample payload engine contract

```ts
interface CardPayload {
  header: {
    magic: number
    version: number
    type: number
    cardId: Uint8Array
  }
  identity: {
    name: string
    userId: number
    gender: number
    status: number
    createdAt: number
  }
  wallet: {
    balance: number
    lastBalance: number
    counter: bigint
    lastTimestamp: number
    state: number
    flags: number
  }
  session: {
    startTime: number
    endTime: number
    terminalId: number
  }
  logEntries: Array<{
    deltaTime: number
    amount: number
    balanceAfter: number
    flags: number
    hash: Uint8Array
  }>
  trailer: {
    expiresAt: number
    keyVersion: number
    rootHash: Uint8Array
    counterBind: number
    hmac: Uint8Array
    activePtr: number
  }
}

function decodePayload(buffer: Uint8Array): CardPayload
function encodePayload(payload: CardPayload): Uint8Array
```

#### Encoding rules from data spec

```text
- Byte order: little-endian for all multi-byte integer fields
- String fields: UTF-8, null-padded to the fixed allocation
- Amounts: integer IDR only (`uint24` for log amount, `uint32` for balance)
- Reserved fields: zeroed on write, ignored on read
- HMAC covers active buffer + trailer anchor fields
- Chain hash formula: SHA256(deltaTime || amount || balanceAfter || flags || prevHash)[0..5]
```

### 3. Security and protection controls

Key docs:
- `docs/docs/security-spec/2_authentication-authorization.md`
- `docs/docs/security-spec/3_cryptographic-controls.md`
- `docs/docs/security-spec/6_data-protection.md`
- `docs/docs/security-spec/7_financial-risk-controls.md`

Tasks:
- Use approved cryptographic algorithms and key lifecycle rules
- Protect tenant-scoped storage and avoid storing permanent secrets on cards
- Enforce RBAC for terminal, gate, and admin flows
- Validate backend policies before high-risk actions
- Ensure IndexedDB and local caches only store authorized tenant data

### 4. Test coverage plan

Key docs:
- `docs/docs/test-spec/1_overview.md`
- `docs/docs/test-spec/2_unit-tests.md`
- `docs/docs/test-spec/3_e2e-tests.md`

Tasks:
- Add unit tests for card validation, state transitions, crypto primitives, risk limits, and local-first outbox behavior
- Add E2E tests for offline transaction flow, session expiry, tamper detection, reconciliation, and tenant isolation
- Trace each test back to a specific acceptance criterion

## Implementation checklist

- [ ] Map all Product Spec acceptance criteria to implementation stories and test coverage
- [ ] Define tenant-scoped route structure and tenant selector flow
- [ ] Establish `ui/`, `block/`, `layout/`, `section/` component folders for shadcn-style composition
- [ ] Create reusable hooks for NFC card interaction and crypto validation
- [ ] Build a lightweight `cryptoEngine` / `nfcPipeline` service with clear read/write contract
- [ ] Implement terminal/gate/kiosk mobile-first UI flows and admin desktop-first UI flows
- [ ] Add IndexedDB local-first tenant stores for policy, outbox, and card caches
- [ ] Add backend APIs for session grants, policy, reconcile, and audit reports
- [ ] Implement offline reconciliation upload and server checkpoint refresh
- [ ] Add unit tests for state machine, crypto, replay protection, and risk rules
- [ ] Add E2E tests for offline transactions, stale session handling, tamper detection, and multi-tenant isolation

## Prioritized implementation milestones

1. Complete audit of current docs and identify any missing spec items
2. Implement card read/write and session state validation in the frontend
3. Implement backend session grant API and card projection schema
4. Implement reconciliation and offline sync flows
5. Add tamper/replay detection and block state enforcement
6. Add coverage with unit and E2E tests
7. Review and finalize spec traceability across docs and code

## Success criteria

The implementation is complete when:

- All acceptance criteria in `docs/docs/product-spec/4_acceptance-criteria.md` are mapped to code or tests
- Each new feature is supported by upstream docs in Product, System, Tech, API, Data, and Security layers
- The backend and frontend rely on shared interface contracts per `docs/docs/tech-specs/8_backend-frontend-interfaces.md`
- Test coverage exists for security, offline behavior, reconciliation, and session grant enforcement

## Notes

- Do not implement lower-layer behavior before validating upstream spec coverage.
- Keep changes traceable by referencing docs sections in feature branches and commit messages.
- Treat `.agents/specs/implementation-plan.md` as the launchpad for agent-driven work and planning.
