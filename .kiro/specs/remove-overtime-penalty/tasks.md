# Implementation Plan

## Overview

Remove the overtime penalty feature entirely. The fix eliminates the overtime detection, penalty calculation, and card reset code paths so that all checkouts — regardless of session duration — use the standard `applyCheckout` function with `ceil(hours) × PARKING_RATE_PER_HOUR` capped at balance.

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Overtime Sessions Route to Penalty Instead of Normal Checkout
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the overtime penalty routing exists
  - **Scoped PBT Approach**: Generate card payloads with sessions exceeding 86400 seconds (24 hours) and assert that checkout produces standard parking fee via `applyCheckout` (not penalty deduction)
  - Bug Condition from design: `isBugCondition(input)` where `durationSeconds > 86400 AND payload.wallet.state == CHECKED_IN AND payload.session.startTime > 0`
  - Test that for sessions > 86400s, the checkout result satisfies:
    - `result.wallet.state == CHECKED_OUT` (not IDLE from resetWithPenalty)
    - `result.wallet.balance == payload.wallet.balance - min(ceil(durationSeconds/3600) * PARKING_RATE_PER_HOUR, payload.wallet.balance)`
    - `result.session.endTime == nowSeconds`
    - No penalty calculation occurred (fee is standard parking fee, not overtimeHours × tariffRate)
  - Concrete failing cases to scope: 25-hour session (90000s), 48-hour session (172800s), just-over-24h session (86401s)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the overtime penalty routing exists)
  - Document counterexamples: sessions > 24h produce penalty deductions instead of standard fees, low-balance sessions are blocked entirely
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Overtime Checkout Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for sessions ≤ 86400 seconds using `applyCheckout`:
    - Observe: `applyCheckout(payload, nowSeconds)` for 12-hour session produces correct fee `ceil(12) * PARKING_RATE_PER_HOUR` capped at balance
    - Observe: `applyCheckout(payload, nowSeconds)` for 1-hour session produces correct fee
    - Observe: Blocked cards are rejected with blocked reason message via `checkLocalBlockedStatus`
    - Observe: Invalid state transitions produce "Transisi tidak valid" via `validateTransition`
    - Observe: Cards in IDLE/CHECKED_OUT state show "Belum Check-in"/"Sudah Checkout" messages
  - Write property-based tests: for all inputs where `durationSeconds <= 86400`, verify:
    - `applyCheckout` produces `result.wallet.balance == payload.wallet.balance - min(ceil(durationSeconds/3600) * PARKING_RATE_PER_HOUR, payload.wallet.balance)`
    - `result.wallet.state == CHECKED_OUT`
    - `result.session.endTime == nowSeconds`
    - Fee label is "Biaya" with standard parking fee amount
  - Generate random card payloads with sessions ≤ 24 hours and various balances
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3. Remove overtime penalty code and simplify checkout flow
  - [ ] 3.1 Delete overtime penalty modules
    - Delete `src/core/nfc/overtimeCheckout.ts` — orchestrates overtime detection and penalty deduction
    - Delete `src/core/validation/overtimeValidator.ts` — detects sessions exceeding 24 hours
    - Delete `src/core/validation/penaltyCalculator.ts` — computes penalty amount (overtimeHours × tariffRate)
    - Delete `src/core/validation/cardResetHandler.ts` — implements resetWithPenalty/applyReset parallel flow
    - Delete associated test files:
      - `src/core/nfc/__tests__/overtimeCheckout.test.ts`
      - `src/core/validation/__tests__/penaltyCalculator.test.ts`
      - Any test files for `overtimeValidator` and `cardResetHandler`
    - _Bug_Condition: isBugCondition(input) where durationSeconds > 86400 routes to these modules_
    - _Expected_Behavior: These modules are no longer needed — all checkouts use applyCheckout_
    - _Preservation: Non-overtime checkout paths do not reference these modules_
    - _Requirements: 2.1, 2.4_

  - [ ] 3.2 Modify TerminalSection.tsx to remove overtime logic
    - Remove import of `performOvertimeCheckout` and `DEFAULT_OVERTIME_TARIFF_RATE` from `../../core/nfc/overtimeCheckout`
    - Add import of `applyCheckout` from `../../core/state-machine/engine` (if not already imported)
    - Replace `performOvertimeCheckout(...)` call with direct `applyCheckout(payload, nowSeconds)` call
    - Remove `overtime` and `penaltyAmount` fields from the `lastTx` state type
    - Remove conditional "Denda Overtime" fee label — always use "Biaya"
    - Remove "⚠ Overtime — Denda diterapkan" warning row from success UI
    - _Bug_Condition: isBugCondition(input) triggers performOvertimeCheckout routing in this component_
    - _Expected_Behavior: All checkouts call applyCheckout directly, UI always shows "Biaya" label_
    - _Preservation: Non-overtime UI elements (member name, duration, fee, balance) remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 3.3 Verify no remaining references to deleted modules
    - Search codebase for any imports of `overtimeCheckout`, `overtimeValidator`, `penaltyCalculator`, `cardResetHandler`
    - Remove any remaining references found
    - Ensure no TypeScript compilation errors from missing imports
    - _Requirements: 2.4_

  - [ ] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Overtime Sessions Use Normal Checkout
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (standard parking fee for all sessions)
    - When this test passes, it confirms all sessions > 24h now use `applyCheckout` correctly
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms overtime penalty is removed and standard checkout is used)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Overtime Checkout Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions for sessions ≤ 24 hours)
    - Confirm all non-overtime checkout behavior is unchanged after fix
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to confirm no regressions
  - Verify TypeScript compilation succeeds with no errors
  - Confirm deleted modules are not referenced anywhere
  - Ensure all property-based tests (bug condition + preservation) pass
  - Ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Write exploration and preservation tests on UNFIXED code (can run in parallel)"
    },
    {
      "wave": 2,
      "tasks": ["3.1"],
      "description": "Delete overtime penalty modules"
    },
    {
      "wave": 3,
      "tasks": ["3.2"],
      "description": "Modify TerminalSection.tsx to remove overtime logic"
    },
    {
      "wave": 4,
      "tasks": ["3.3"],
      "description": "Verify no remaining references to deleted modules"
    },
    {
      "wave": 5,
      "tasks": ["3.4", "3.5"],
      "description": "Re-run exploration and preservation tests to validate fix"
    },
    {
      "wave": 6,
      "tasks": ["4"],
      "description": "Final checkpoint - ensure all tests pass"
    }
  ]
}
```

## Notes

- Tasks 1 and 2 are independent and can be done in parallel — both run on UNFIXED code
- Task 1 is expected to FAIL on unfixed code (confirms the overtime penalty routing exists)
- Task 2 is expected to PASS on unfixed code (captures baseline behavior to preserve)
- Tasks 3.1 and 3.2 are the core implementation — delete modules then simplify TerminalSection
- Tasks 3.4 and 3.5 re-run the same tests from tasks 1 and 2 to validate the fix
- Files to delete: `overtimeCheckout.ts`, `overtimeValidator.ts`, `penaltyCalculator.ts`, `cardResetHandler.ts` and their tests
- File to modify: `TerminalSection.tsx` (remove overtime imports, UI elements, simplify checkout call)
