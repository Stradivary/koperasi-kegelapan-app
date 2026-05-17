# Kiosk Feedback Fixes — Bugfix Design

## Overview

This design addresses 12 bugs in the koperasi kiosk system spanning tenant validation, NFC rapid-tap handling, balance enforcement, error messaging, CRUD synchronization, and audit logging. The bugs cause incorrect fallback messages, card detail leakage, payload corruption, missing balance guards, stale backend data, and empty audit logs. The fix strategy is grouped into four domains:

1. **Tenant & Card Classification** (Bugs 1.1, 1.2, 1.7): Correct the error path when a card fails tenant validation or is unregistered — display the correct Indonesian message and suppress card details.
2. **Rapid-Tap Debounce** (Bug 1.3): Guard the NFC scan entry point so duplicate `reading` events are ignored while a cycle is in progress.
3. **Balance & State Enforcement** (Bugs 1.4, 1.5, 1.6, 1.8, 1.9, 1.10): Add pre-write balance checks at Gate check-in (minimum 10,000) and checkout (balance ≥ fee), fix the Saldo registration flow, and suppress transaction history on checkout success.
4. **CRUD Sync & Audit Logging** (Bugs 1.11, 1.12): Ensure every NFC write operation enqueues a reconciliation outbox event with the correct transaction type, and that the reconciliation pipeline updates the backend DB for all operation types (not just debit).

## Glossary

- **Bug_Condition (C)**: The set of inputs/states that trigger one of the 12 defective behaviors
- **Property (P)**: The desired correct behavior when the bug condition holds
- **Preservation**: Existing correct behaviors that must remain unchanged after the fix
- **`useNfcCard`**: The hook in `src/hooks/useNfcCard.ts` that manages NFC scan/write lifecycle
- **`validateCard`**: The function in `src/core/nfc/pipelineEngine.ts` that checks HMAC, tenant bind, and chain hash
- **`nfcReducer`**: The state machine in `src/core/nfc/stateMachine.ts` managing NFC phases
- **`GateSection`**: The component in `src/components/section/GateSection.tsx` handling check-in/checkout
- **`KioskSection`**: The component in `src/components/section/KioskSection.tsx` handling debit transactions
- **`reconciliationOutbox`**: The IndexedDB store in `src/lib/indexeddb.ts` that queues events for backend sync
- **`processReconciliation`**: The server function in `src/server/reconcile.ts` that writes audit_log and updates cards table
- **tenantBind**: FNV-32a hash of tenantId stored in card header (0 = unbound legacy card)
- **PARKING_RATE_PER_HOUR**: 2,000 Rp per hour, used to calculate checkout fee

## Bug Details

### Bug Condition

The bugs manifest across multiple scenarios in the Gate and Kiosk modes. The overarching condition is:

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type { event: NfcScanEvent, context: OperationContext }
  OUTPUT: boolean

  // Domain 1: Tenant mismatch / unregistered card
  LET tenantMismatch = input.event.payload != null
    AND input.event.payload.header.tenantBind != 0
    AND input.event.payload.header.tenantBind != fnv32a(input.context.tenantId)

  LET unregisteredCard = input.event.rawBytes == null
    OR decodeFails(input.event.rawBytes)
    OR input.event.payload == null

  // Domain 2: Rapid tap
  LET rapidTap = input.context.currentPhase != "idle"
    AND input.context.currentPhase != "error"
    AND input.event.type == "reading"

  // Domain 3: Balance enforcement
  LET lowBalanceCheckin = input.context.mode == "gate_checkin"
    AND input.event.payload != null
    AND input.event.payload.wallet.balance < 10_000

  LET insufficientCheckout = input.context.mode == "gate_checkout"
    AND input.event.payload != null
    AND calculateFee(input.event.payload) > input.event.payload.wallet.balance

  LET registrationWithoutAmount = input.context.mode == "saldo_register"
    AND input.context.selectedAmount == null

  LET checkoutShowsHistory = input.context.mode == "gate_checkout"
    AND input.context.phase == "success"

  // Domain 4: CRUD sync / audit
  LET crudNotSynced = input.context.operationType IN ["checkout", "topup", "checkin"]
    AND input.context.writeSucceeded == true
    AND (outboxEvent.type != input.context.operationType OR outboxEvent NOT created)

  LET auditEmpty = input.context.writeSucceeded == true
    AND auditLogEntry NOT created

  RETURN tenantMismatch OR unregisteredCard OR rapidTap
    OR lowBalanceCheckin OR insufficientCheckout
    OR registrationWithoutAmount OR checkoutShowsHistory
    OR crudNotSynced OR auditEmpty
