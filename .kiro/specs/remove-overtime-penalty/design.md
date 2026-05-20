# Remove Overtime Penalty Bugfix Design

## Overview

The overtime penalty feature is unwanted functionality that must be completely removed. Currently, when a session exceeds 24 hours (86400 seconds), the system routes through `performOvertimeCheckout` → `checkOvertime` → `calculatePenalty` → `resetWithPenalty` → `applyReset`, deducting a penalty from the member's balance. The fix eliminates this entire code path so that all checkouts — regardless of session duration — use the standard `applyCheckout` function from the state machine engine, which charges `hours × PARKING_RATE_PER_HOUR` capped at balance.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the unwanted behavior — when a session exceeds 86400 seconds and the system routes to overtime penalty calculation instead of normal checkout
- **Property (P)**: The desired behavior — all checkouts use `applyCheckout` with standard parking fee regardless of duration
- **Preservation**: Existing non-overtime checkout behavior, blocked card handling, state transitions, NFC write, and sync that must remain unchanged
- **`performOvertimeCheckout`**: The function in `src/core/nfc/overtimeCheckout.ts` that orchestrates overtime detection and penalty deduction
- **`checkOvertime`**: The function in `src/core/validation/overtimeValidator.ts` that detects sessions exceeding 24 hours
- **`calculatePenalty`**: The function in `src/core/validation/penaltyCalculator.ts` that computes penalty amount (overtimeHours × tariffRate)
- **`resetWithPenalty`**: The function in `src/core/validation/cardResetHandler.ts` that validates penalty deduction eligibility
- **`applyReset`**: The function in `src/core/validation/cardResetHandler.ts` that produces a new payload with penalty deducted and state set to IDLE
- **`applyCheckout`**: The function in `src/core/state-machine/engine.ts` that performs standard checkout (hours × PARKING_RATE_PER_HOUR, capped at balance, state → CHECKED_OUT)
- **PARKING_RATE_PER_HOUR**: The standard hourly parking rate used by `applyCheckout`

## Bug Details

### Bug Condition

The bug manifests when a session duration exceeds 86400 seconds (24 hours). The `performOvertimeCheckout` function detects overtime via `checkOvertime`, calculates a penalty via `calculatePenalty`, and either deducts the penalty (blocking checkout if balance is insufficient) or routes through `resetWithPenalty`/`applyReset` instead of the standard `applyCheckout` flow.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type { payload: CardPayload, nowSeconds: number }
  OUTPUT: boolean

  LET durationSeconds = input.nowSeconds - input.payload.session.startTime
  RETURN durationSeconds > 86400
         AND input.payload.wallet.state == CHECKED_IN
         AND input.payload.session.startTime > 0
