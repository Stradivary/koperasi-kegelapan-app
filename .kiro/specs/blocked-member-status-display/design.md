# Blocked Member Status Display Bugfix Design

## Overview

After an admin blocks a member or card via the local database, the blocked status fails to display correctly across three NFC scanning views (Terminal, Gate, Scout). The root cause is an execution-order issue: in Terminal, the card-state early return short-circuits before the async `checkLocalBlockedStatus` call; in Gate, a race condition allows the "Sudah Check-in" render to appear before the async blocked check completes; in Scout, there is no local DB blocked check at all. The fix ensures the local blocked status check runs first (or is awaited) before any card-state-based UI decision is made.

## Glossary

- **Bug_Condition (C)**: The condition where a card/member is blocked in the local DB but the UI fails to display the blocked status due to execution order or missing checks
- **Property (P)**: When a card is blocked in local DB, the blocked status message SHALL always be displayed regardless of card wallet state
- **Preservation**: Existing behavior for non-blocked cards (showing "Belum Check-in", "Sudah Checkout", "Sudah Check-in", normal check-in/checkout flows) must remain unchanged
- **checkLocalBlockedStatus**: Async function in `src/core/nfc/localStatusCheck.ts` that queries the local Dexie DB for card/member blocked status using hardware serial number
- **CardState**: Enum representing wallet states: IDLE, CHECKED_IN, CHECKED_OUT, STATION_OPERATION
- **autoCheckoutTriggered / autoCheckinTriggered**: Ref flags preventing duplicate processing within a single scan cycle

## Bug Details

### Bug Condition

The bug manifests when a card that is blocked in the local database is scanned at any of the three NFC views, but the card's on-card wallet state causes the UI to short-circuit or race past the blocked status check.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type { view: "terminal" | "gate" | "scout", serialNumber: string, tenantId: string, cardState: CardState, onCardStatus: CardStatus }
  OUTPUT: boolean

  localBlocked := checkLocalBlockedStatus(input.tenantId, input.serialNumber).blocked

  CASE input.view OF
    "terminal":
      RETURN localBlocked
             AND input.cardState IN [CardState.IDLE, CardState.CHECKED_OUT]
    "gate":
      RETURN localBlocked
             AND input.cardState IN [CardState.CHECKED_IN, CardState.STATION_OPERATION]
    "scout":
      RETURN localBlocked
             AND input.onCardStatus == CardStatus.ACTIVE
  END CASE