END FUNCTION
```

### Examples

- **Bug 1.1/1.2**: Card with `tenantBind = fnv32a("tenant-B")` scanned at terminal bound to `"tenant-A"` → system currently shows card details (name, balance) instead of "Kartu anda tidak terdaftar" message
- **Bug 1.3**: User taps card 3 times within 500ms → second and third `reading` events fire while phase is `"validating"` or `"writing"`, causing concurrent state mutations and payload corruption
- **Bug 1.5/1.10**: Card with balance 5,000 scanned at gate check-in → system proceeds with check-in instead of rejecting with "Saldo anda dibawah 10rb"
- **Bug 1.6/1.9**: Card with balance 3,000 at checkout where fee is 4,000 → system attempts write instead of showing "Saldo anda kurang untuk checkout"
- **Bug 1.7**: Card with no valid NDEF payload or unknown magic → system shows generic error instead of "Kartu anda tidak terdaftar"
- **Bug 1.8**: Checkout success screen shows `<TransactionList>` log entries instead of only final balance
- **Bug 1.11**: After checkout write, `reconciliationOutbox.add()` is called with `type: "debit"` hardcoded instead of `"checkout"`, so backend never records the deduction
- **Bug 1.12**: Check-in operations never call `reconciliationOutbox.add()` at all, leaving audit_log empty for check-in events

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Valid same-tenant cards with sufficient balance (≥ 10,000) SHALL continue to check-in normally through the full state machine cycle
- Valid cards at checkout with sufficient balance SHALL continue to calculate fee, deduct, and write
- Single normal-speed NFC taps SHALL continue to process through idle → scanning → classifying → validating → ready → writing → success
- Cards with ACTIVE status and valid tenant binding SHALL continue to display member name, balance, and status
- Blocked cards (BLOCKED_TAMPER, BLOCKED_FRAUD, BLOCKED_EXPIRED, BLOCKED_ADMIN) SHALL continue to reject with appropriate blocked reason
- Valid session grants SHALL continue to allow NFC write operations
- Debit transactions at kiosk with sufficient balance SHALL continue to work
- Dual-buffer write scheme (active/inactive pointer) SHALL continue to prevent data loss on interrupted writes

**Scope:**
All inputs that do NOT trigger any of the 12 bug conditions should be completely unaffected by this fix. This includes:

- Normal single-tap scan cycles with valid same-tenant cards
- Cards with balance ≥ 10,000 at check-in
- Cards with balance ≥ calculated fee at checkout
- Mouse/touch interactions on UI elements
- Session grant validation and renewal flows

## Hypothesized Root Cause

Based on the bug descriptions and code analysis, the most likely issues are:

1. **Tenant Mismatch Message (Bugs 1.1, 1.2)**: In `useNfcCard.ts`, when `validateCard()` returns `{ valid: false, reason: "Kartu bukan milik tenant ini" }`, the error is displayed as-is. The UI does not suppress card details that were already decoded before validation failed. The message should be the standard unregistered message and card details should be cleared from state.

2. **Rapid-Tap Race Condition (Bug 1.3)**: In `useNfcCard.ts`, the `reading` event handler guards on `phase === "scanning"` for the first read and `phase === "writing"` for the write tap. However, if the card stays in range, the NFC reader fires multiple `reading` events. The `phaseRef` guard prevents re-entry during `validating`, but there's no debounce timestamp to prevent a second scan cycle from starting if the user lifts and re-taps quickly before the first cycle completes its async work.

3. **Missing Balance Guard at Gate (Bugs 1.5, 1.6, 1.9, 1.10)**: In `GateSection.tsx`, the `useEffect` that auto-triggers check-in calls `validateTransition()` but does NOT check `payload.wallet.balance < 10_000` before proceeding. Similarly, checkout logic in the checkout section does not pre-validate balance against the calculated fee.

4. **Unregistered Card Message (Bug 1.7)**: When `extractCardBytes()` returns null or `decodePayload()` throws, the error message is set to a generic "Kartu tidak berisi data yang valid" or "Decode gagal" instead of the required Indonesian message "Kartu anda tidak terdaftar / anda bukan member, harap daftarkan terlebih dahulu di station".

5. **Registration Without Amount (Bug 1.4)**: The Saldo/balance screen requires an amount selection before allowing card registration, but the flow should allow registration independently of amount selection.

6. **Checkout Success Shows History (Bug 1.8)**: In the checkout success view, the component renders `<TransactionList>` showing log entries. It should only show the final balance after deduction.

7. **Hardcoded Transaction Type in Outbox (Bug 1.11)**: In `useNfcCard.ts` line 185, `reconciliationOutbox.add()` always sets `type: "debit"` regardless of the actual operation (checkout, topup, checkin). The `write()` function doesn't receive or propagate the operation type.

8. **Missing Outbox Entry for Non-Debit Operations (Bug 1.12)**: The `GateSection` calls `write(applyCheckin(...))` but the `useNfcCard.write()` function only enqueues a reconciliation event in the `reading` handler's write phase. For check-in, the reconciliation event is either not created or created with wrong type. The amount calculation `currentPayload.wallet.balance - updatedPayload.wallet.balance` yields 0 for check-in (no balance change), which may cause the event to be skipped or the type to be wrong.

## Correctness Properties

Property 1: Bug Condition - Tenant Mismatch and Unregistered Card Feedback

_For any_ NFC scan where the card fails tenant validation (tenantBind ≠ fnv32a(currentTenantId) and tenantBind ≠ 0) OR the card has no valid payload, the system SHALL display "Kartu anda tidak terdaftar / anda bukan member, harap daftarkan terlebih dahulu di station" and SHALL NOT expose any card details (name, balance, status).

**Validates: Requirements 2.1, 2.2, 2.7**

Property 2: Bug Condition - Rapid Tap Debounce

_For any_ sequence of NFC `reading` events where the time between consecutive events is < 1 second and the NFC phase is not `idle` or `error`, the system SHALL ignore all events after the first and SHALL NOT corrupt or clean up the existing payload.

**Validates: Requirements 2.3**

Property 3: Bug Condition - Minimum Balance at Check-in

_For any_ card scanned at gate check-in where `wallet.balance < 10_000`, the system SHALL reject the check-in and display "Saldo anda dibawah 10rb, harap isi topup dahulu di station" without writing to the card.

**Validates: Requirements 2.5, 2.10**

Property 4: Bug Condition - Insufficient Balance at Checkout

_For any_ card scanned at gate checkout where `wallet.balance < calculateFee(payload, now)`, the system SHALL reject the checkout and display "Saldo anda kurang untuk checkout, harap isi Saldo terlebih dahulu" without writing to the card.

**Validates: Requirements 2.6, 2.9**

Property 5: Bug Condition - Checkout Success Display

_For any_ successful checkout operation, the success screen SHALL display only the final balance after deduction and SHALL NOT show transaction history/log entries.

**Validates: Requirements 2.8**

Property 6: Bug Condition - CRUD Synchronization

_For any_ successful NFC write operation (check-in, checkout, debit, topup), the system SHALL enqueue a reconciliation outbox event with the correct transaction type matching the actual operation performed, and the backend SHALL update both audit_log and cards table.

**Validates: Requirements 2.11, 2.12**

Property 7: Preservation - Normal Operation Behavior

_For any_ input where none of the bug conditions hold (valid same-tenant card, sufficient balance, single tap, correct operation type), the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing functionality for normal NFC operations.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/hooks/useNfcCard.ts`

