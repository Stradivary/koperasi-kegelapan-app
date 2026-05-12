# NFC Wallet Implementation Tasks

This task list splits the implementation plan into numbered, manageable requirements with references and checkboxes.

## 1. Audit & Gap Analysis

1.1 [ ] Review `docs/docs/product-spec/4_acceptance-criteria.md` and map each acceptance criterion to System, Tech, API, Data, Security, and Test docs.
    - References: `docs/docs/system-design/`, `docs/docs/tech-specs/`, `docs/docs/api-spec/`, `docs/docs/data-spec/`, `docs/docs/security-spec/`, `docs/docs/test-spec/`

1.2 [ ] Identify missing or draft-only spec coverage for each feature area.
    - References: all docs directories above

1.3 [ ] Annotate gaps and block implementation until Layer 1–3 coverage is complete for affected workstreams.
    - References: `.agents/specs/implementation-plan.md`

## 2. Offline Card Transaction Flow

2.1 [ ] Implement card state machine transitions: `IDLE`, `CHECKED_IN`, `TERMINAL_OPERATION`, `CHECKED_OUT`.
    - References: `docs/docs/system-design/4_card-state-machine.md`, `docs/docs/tech-specs/6_state-machine-session-rules.md`

2.2 [ ] Enforce write eligibility and stale-session rules before card writes.
    - References: `docs/docs/tech-specs/6_state-machine-session-rules.md`, `docs/docs/tech-specs/7_write-update-strategy.md`

2.3 [ ] Build the A/B buffer safe write process for card updates.
    - References: `docs/docs/tech-specs/7_write-update-strategy.md`

2.4 [ ] Persist signed log entries and balance updates on the card payload.
    - References: `docs/docs/tech-specs/14_transaction-log-format.md`, `docs/docs/api-spec/5_cards.md`

2.5 [ ] Ensure all state-changing writes include card-side validation.
    - References: `docs/docs/tech-specs/7_write-update-strategy.md`, `docs/docs/security-spec/3_cryptographic-controls.md`

## 3. Session Grant Lifecycle

3.1 [ ] Implement backend session grant issuance and validation.
    - References: `docs/docs/api-spec/3_session-grants.md`, `docs/docs/system-design/12_key-trust-model.md`

3.2 [ ] Persist and refresh local session grants in the terminal UI.
    - References: `docs/docs/system-design/12_key-trust-model.md`, `docs/docs/tech-specs/12_key-hierarchy-session-grants.md`

3.3 [ ] Reject write operations when grants are expired, invalid, or out of scope.
    - References: `docs/docs/security-spec/5_offline-trust-model.md`, `docs/docs/api-spec/3_session-grants.md`

3.4 [ ] Scope session grants by `tenantId`, `accountId`, `deviceId`, and allowed operations.
    - References: `docs/docs/tech-specs/12_key-hierarchy-session-grants.md`, `docs/docs/data-spec/5_multitenancy-auth-local-first.md`

## 4. Tamper, Replay, and Fraud Detection

4.1 [ ] Validate card payload authenticity and integrity on card read.
    - References: `docs/docs/system-design/3_security-model.md`, `docs/docs/tech-specs/5_tamper-detection-validation.md`

4.2 [ ] Detect modifications made outside the valid write path.
    - References: `docs/docs/tech-specs/5_tamper-detection-validation.md`, `docs/docs/data-spec/2_card-binary-schema.md`

4.3 [ ] Reject cloned or replayed cards using counter mismatch and replay protection.
    - References: `docs/docs/system-design/10_verification-rules.md`, `docs/docs/security-spec/4_card-tamper-detection.md`

4.4 [ ] Enforce card block states: `BLOCKED_TAMPER`, `BLOCKED_FRAUD`, `EXPIRED`.
    - References: `docs/docs/security-spec/7_financial-risk-controls.md`

4.5 [ ] Add backend alerting and operator notification for suspicious events.
    - References: `docs/docs/security-spec/7_financial-risk-controls.md`, `docs/docs/api-spec/7_terminal-reports.md`

## 5. Local-first Terminal Sync and Outbox

5.1 [ ] Create IndexedDB local replicas for tenant state, policy cache, and reconciliation outbox.
    - References: `docs/docs/tech-specs/8_backend-frontend-interfaces.md`, `docs/docs/data-spec/5_multitenancy-auth-local-first.md`

5.2 [ ] Add deterministic idempotency keys for offline card write outbox entries.
    - References: `docs/docs/api-spec/6_reconciliation.md`, `docs/docs/data-spec/5_multitenancy-auth-local-first.md`

5.3 [ ] Sync the offline outbox and refresh backend checkpoints when connectivity returns.
    - References: `docs/docs/api-spec/6_reconciliation.md`, `docs/docs/tech-specs/8_backend-frontend-interfaces.md`

5.4 [ ] Implement conflict rules: server-authoritative backend projection vs card-authoritative offline state until reconciliation.
    - References: `docs/docs/api-spec/6_reconciliation.md`, `docs/docs/tech-specs/8_backend-frontend-interfaces.md`

## 6. Backend Reconciliation and Audit Model

6.1 [ ] Build reconciliation endpoints and batch processing for offline transactions.
    - References: `docs/docs/api-spec/6_reconciliation.md`, `docs/docs/data-spec/3_backend-db-schema.md`