END FUNCTION
```

### Examples

- **Terminal IDLE**: Card serial `a1b2c3` is blocked in local DB, wallet state is IDLE → currently shows "Belum Check-in", should show "Kartu diblokir" with access denied UI
- **Terminal CHECKED_OUT**: Card serial `a1b2c3` is blocked in local DB, wallet state is CHECKED_OUT → currently shows "Sudah Checkout", should show "Kartu diblokir" with access denied UI
- **Gate CHECKED_IN**: Card serial `d4e5f6` is blocked in local DB, wallet state is CHECKED_IN → currently shows "Sudah Check-in" (race condition), should show "Akses Ditolak" with blocked reason
- **Scout ACTIVE on-card**: Card serial `g7h8i9` is blocked in local DB, on-card status is ACTIVE → currently shows "Active" badge, should show "Blocked" badge with reason

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Active (non-blocked) cards in IDLE state at Terminal must continue to show "Belum Check-in"
- Active (non-blocked) cards in CHECKED_IN state at Terminal must continue to perform auto-checkout normally
- Active (non-blocked) cards at Gate must continue to perform auto-checkin normally
- Active (non-blocked) cards already CHECKED_IN at Gate must continue to show "Sudah Check-in"
- Active (non-blocked) cards at Scout must continue to display "Active" badge and member info
- Cards with on-card blocked status (BLOCKED_TAMPER, BLOCKED_ADMIN, etc.) at Gate must continue to show blocked reason from on-card status
- Blocked cards detected at Gate must continue to reject check-in and show access denied UI

**Scope:**
All inputs where `checkLocalBlockedStatus` returns `{ blocked: false }` should be completely unaffected by this fix. This includes:

- All non-blocked card scans across all three views
- Cards blocked only on-card (already handled by existing on-card status checks)
- All mouse/touch interactions unrelated to NFC scanning
- All other UI flows (admin panel, login, etc.)

## Hypothesized Root Cause

Based on the code analysis, the confirmed root causes are:

1. **Terminal - Early Return on Card State**: In `TerminalSection.tsx`, the auto-checkout effect checks `cardState !== CardState.CHECKED_IN && cardState !== CardState.STATION_OPERATION` and sets `autoCheckoutTriggered.current = true` then returns. The `checkLocalBlockedStatus` call is placed AFTER this guard, so for IDLE/CHECKED_OUT cards, the blocked check is never reached.

2. **Gate - Async Race Condition**: In `GateSection.tsx`, the render logic correctly prioritizes `blockedReason` over `isAlreadyCheckedIn`. However, `checkLocalBlockedStatus` is async (called inside `.then()`), and for CHECKED_IN cards, the on-card status check (`payload.identity.status !== CardStatus.ACTIVE`) passes (card is ACTIVE on-card), then the async blocked check starts but the render already shows "Sudah Check-in" because `blockedReason` is still null while the promise resolves.

3. **Scout - Missing Check Entirely**: In `ScoutSection.tsx`, there is NO call to `checkLocalBlockedStatus` anywhere. The `CardStatusBadge` component only receives `state.payload.identity.status` (the on-card status byte), so locally-blocked cards with ACTIVE on-card status always display "Active".

## Correctness Properties

Property 1: Bug Condition - Blocked Status Always Displayed

_For any_ NFC scan input where the card/member is blocked in the local database (checkLocalBlockedStatus returns blocked: true), the fixed view components SHALL display the blocked status message with the access denied UI, regardless of the card's wallet state (IDLE, CHECKED_OUT, CHECKED_IN, STATION_OPERATION) or on-card status.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Non-Blocked Card Behavior Unchanged

_For any_ NFC scan input where the card/member is NOT blocked in the local database (checkLocalBlockedStatus returns blocked: false), the fixed view components SHALL produce exactly the same behavior as the original code, preserving all existing card-state-based messages ("Belum Check-in", "Sudah Checkout", "Sudah Check-in"), auto-checkout/checkin flows, and status badge displays.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/components/section/TerminalSection.tsx`

**Function**: Auto-checkout `useEffect`

**Specific Changes**:

1. **Move blocked check before card-state guard**: Restructure the effect so that `checkLocalBlockedStatus` is called immediately when `state.phase === "ready"` and `state.serialNumber` is available, BEFORE checking `cardState`. If blocked, set `blockedReason` and `autoCheckoutTriggered.current = true`, then return. Only after confirming non-blocked status, proceed with the existing card-state logic.

---

**File**: `src/components/section/GateSection.tsx`

**Function**: Auto-checkin `useEffect`

**Specific Changes**: 2. **Move blocked check before card-state render decision**: Currently the on-card status check happens synchronously, then the local DB check happens in a `.then()`. Restructure so that the local DB blocked check is the FIRST async operation. Add a `checkingBlocked` state (or use a loading flag) so the render does not show "Sudah Check-in" while the async check is in progress. Alternatively, move the `checkLocalBlockedStatus` call to run before the `isAlreadyCheckedIn` render path can be reached by ensuring `autoCheckinTriggered` is not set until the blocked check completes.