**Function**: `scan()` — reading event handler, `write()`

**Specific Changes**:

1. **Tenant Mismatch Error Message**: When `validateCard()` returns invalid with tenant-related reason, set error to "Kartu anda tidak terdaftar / anda bukan member, harap daftarkan terlebih dahulu di station" and ensure `payload` is set to `null` in state (no card detail leakage).

2. **Unregistered Card Message**: When `extractCardBytes()` returns null or `decodePayload()` throws, set error to "Kartu anda tidak terdaftar / anda bukan member, harap daftarkan terlebih dahulu di station" instead of generic messages.

3. **Rapid-Tap Debounce**: Add a `lastScanTimestamp` ref. In the `reading` event handler, before processing, check if `Date.now() - lastScanTimestamp < 1000`. If so, return early. Also ensure the existing `phaseRef` guard covers all non-idle/non-error phases.

4. **Transaction Type in Outbox**: Modify `write()` to accept an optional `operationType` parameter (default: "debit"). Pass this type to the reconciliation outbox entry instead of hardcoding "debit". Update all callers (GateSection, KioskSection) to pass the correct type.

5. **Reconciliation for All Operations**: Ensure `reconciliationOutbox.add()` is called for check-in and checkout operations, not just debit. For check-in (amount=0), still create the event with `type: "checkin"` and `amount: 0`.

