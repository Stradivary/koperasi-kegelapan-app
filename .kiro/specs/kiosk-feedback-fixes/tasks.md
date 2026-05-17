# Implementation Plan: Kiosk Feedback Fixes

## Overview

This implementation plan addresses 12 bugs in the koperasi kiosk system spanning tenant validation, NFC rapid-tap handling, balance enforcement, error messaging, CRUD synchronization, and audit logging. The approach follows the exploratory bugfix workflow:

1. **Explore** - Write property-based tests BEFORE the fix to confirm bugs exist (Bug Condition)
2. **Preserve** - Write property-based tests for non-buggy behavior on unfixed code (Preservation)
3. **Implement** - Apply fixes across 4 domains: tenant/card classification, rapid-tap debounce, balance/state enforcement, CRUD sync & audit
4. **Validate** - Verify fix works and doesn't break anything

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Kiosk Feedback Defects (Tenant Mismatch, Rapid Tap, Balance Guards, CRUD Sync)
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the 12 bugs exist
  - **Scoped PBT Approach**: Scope properties to concrete failing cases for each bug domain
  - Test Domain 1 - Tenant Mismatch: Create payload with `tenantBind = fnv32a("other-tenant")`, call `validateCard()` with session for current tenant → assert error message is "Kartu anda tidak terdaftar / anda bukan member, harap daftarkan terlebih dahulu di station" and card details (name, balance) are NOT exposed
  - Test Domain 1 - Unregistered Card: Simulate scan with null payload or decode failure → assert same unregistered message is displayed
  - Test Domain 2 - Rapid Tap: Simulate two `reading` events within 500ms while phase is "validating" → assert second event is ignored and payload is not corrupted
  - Test Domain 3 - Low Balance Check-in: Create payload with `wallet.balance = 5000`, trigger auto-checkin → assert check-in is rejected with "Saldo anda dibawah 10rb, harap isi topup dahulu di station"
  - Test Domain 3 - Insufficient Checkout: Create payload with `wallet.balance = 3000` and calculated fee = 4000, trigger checkout → assert rejected with "Saldo anda kurang untuk checkout, harap isi Saldo terlebih dahulu"
  - Test Domain 3 - Checkout Success Display: After successful checkout, assert success view shows only final balance and does NOT render TransactionList/history
  - Test Domain 3 - Registration Without Amount: Trigger Saldo registration without pre-selecting amount → assert registration proceeds without error
  - Test Domain 4 - CRUD Sync: Perform checkout write, inspect outbox → assert `type === "checkout"` (not hardcoded "debit")
  - Test Domain 4 - Audit Log: Perform check-in write, inspect outbox → assert event is created with `type === "checkin"` and amount/timestamp/cardId are recorded
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bugs exist)
  - Document counterexamples found (e.g., "tenant mismatch shows wrong message and leaks card details", "rapid taps cause concurrent state mutations", "low-balance cards pass through check-in without guard", "outbox events have wrong type or are missing")
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Normal Operation Behavior for Valid Cards
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: Valid same-tenant card with balance ≥ 10,000 at check-in → proceeds through full state machine cycle (idle → scanning → classifying → validating → ready → writing → success) on unfixed code
  - Observe: Valid card at checkout with balance ≥ calculated fee → calculates fee, deducts, writes checkout state on unfixed code
  - Observe: Single normal-speed NFC tap → processes through full cycle without interference on unfixed code
  - Observe: Card with ACTIVE status and valid tenant binding → displays member name, balance, and status correctly on unfixed code
  - Observe: Blocked cards (BLOCKED_TAMPER, BLOCKED_FRAUD, BLOCKED_EXPIRED, BLOCKED_ADMIN) → rejected with appropriate blocked reason on unfixed code
  - Observe: Debit transaction at kiosk with sufficient balance → deducts amount and shows remaining balance on unfixed code
  - Write property-based test: for all valid same-tenant cards with balance ≥ 10,000, check-in proceeds normally and writes updated state (from Preservation Requirements 3.1)
  - Write property-based test: for all valid cards with balance ≥ fee, checkout calculates fee, deducts, and writes (from Preservation Requirements 3.2)
  - Write property-based test: for all single-tap scan events at normal speed, state machine transitions are identical (from Preservation Requirements 3.3)
  - Write property-based test: for all cards with ACTIVE status and valid tenant binding, member details display correctly (from Preservation Requirements 3.4)
  - Write property-based test: for all blocked cards, rejection messages match expected blocked reason (from Preservation Requirements 3.5)
  - Write property-based test: for all valid session grants, NFC write operations are allowed (from Preservation Requirements 3.6)
  - Write property-based test: for all debit transactions with sufficient balance, amount is deducted correctly (from Preservation Requirements 3.7)
  - Write property-based test: dual-buffer write scheme continues to use active/inactive pointer correctly (from Preservation Requirements 3.8)
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Fix for kiosk feedback defects (tenant validation, rapid-tap, balance guards, CRUD sync, audit logging)
  - [x] 3.1 Fix tenant mismatch and unregistered card error messages
    - In `src/hooks/useNfcCard.ts`: When `validateCard()` returns invalid with tenant-related reason, set error to "Kartu anda tidak terdaftar / anda bukan member, harap daftarkan terlebih dahulu di station"
    - Ensure `payload` is set to `null` in state after tenant mismatch (no card detail leakage of name, balance, status)
    - In `src/hooks/useNfcCard.ts`: When `extractCardBytes()` returns null or `decodePayload()` throws, set error to "Kartu anda tidak terdaftar / anda bukan member, harap daftarkan terlebih dahulu di station" instead of generic messages
    - In `src/core/nfc/pipelineEngine.ts`: Standardize tenant mismatch reason to a constant/error code that UI maps to the correct Indonesian message
    - _Bug_Condition: isBugCondition(input) where tenantMismatch OR unregisteredCard_
    - _Expected_Behavior: Display "Kartu anda tidak terdaftar / anda bukan member, harap daftarkan terlebih dahulu di station", suppress card details_
    - _Preservation: Valid same-tenant cards continue to display member name, balance, and status (3.4)_
    - _Requirements: 2.1, 2.2, 2.7_

  - [x] 3.2 Implement rapid-tap debounce guard
    - In `src/hooks/useNfcCard.ts`: Add a `lastScanTimestamp` ref initialized to 0
    - In the `reading` event handler, before processing: check `Date.now() - lastScanTimestamp.current < 1000` — if true, return early (ignore the tap)
    - Also ensure the existing `phaseRef` guard covers all non-idle/non-error phases to prevent re-entry
    - Update `lastScanTimestamp.current = Date.now()` when a valid scan begins processing
    - _Bug_Condition: isBugCondition(input) where rapidTap (currentPhase != "idle" AND currentPhase != "error" AND event.type == "reading")_
    - _Expected_Behavior: Ignore subsequent taps within 1s, no payload corruption, no concurrent state mutations_
    - _Preservation: Single normal-speed taps continue to process through full state machine cycle (3.3)_
    - _Requirements: 2.3_

  - [x] 3.3 Add minimum balance check at gate check-in
    - In `src/components/section/GateSection.tsx`: Before calling `write(applyCheckin(...))`, check `payload.wallet.balance < 10_000`
    - If balance is insufficient, set `blockedReason` to "Saldo anda dibawah 10rb, harap isi topup dahulu di station" and return without writing
    - Do NOT proceed with the check-in write operation
    - _Bug_Condition: isBugCondition(input) where lowBalanceCheckin (mode == "gate_checkin" AND wallet.balance < 10_000)_
    - _Expected_Behavior: Reject check-in, display "Saldo anda dibawah 10rb, harap isi topup dahulu di station", no write to card_
    - _Preservation: Cards with balance ≥ 10,000 continue to check-in normally (3.1)_
    - _Requirements: 2.5, 2.10_

  - [x] 3.4 Add insufficient balance check at gate checkout
    - In `src/components/section/GateSection.tsx`: Before calling `write(applyCheckout(...))`, calculate the fee using PARKING_RATE_PER_HOUR and compare against `payload.wallet.balance`
    - If `balance < calculateFee(payload, now)`, display "Saldo anda kurang untuk checkout, harap isi Saldo terlebih dahulu" and return without writing
    - Do NOT proceed with the checkout write operation
    - _Bug_Condition: isBugCondition(input) where insufficientCheckout (mode == "gate_checkout" AND calculateFee > wallet.balance)_
    - _Expected_Behavior: Reject checkout, display "Saldo anda kurang untuk checkout, harap isi Saldo terlebih dahulu", no write to card_
    - _Preservation: Cards with balance ≥ fee continue to checkout normally (3.2)_
    - _Requirements: 2.6, 2.9_

  - [x] 3.5 Fix Saldo registration to work without amount pre-selection
    - In `src/components/section/KioskSection.tsx` (or Saldo screen): Allow card registration to proceed without requiring `selectedAmount` to be set
    - Add a separate "Register" action path that does not depend on `amount` state
    - Provide a custom amount input option for registration
    - _Bug_Condition: isBugCondition(input) where registrationWithoutAmount (mode == "saldo_register" AND selectedAmount == null)_
    - _Expected_Behavior: Registration completes without errors regardless of amount selection state_
    - _Preservation: Normal debit/topup flows with amount selection continue to work (3.7)_
    - _Requirements: 2.4_

  - [x] 3.6 Suppress transaction history on checkout success
    - In the checkout success view (GateSection or KioskSection): Remove or conditionally hide the `<TransactionList>` component
    - Show only the final balance after deduction on the success screen
    - _Bug_Condition: isBugCondition(input) where checkoutShowsHistory (mode == "gate_checkout" AND phase == "success")_
    - _Expected_Behavior: Success screen displays only final balance, no transaction history/log entries_
    - _Preservation: Transaction history remains accessible in other views where appropriate_
    - _Requirements: 2.8_

  - [x] 3.7 Fix CRUD synchronization — correct transaction type in outbox
    - In `src/hooks/useNfcCard.ts`: Modify `write()` to accept an `operationType` parameter (default: "debit")
    - Pass this type to `reconciliationOutbox.add()` instead of hardcoding "debit"
    - Update callers in GateSection: `write(applyCheckin(...), "checkin")` and `write(applyCheckout(...), "checkout")`
    - Update callers in KioskSection: `write(applyDebit(...), "debit")` and `write(applyTopup(...), "topup")`
    - _Bug_Condition: isBugCondition(input) where crudNotSynced (operationType IN ["checkout", "topup", "checkin"] AND outboxEvent.type != operationType)_
    - _Expected_Behavior: Outbox event type matches actual operation performed_
    - _Preservation: Existing debit operations continue to create outbox events with type "debit" (3.7)_
    - _Requirements: 2.11_

  - [x] 3.8 Ensure audit log entries are created for all operations
    - In `src/hooks/useNfcCard.ts`: Ensure `reconciliationOutbox.add()` is called for ALL operation types (checkin, checkout, debit, topup)
    - For check-in (amount=0), still create the event with `type: "checkin"`, `amount: 0`, `cardId`, `timestamp`, and `balanceAfter`
    - In `src/server/reconcile.ts` (`processReconciliation`): Ensure the reconciliation pipeline writes audit_log entries for all operation types and updates the cards table balance
    - _Bug_Condition: isBugCondition(input) where auditEmpty (writeSucceeded == true AND auditLogEntry NOT created)_
    - _Expected_Behavior: Audit log entry recorded with transaction type, amount, card ID, timestamp, and balance-after for every operation_
    - _Preservation: Existing reconciliation pipeline behavior for debit operations unchanged_
    - _Requirements: 2.12_

  - [x] 3.9 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Kiosk Feedback Defects Fixed
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior for all 12 bug conditions
    - When this test passes, it confirms the expected behavior is satisfied for:
      - Tenant mismatch → correct message, no card details leaked
      - Rapid tap → ignored, no corruption
      - Low balance check-in → rejected with correct message
      - Insufficient checkout → rejected with correct message
      - Checkout success → only balance displayed
      - Registration → works without amount
      - CRUD sync → correct operation type in outbox
      - Audit log → events created for all operations
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

  - [x] 3.10 Verify preservation tests still pass
    - **Property 2: Preservation** - Normal Operation Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix:
      - Valid same-tenant cards with balance ≥ 10,000 check-in normally
      - Valid cards with balance ≥ fee checkout normally
      - Single-tap scan cycles produce same state transitions
      - ACTIVE cards display member details correctly
      - Blocked cards show correct rejection messages
      - Valid session grants allow writes
      - Debit transactions work correctly
      - Dual-buffer write scheme intact

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to confirm all property-based tests and unit tests pass
  - Verify no regressions in existing test coverage
  - Ensure all 12 bug conditions are addressed and validated
  - Ask the user if questions arise

## Notes

- Tasks 1 and 2 are standalone property-based test tasks that MUST be completed BEFORE implementation
- Task 1 (Bug Condition) tests are expected to FAIL on unfixed code — this confirms the bugs exist
- Task 2 (Preservation) tests are expected to PASS on unfixed code — this captures baseline behavior
- After implementation (task 3), task 1 tests should PASS and task 2 tests should still PASS
- The fix spans 4 domains: tenant/card classification, rapid-tap debounce, balance/state enforcement, CRUD sync & audit
- Key files to modify: `src/hooks/useNfcCard.ts`, `src/components/section/GateSection.tsx`, `src/components/section/KioskSection.tsx`, `src/core/nfc/pipelineEngine.ts`, `src/server/reconcile.ts`
- All error messages must be in Indonesian as specified in the requirements
- PARKING_RATE_PER_HOUR = 2,000 Rp per hour for checkout fee calculation
- The dual-buffer write scheme (active/inactive pointer) must remain intact throughout all changes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8"] },
    { "id": 3, "tasks": ["3.9", "3.10"] },
    { "id": 4, "tasks": ["4"] }
  ]
}
```