6.2 [ ] Persist backend card projections with reconciled counter and balance state.
    - References: `docs/docs/data-spec/3_backend-db-schema.md`, `docs/docs/tech-specs/9_risk-financial-limits.md`

6.3 [ ] Flag financial limit breaches while accepting non-breaching batch events.
    - References: `docs/docs/tech-specs/9_risk-financial-limits.md`, `docs/docs/api-spec/6_reconciliation.md`

6.4 [ ] Record audit trail entries with card ID, counter, amount, timestamp, and hash.
    - References: `docs/docs/api-spec/7_terminal-reports.md`, `docs/docs/data-spec/3_backend-db-schema.md`

## 7. UI Architecture and Composition

7.1 [ ] Establish atomic UI folder structure: `ui/`, `block/`, `layout/`, `section/`.
    - References: `docs/docs/tech-specs/8_backend-frontend-interfaces.md`, `docs/docs/product-spec/4_acceptance-criteria.md`

7.2 [ ] Keep UI components small and reusable; move page-level logic into hooks and services.
    - References: `docs/docs/system-design/13_client-roles.md`

7.3 [ ] Separate rendering from data loading using React hooks, context, and components.
    - References: `docs/docs/tech-specs/8_backend-frontend-interfaces.md`

7.4 [ ] Implement mobile-first terminal/gate/kiosk UI flows and desktop-first admin flows.
    - References: `docs/docs/product-spec/4_acceptance-criteria.md`

7.5 [ ] Make terminal flows clear with status, error handling, and offline state indicators.
    - References: `docs/docs/product-spec/4_acceptance-criteria.md`, `docs/docs/security-spec/6_data-protection.md`

## 8. Routing and Tenant Management

8.1 [ ] Configure TanStack Router routes for tenant-scoped flows.
    - References: `docs/docs/tech-specs/8_backend-frontend-interfaces.md`, `docs/docs/data-spec/5_multitenancy-auth-local-first.md`

8.2 [ ] Implement a tenant selector/switcher post-login and protect tenant-scoped routes.
    - References: `docs/docs/data-spec/5_multitenancy-auth-local-first.md`, `docs/docs/system-design/13_client-roles.md`

8.3 [ ] Keep route loaders and error boundaries thin; delegate domain logic to hooks and services.
    - References: `docs/docs/tech-specs/8_backend-frontend-interfaces.md`

8.4 [ ] Maintain tenant awareness in local IndexedDB namespaces and policy caches.
    - References: `docs/docs/data-spec/5_multitenancy-auth-local-first.md`

## 9. NFC, Payload Engine, and Crypto Pipeline

9.1 [ ] Implement the NFC pipeline service for card read, validate, and write workflows.
    - References: `docs/docs/tech-specs/4_cryptography.md`, `docs/docs/tech-specs/5_tamper-detection-validation.md`

9.2 [ ] Keep crypto separate from UI in `useNfcCard`, `nfcEngine`, `pipelineEngine`, and `cryptoEngine`.
    - References: `docs/docs/system-design/8_crypto-model.md`

9.3 [ ] Ensure the pipeline is testable independently from UI and sync logic.
    - References: `docs/docs/tech-specs/8_backend-frontend-interfaces.md`

9.4 [ ] Define and implement the card payload engine contract.
    - Functions: `readCard()`, `decodePayload()`, `validateCard()`, `prepareWrite()`, `encodePayload()`, `commitWrite()`, `recoverFromIncompleteWrite()`
    - References: `docs/docs/data-spec/2_card-binary-schema.md`, `docs/docs/data-spec/4_encoding-conventions.md`

9.5 [ ] Implement full payload encode/decode support for the 496-byte card structure.
    - References: `docs/docs/data-spec/2_card-binary-schema.md`, `docs/docs/data-spec/4_encoding-conventions.md`

## 10. Security and Protection Controls

10.1 [ ] Use approved cryptographic algorithms and key lifecycle rules.
    - References: `docs/docs/security-spec/3_cryptographic-controls.md`, `docs/docs/system-design/8_crypto-model.md`

10.2 [ ] Protect tenant-scoped storage and avoid permanent card secrets.
    - References: `docs/docs/security-spec/6_data-protection.md`

10.3 [ ] Enforce RBAC for terminal, gate, and admin flows.
    - References: `docs/docs/security-spec/2_authentication-authorization.md`

10.4 [ ] Validate backend policies before high-risk actions.
    - References: `docs/docs/api-spec/4_policy.md`

10.5 [ ] Ensure IndexedDB and local caches only store authorized tenant data.
    - References: `docs/docs/data-spec/5_multitenancy-auth-local-first.md`

## 11. Test Coverage Plan

11.1 [ ] Add unit tests for card validation, state transitions, crypto primitives, risk limits, and outbox behavior.
    - References: `docs/docs/test-spec/2_unit-tests.md`

11.2 [ ] Add E2E tests for offline transaction flow, session expiry, tamper detection, reconciliation, and tenant isolation.
    - References: `docs/docs/test-spec/3_e2e-tests.md`

11.3 [ ] Trace each test back to specific acceptance criteria.
    - References: `docs/docs/product-spec/4_acceptance-criteria.md`, `docs/docs/test-spec/1_overview.md`