END FUNCTION
```

### Examples

- Session of 90000 seconds (25 hours): System calculates `ceil((90000-86400)/3600) × 5000 = 5000 IDR` penalty and deducts from balance. **Expected**: Normal checkout with `ceil(90000/3600) × PARKING_RATE_PER_HOUR` fee capped at balance.
- Session of 172800 seconds (48 hours) with balance 10000 IDR: System blocks checkout with "Saldo tidak cukup untuk denda overtime". **Expected**: Normal checkout proceeds, charging `min(48 × PARKING_RATE_PER_HOUR, 10000)`.
- Session of 86401 seconds (just over 24 hours): System displays "Denda Overtime" and "⚠ Overtime — Denda diterapkan". **Expected**: Displays "Biaya" with standard parking fee, no overtime indicators.
- Session of 86000 seconds (under 24 hours): System performs normal checkout via `applyCheckout`. **Expected**: Same behavior (unchanged).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Normal checkout for sessions ≤ 24 hours must continue to use `applyCheckout` with standard fee calculation
- Blocked card detection via `checkLocalBlockedStatus` must continue to reject checkout with the blocked reason
- State transition validation via `validateTransition` must continue to reject invalid transitions with "Transisi tidak valid"
- NFC card write after successful checkout must continue to work
- Sync engine notification after successful checkout must continue to trigger
- Success UI displaying member name, duration, fee ("Biaya"), and remaining balance must continue to render correctly
- Cards in IDLE or CHECKED_OUT state must continue to show "Belum Check-in" or "Sudah Checkout" messages

**Scope:**
All inputs where the session duration is ≤ 86400 seconds should be completely unaffected by this fix. Additionally, all non-checkout operations (check-in, top-up, debit) are unaffected. The fix only changes the behavior for sessions exceeding 24 hours — making them follow the same checkout path as shorter sessions.

## Hypothesized Root Cause

This is not a traditional bug but rather unwanted feature removal. The "root cause" is the existence of the overtime penalty code path:

1. **Overtime Detection Routing**: `performOvertimeCheckout` in `src/core/nfc/overtimeCheckout.ts` calls `checkOvertime` and branches on `overtimeResult.overtime === true`, routing to penalty logic instead of `applyCheckout`

2. **Penalty Calculation Module**: `calculatePenalty` in `src/core/validation/penaltyCalculator.ts` computes `ceil((duration - 86400) / 3600) × tariffRate`, producing a penalty amount that gets deducted

3. **Balance-Insufficient Blocking**: When `penalty.action === "TOPUP_REQUIRED"`, the system returns an error blocking checkout entirely — this should never happen since normal checkout caps fee at balance

4. **UI Conditional Rendering**: `TerminalSection.tsx` conditionally renders "Denda Overtime" label and "⚠ Overtime — Denda diterapkan" warning based on `lastTx.overtime` flag

5. **Separate Reset Path**: `resetWithPenalty` and `applyReset` in `cardResetHandler.ts` implement a parallel reset flow that sets state to IDLE (not CHECKED_OUT) and deducts penalty — different from the standard `applyCheckout` which sets state to CHECKED_OUT and deducts parking fee

## Correctness Properties

Property 1: Bug Condition - Overtime Sessions Use Normal Checkout

_For any_ input where the session duration exceeds 86400 seconds (isBugCondition returns true), the fixed checkout flow SHALL use `applyCheckout` with the standard parking fee calculation (`ceil(durationSeconds / 3600) × PARKING_RATE_PER_HOUR`, capped at balance), setting state to CHECKED_OUT, and SHALL NOT calculate or deduct any overtime penalty.

**Validates: Requirements 2.1, 2.2, 2.4**

Property 2: Preservation - Non-Overtime Checkout Behavior

_For any_ input where the session duration is ≤ 86400 seconds (isBugCondition returns false), the fixed checkout flow SHALL produce exactly the same result as the original code, preserving the standard `applyCheckout` behavior, blocked card rejection, invalid transition rejection, NFC write, and sync notification.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/components/section/TerminalSection.tsx`

**Changes**:

1. **Remove overtime import**: Remove the import of `performOvertimeCheckout` and `DEFAULT_OVERTIME_TARIFF_RATE` from `../../core/nfc/overtimeCheckout`
2. **Import applyCheckout directly**: Add import of `applyCheckout` from `../../core/state-machine/engine`
3. **Replace checkout call**: Replace the `performOvertimeCheckout(...)` call with a direct call to `applyCheckout(payload, nowSeconds)` — this is synchronous, no `.then()` needed
4. **Simplify lastTx state**: Remove `overtime` and `penaltyAmount` fields from the `lastTx` state type
5. **Remove overtime UI elements**: Remove the conditional "Denda Overtime" label and the "⚠ Overtime — Denda diterapkan" warning row
6. **Always show "Biaya" label**: The fee label should always be "Biaya" (no conditional)

**File**: `src/core/nfc/overtimeCheckout.ts`

**Change**: Delete this file entirely — it is no longer needed

**File**: `src/core/validation/overtimeValidator.ts`

**Change**: Delete this file entirely — overtime detection is no longer needed

**File**: `src/core/validation/penaltyCalculator.ts`

**Change**: Delete this file entirely — penalty calculation is no longer needed

**File**: `src/core/validation/cardResetHandler.ts`

**Change**: Delete this file entirely — `resetWithPenalty` and `applyReset` are only used by the overtime flow

**Files**: Test files for deleted modules

**Change**: Delete associated test files:

- `src/core/nfc/__tests__/overtimeCheckout.test.ts`
- `src/core/validation/__tests__/penaltyCalculator.test.ts`
- Any test files for `overtimeValidator` and `cardResetHandler`

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the unwanted overtime penalty behavior on unfixed code, then verify the fix removes it correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the overtime penalty behavior BEFORE implementing the fix. Confirm that the overtime routing exists and produces penalty deductions.

**Test Plan**: Write tests that create card payloads with sessions exceeding 24 hours and call the checkout flow, asserting that the current code incorrectly routes to penalty calculation. Run these tests on the UNFIXED code to observe the unwanted behavior.

**Test Cases**:

1. **25-hour session test**: Create payload with 25-hour session, call `performOvertimeCheckout` — observe penalty deduction instead of normal fee (will demonstrate unwanted behavior on unfixed code)
2. **48-hour insufficient balance test**: Create payload with 48-hour session and low balance — observe checkout blocked with "Saldo tidak cukup" (will demonstrate unwanted behavior on unfixed code)
3. **Just-over-24h test**: Create payload with 86401-second session — observe penalty of 5000 IDR deducted (will demonstrate unwanted behavior on unfixed code)
4. **Normal session test**: Create payload with 12-hour session — observe normal checkout via `applyCheckout` (baseline, works correctly)

**Expected Counterexamples**:

- Sessions > 24h produce penalty deductions instead of standard parking fees
- Sessions > 24h with low balance are blocked entirely instead of proceeding with capped fee
- Possible causes: `checkOvertime` returns `overtime: true`, routing to `resetWithPenalty`/`applyReset` path

### Fix Checking

**Goal**: Verify that for all inputs where the session exceeds 24 hours, the fixed checkout flow uses `applyCheckout` with standard parking fee.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := checkoutFixed(input.payload, input.nowSeconds)
  ASSERT result.wallet.state == CHECKED_OUT
  ASSERT result.wallet.balance == input.payload.wallet.balance - min(ceil(duration/3600) * RATE, input.payload.wallet.balance)
  ASSERT result.session.endTime == input.nowSeconds
  ASSERT no penalty calculation occurred
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the session is ≤ 24 hours, the fixed checkout flow produces the same result as the original code.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT checkoutOriginal(input.payload, input.nowSeconds) == checkoutFixed(input.payload, input.nowSeconds)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many test cases automatically across the input domain (various durations, balances, states)
- It catches edge cases that manual unit tests might miss (boundary at exactly 86400 seconds, zero balance, etc.)
- It provides strong guarantees that behavior is unchanged for all non-overtime inputs

**Test Plan**: Observe behavior on UNFIXED code first for sessions ≤ 24 hours using `applyCheckout`, then write property-based tests capturing that the fixed code produces identical results.

**Test Cases**:

1. **Normal checkout preservation**: Verify that sessions ≤ 24 hours produce identical payload via `applyCheckout` before and after the fix
2. **Blocked card preservation**: Verify that blocked cards are still rejected with the correct reason message
3. **Invalid transition preservation**: Verify that invalid state transitions still produce "Transisi tidak valid"
4. **UI display preservation**: Verify that success UI shows "Biaya" label, duration, fee, and balance for normal sessions

### Unit Tests

- Test that sessions > 24 hours now use `applyCheckout` and produce standard parking fee
- Test that sessions > 24 hours with low balance still proceed (fee capped at balance, no blocking)
- Test that sessions ≤ 24 hours continue to work identically
- Test that "Biaya" label is always shown (never "Denda Overtime")
- Test that no overtime warning UI elements are rendered

### Property-Based Tests

- Generate random card payloads with sessions > 24 hours and verify `applyCheckout` is used with correct fee calculation
- Generate random card payloads with sessions ≤ 24 hours and verify identical behavior to original code
- Generate random balances and durations to verify fee is always `min(ceil(hours) × RATE, balance)` — never a penalty amount

### Integration Tests

- Test full checkout flow in TerminalSection with a 48-hour session — verify success with standard fee
- Test full checkout flow with a 12-hour session — verify unchanged behavior
- Test that deleted modules (`overtimeCheckout`, `penaltyCalculator`, `cardResetHandler`, `overtimeValidator`) are not imported anywhere in the codebase after fix