3. **Ensure render priority**: The render already checks `blockedReason && state.phase === "ready"` before `isAlreadyCheckedIn && state.phase === "ready"`, which is correct. The fix is ensuring `blockedReason` is set before the render evaluates these conditions (i.e., don't set `autoCheckinTriggered` for CHECKED_IN cards until the blocked check resolves).

---

**File**: `src/components/section/ScoutSection.tsx`

**Function**: Card info display section

**Specific Changes**: 4. **Add local DB blocked check**: Add a `useEffect` that calls `checkLocalBlockedStatus(tenantId, state.serialNumber)` when `state.phase === "ready"` and `state.serialNumber` is available. Store the result in a `localBlockedStatus` state variable.

5. **Pass override to CardStatusBadge**: When `localBlockedStatus.blocked` is true, pass the blocked status to `CardStatusBadge` instead of (or in addition to) the on-card `payload.identity.status`. This could be done by passing a new `overrideStatus` prop or by mapping the blocked reason to a `CardStatus` enum value.

---

**File**: `src/components/block/CardStatusBadge.tsx`

**Function**: `CardStatusBadge` component

**Specific Changes**: 6. **Support local DB override**: Add an optional `localBlockedReason` prop (or `overrideStatus` prop). When provided and non-null, display the blocked badge styling and label regardless of the `status` prop value. This allows the Scout view to override the on-card "Active" status with the local DB blocked status.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write component tests that mock `checkLocalBlockedStatus` to return `{ blocked: true, reason: "Kartu diblokir oleh admin" }`, then simulate NFC scan completion with various card states. Assert that the blocked UI is shown. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:

1. **Terminal IDLE Blocked Test**: Mock blocked status, set card state to IDLE, verify "Kartu diblokir" is shown (will fail on unfixed code — shows "Belum Check-in" instead)
2. **Terminal CHECKED_OUT Blocked Test**: Mock blocked status, set card state to CHECKED_OUT, verify blocked UI shown (will fail on unfixed code — shows "Sudah Checkout" instead)
3. **Gate CHECKED_IN Blocked Test**: Mock blocked status, set card state to CHECKED_IN, verify blocked UI shown (will fail on unfixed code — shows "Sudah Check-in" due to race)
4. **Scout Active-on-Card Blocked Test**: Mock blocked status, set on-card status to ACTIVE, verify "Blocked" badge shown (will fail on unfixed code — shows "Active" badge)

**Expected Counterexamples**:

- Terminal: `blockedReason` is never set because the effect returns early for IDLE/CHECKED_OUT cards
- Gate: `blockedReason` is set too late (after render already shows "Sudah Check-in")
- Scout: `blockedReason` is never set because no call to `checkLocalBlockedStatus` exists

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := renderView_fixed(input)
  ASSERT result.displayedUI CONTAINS blockedStatusMessage
  ASSERT result.displayedUI DOES NOT CONTAIN cardStateMessage
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT renderView_original(input) = renderView_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many combinations of card states, on-card statuses, and local DB states
- It catches edge cases where the refactored execution order might accidentally change behavior for non-blocked cards
- It provides strong guarantees that the "Belum Check-in", "Sudah Checkout", and normal flow behaviors are unchanged

**Test Plan**: Observe behavior on UNFIXED code first for non-blocked cards across all views, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Terminal Non-Blocked Preservation**: Verify that active cards in IDLE state still show "Belum Check-in", CHECKED_OUT still shows "Sudah Checkout", and CHECKED_IN still triggers auto-checkout
2. **Gate Non-Blocked Preservation**: Verify that active cards still trigger auto-checkin, and CHECKED_IN cards still show "Sudah Check-in"
3. **Scout Non-Blocked Preservation**: Verify that active cards still display "Active" badge with correct balance and member info
4. **On-Card Blocked Preservation**: Verify that cards with on-card blocked status (BLOCKED_TAMPER, etc.) at Gate still show the on-card blocked reason

### Unit Tests

- Test `checkLocalBlockedStatus` is called before card-state early return in Terminal effect
- Test `checkLocalBlockedStatus` resolves before render decision in Gate effect
- Test `checkLocalBlockedStatus` is called in Scout when card is read
- Test `CardStatusBadge` renders blocked state when `localBlockedReason` prop is provided
- Test edge case: `serialNumber` is null/undefined (should not crash, skip blocked check)

### Property-Based Tests

- Generate random combinations of `{ cardState, onCardStatus, localBlocked }` and verify Terminal always shows blocked UI when `localBlocked = true`
- Generate random combinations for Gate and verify blocked UI takes priority over "Sudah Check-in" when `localBlocked = true`
- Generate random active card payloads for Scout and verify "Active" badge is shown when `localBlocked = false`, "Blocked" when `localBlocked = true`
- Generate random non-blocked card states across all views and verify output matches original behavior exactly

### Integration Tests

- Test full Terminal scan flow: scan blocked card in IDLE state → verify blocked UI → tap "Selesai" → verify reset to idle
- Test full Gate scan flow: scan blocked card in CHECKED_IN state → verify blocked UI appears (not "Sudah Check-in")
- Test full Scout scan flow: scan card with ACTIVE on-card status but locally blocked → verify "Blocked" badge and blocked reason displayed
- Test that after fix, a non-blocked card in IDLE at Terminal still shows "Belum Check-in" and resets correctly