---

**File**: `src/components/section/GateSection.tsx`

**Function**: `useEffect` (auto check-in logic)

**Specific Changes**:

1. **Minimum Balance Check**: Before calling `write(applyCheckin(...))`, check `payload.wallet.balance < 10_000`. If true, set `blockedReason` to "Saldo anda dibawah 10rb, harap isi topup dahulu di station" and return without writing.

2. **Insufficient Balance at Checkout**: In the checkout flow, before calling `write(applyCheckout(...))`, calculate the fee and compare against balance. If insufficient, display "Saldo anda kurang untuk checkout, harap isi Saldo terlebih dahulu".

3. **Pass Operation Type**: Call `write(applyCheckin(...), "checkin")` and `write(applyCheckout(...), "checkout")` to propagate the correct type.

---

**File**: `src/components/section/GateSection.tsx` (checkout success view) or equivalent checkout component

**Specific Changes**:

1. **Suppress Transaction History**: In the checkout success state, remove or hide the `<TransactionList>` component. Show only the final balance.

---

**File**: `src/components/section/KioskSection.tsx`

**Specific Changes**:

1. **Checkout Success Display (Bug 1.8)**: If this component handles checkout success, remove `<TransactionList>` from the success view. Currently the kiosk "done" step shows `<TransactionList>` — this should be removed for checkout mode or conditionally hidden.

2. **Registration Without Amount (Bug 1.4)**: In the Saldo/balance screen, allow card registration to proceed without requiring amount pre-selection. Add a separate "Register" action that doesn't depend on `amount` state.

---

**File**: `src/core/nfc/pipelineEngine.ts`

**Function**: `validateCard()`

**Specific Changes**:

1. **Standardize Tenant Mismatch Reason**: Change the reason string from "Kartu bukan milik tenant ini" to a constant or error code that the UI layer can map to the correct Indonesian message consistently.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that simulate each bug condition and assert the expected (correct) behavior. Run these tests on the UNFIXED code to observe failures and confirm the bugs exist.

**Test Cases**:

1. **Tenant Mismatch Test**: Create a payload with `tenantBind = fnv32a("other-tenant")`, call `validateCard()` with session for "my-tenant" → assert error message is the standard unregistered message (will fail on unfixed code — currently shows "Kartu bukan milik tenant ini")
2. **Rapid Tap Test**: Simulate two `reading` events within 500ms while phase is "validating" → assert second event is ignored (will fail on unfixed code — currently processes both)
3. **Low Balance Check-in Test**: Create payload with balance 5,000, trigger auto-checkin in GateSection → assert check-in is rejected with correct message (will fail on unfixed code — currently allows check-in)
4. **Insufficient Checkout Test**: Create payload with balance 3,000 and fee 4,000, trigger checkout → assert checkout is rejected (will fail on unfixed code — currently proceeds)
5. **Outbox Type Test**: Perform a checkout write, inspect outbox entry → assert `type === "checkout"` (will fail on unfixed code — currently "debit")
6. **Audit Log Test**: Perform a check-in write, inspect outbox → assert event is created with `type === "checkin"` (will fail on unfixed code — no event created)

**Expected Counterexamples**:

- Tenant mismatch shows wrong error message and leaks card details
- Rapid taps cause concurrent state mutations
- Low-balance cards pass through check-in without guard
- Outbox events have wrong type or are missing entirely

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := processNfcEvent_fixed(input)
  ASSERT expectedBehavior(result)
  // Specifically:
  // - Tenant mismatch → correct message, no card details
  // - Rapid tap → ignored, no corruption
  // - Low balance → rejected with message
  // - Insufficient checkout → rejected with message
  // - Success display → only balance, no history
  // - Outbox → correct type, event exists
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT processNfcEvent_original(input) = processNfcEvent_fixed(input)
  // Specifically:
  // - Valid same-tenant card → same scan/validate/ready flow
  // - Sufficient balance → same check-in/checkout flow
  // - Single tap → same state machine transitions
  // - Blocked cards → same rejection messages
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many random card payloads with varying balances, tenant bindings, and states
- It catches edge cases around boundary values (balance exactly 10,000, fee exactly equal to balance)
- It provides strong guarantees that normal operations are unchanged

**Test Plan**: Observe behavior on UNFIXED code first for valid cards with sufficient balance, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Normal Check-in Preservation**: Generate random valid payloads with balance ≥ 10,000 and same tenant → verify check-in proceeds identically
2. **Normal Checkout Preservation**: Generate random valid payloads with balance ≥ fee → verify checkout proceeds identically
3. **Single Tap Preservation**: Verify single-tap scan cycles produce same state transitions
4. **Blocked Card Preservation**: Verify blocked cards still show correct rejection messages

### Unit Tests

- Test `validateCard()` returns correct error code/message for tenant mismatch
- Test `useNfcCard` ignores rapid taps (mock `Date.now()`)
- Test GateSection rejects check-in when balance < 10,000
- Test GateSection rejects checkout when balance < fee
- Test checkout success view does not render TransactionList
- Test `reconciliationOutbox.add()` is called with correct type for each operation
- Test Saldo registration works without amount pre-selection
- Test unregistered card (null payload) shows correct message

### Property-Based Tests

- Generate random `CardPayload` with `tenantBind ∈ {0, fnv32a(currentTenant), fnv32a(otherTenant)}` → verify correct message selection
- Generate random balances in range [0, 100_000] and random fees → verify balance guard triggers correctly at threshold 10,000
- Generate random sequences of NFC events with varying timestamps → verify debounce correctly filters events < 1s apart
- Generate random valid payloads with balance ≥ 10,000 → verify check-in behavior is preserved unchanged

### Integration Tests

- Test full gate check-in flow: scan → validate → balance check → write → success
- Test full gate checkout flow: scan → validate → fee calculation → balance check → write → success (balance only)
- Test reconciliation pipeline: write → outbox event → POST /api/reconcile → audit_log + cards table updated
- Test rapid-tap scenario end-to-end: multiple taps → only first processed, no corruption
- Test tenant mismatch end-to-end: foreign card → correct message displayed, no write attempted
