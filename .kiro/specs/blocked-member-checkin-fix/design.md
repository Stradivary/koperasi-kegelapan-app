# Blocked Member Check-in Fix — Bugfix Design

## Overview

Blocked or suspended members can bypass local DB enforcement because the GateSection uses the wrong key for card lookups, skips member checks when `userId` is 0, and the TerminalSection/StationSection have no local DB status checks at all. The fix introduces a shared utility function `checkLocalBlockedStatus` that correctly looks up card and member status using the hardware serial number, and integrates it into all three sections.

## Glossary

- **Bug_Condition (C)**: A card is scanned at gate/terminal/station AND either (a) the card is blocked in `localDb.cards`, or (b) the linked member is suspended in `localDb.users` — but the system fails to detect this and allows the operation to proceed.
- **Property (P)**: When the bug condition holds, the system SHALL reject the operation with an appropriate blocked/suspended message.
- **Preservation**: All operations for cards/members with active status must continue to work identically. The on-card `identity.status` check remains unchanged as the first-line defense.
- **localDb.cards**: Dexie table keyed by `[tenantId, cardId]` where `cardId` is the hardware serial number (hex string). Contains a `status` field.
- **localDb.users**: Dexie table keyed by `[tenantId, userId]`. Contains a `status` field (`"active"` | `"suspended"`).
- **state.serialNumber**: The hardware NFC serial number captured by `useNfcCard` during the scan event, available as `event.serialNumber` from the Web NFC API.
- **checkLocalBlockedStatus**: The proposed shared utility function that performs the correct local DB lookups.

## Bug Details

### Bug Condition

The bug manifests when a card that is blocked in `localDb.cards` or linked to a suspended member in `localDb.users` is scanned at any of the three operational sections (Gate, Terminal, Station). The system either uses the wrong lookup key (GateSection), skips the check entirely for userId=0 (GateSection), or has no check at all (Terminal/Station).

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type { tenantId: string, serialNumber: string, userId: number, section: "gate" | "terminal" | "station" }
  OUTPUT: boolean

  cardRecord := localDb.cards.get([input.tenantId, input.serialNumber])
  userRecord := IF input.userId > 0 THEN localDb.users.get([input.tenantId, input.userId]) ELSE null

  cardBlocked := cardRecord != null AND cardRecord.status != "active"
  memberSuspended := userRecord != null AND userRecord.status != "active"

  RETURN (cardBlocked OR memberSuspended)
         AND operationWouldProceed(input.section)
END FUNCTION
```

### Examples

- **Gate + wrong key**: Card with serial `"04a1b2c3d4e5f6"` is blocked in localDb. GateSection derives `cardIdHex` from `payload.header.cardId` (e.g., `"aabbccddeeff"`), looks up `localDb.cards.get(["tenant1", "aabbccddeeff"])` → not found → check passes → card is allowed to check in.
- **Gate + userId=0**: Unlinked card (userId=0) belongs to a blocked card. The `payload.identity.userId ? ... : Promise.resolve(null)` ternary skips the user lookup, but more critically the card lookup itself fails due to the wrong key.
- **Terminal**: Blocked member's card is scanned for checkout. No local DB check exists → checkout proceeds, fee is deducted.
- **Station + topup**: Suspended member's card is scanned for topup. No local DB check exists → topup proceeds, balance is increased.
- **Station + card issuance**: New card being issued should NOT be blocked by this check (issuance creates a fresh card record).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Cards/members with active status in localDb proceed through gate check-in, terminal checkout, and station topup exactly as before
- The on-card `identity.status` check in GateSection remains the first-line defense (runs before local DB check)
- The `validateTransition` state machine logic is unaffected
- Station card issuance flow is unaffected (new cards start fresh)
- Fee calculation, balance deduction, and reconciliation outbox writes remain unchanged
- Simulation mode (time override) continues to work in Gate and Terminal

**Scope:**
All inputs where `localDb.cards` status is `"active"` AND (userId=0 OR `localDb.users` status is `"active"`) should be completely unaffected by this fix. This includes:

- Normal check-in for active cards
- Normal checkout for active cards
- Normal topup for active cards
- Card issuance at station
- Cards not found in localDb (no record = not blocked)

## Hypothesized Root Cause

Based on the bug description, the confirmed issues are:

1. **Wrong Lookup Key in GateSection**: Line `const cardIdHex = Array.from(payload.header.cardId).map(...)` derives a hex string from the 6-byte on-card UUID (`payload.header.cardId`). But `localDb.cards` is keyed by `[tenantId, cardId]` where `cardId` is the hardware serial number. The lookup `localDb.cards.get([tenantId, cardIdHex])` will never match because it's using the wrong identifier.

2. **Falsy userId=0 Bypass in GateSection**: The expression `payload.identity.userId ? localDb.users.get(...) : Promise.resolve(null)` treats `userId=0` as falsy, skipping the member lookup. While userId=0 means "unlinked card" (so skipping the user check is correct for that case), the card-level check itself is broken due to issue #1, leaving no protection at all.

3. **Missing Check in TerminalSection**: The auto-checkout `useEffect` validates card state transitions but never checks `localDb.cards` or `localDb.users` for blocked/suspended status.

4. **Missing Check in StationSection**: The `handleTopupConfirm` function directly applies the topup without any local DB status validation.

## Correctness Properties

Property 1: Bug Condition - Blocked Card/Member Rejection

_For any_ scan input where the card's hardware serial number maps to a blocked record in `localDb.cards` (status ≠ "active") OR the card's userId maps to a suspended record in `localDb.users` (status ≠ "active"), the system SHALL reject the operation (check-in, checkout, or topup) and display an appropriate blocked/suspended message, preventing any card write.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Active Card/Member Operations

_For any_ scan input where the card is not found in `localDb.cards` OR has status "active", AND the member is not found in `localDb.users` OR has status "active", the system SHALL produce exactly the same behavior as the original code, preserving normal check-in, checkout, and topup flows without any additional delay or behavioral change.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

**New File**: `src/core/nfc/localStatusCheck.ts`

**Function**: `checkLocalBlockedStatus`

**Specific Changes**:

1. **Create shared utility** (`src/core/nfc/localStatusCheck.ts`):
   - Export `checkLocalBlockedStatus(tenantId: string, serialNumber: string, userId: number): Promise<{ blocked: boolean; reason: string | null }>`
   - Normalize `serialNumber` to lowercase hex (strip colons/dashes)
   - Look up `localDb.cards.get([tenantId, normalizedSerial])`
   - If card found and `status !== "active"` → return `{ blocked: true, reason: "Kartu diblokir: <status>" }`
   - If `userId > 0`, look up `localDb.users.get([tenantId, userId])`
   - If user found and `status !== "active"` → return `{ blocked: true, reason: "Akun anggota ditangguhkan" }`
   - Otherwise return `{ blocked: false, reason: null }`

2. **Fix GateSection** (`src/components/section/GateSection.tsx`):
   - Remove the broken `cardIdHex` derivation from `payload.header.cardId`
   - Remove the inline `Promise.all([localDb.cards.get(...), ...])` block
   - Import and call `checkLocalBlockedStatus(tenantId, state.serialNumber, payload.identity.userId)`
   - Use `state.serialNumber` (available in the `"ready"` phase) as the correct hardware serial
   - Keep the on-card `identity.status` check as the first-line defense (before the local DB check)

3. **Fix TerminalSection** (`src/components/section/TerminalSection.tsx`):
   - Import `checkLocalBlockedStatus`
   - In the auto-checkout `useEffect`, after the card-state check and before `validateTransition`, call `checkLocalBlockedStatus(tenantId, state.serialNumber, payload.identity.userId)`
   - If blocked, set `blockedReason` and return without writing

4. **Fix StationSection** (`src/components/section/StationSection.tsx`):
   - Import `checkLocalBlockedStatus`
   - In `handleTopupConfirm`, before calling `applyTopup`/`write`, call `checkLocalBlockedStatus(tenantId, state.serialNumber, payload.identity.userId)`
   - If blocked, show error and return without writing
   - Do NOT apply this check to the card issuance flow (new cards are not subject to block checks)

5. **userId=0 handling**:
   - The shared utility uses `userId > 0` as the condition for member lookup (explicit numeric comparison, not truthiness)
   - This correctly skips the member check for unlinked cards while still enforcing the card-level check

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm the root cause analysis (wrong key, missing checks).

**Test Plan**: Write a property-based test that creates a `checkLocalBlockedStatus`-equivalent check using the correct serial number, then compares it against what GateSection actually does (using `payload.header.cardId`). Run on UNFIXED code to observe that the existing code never finds blocked cards.

**Test Cases**:

1. **GateSection Wrong Key Test**: Insert a blocked card record keyed by hardware serial, scan with that serial, verify GateSection's lookup (using cardId from payload) fails to find it (will fail on unfixed code — the check passes when it shouldn't)
2. **GateSection userId=0 Test**: Insert a blocked card with userId=0, verify the member check is skipped but card check should still catch it (will fail on unfixed code)
3. **TerminalSection Missing Check Test**: Insert a blocked card, simulate checkout flow, verify no rejection occurs (will fail on unfixed code)
4. **StationSection Missing Check Test**: Insert a suspended member, simulate topup flow, verify no rejection occurs (will fail on unfixed code)

**Expected Counterexamples**:

- GateSection: `localDb.cards.get([tenantId, cardIdHex])` returns `undefined` for any blocked card because `cardIdHex` is derived from the wrong source
- Terminal/Station: No check exists at all, so blocked cards always proceed

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := checkLocalBlockedStatus(input.tenantId, input.serialNumber, input.userId)
  ASSERT result.blocked = true
  ASSERT result.reason != null
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT checkLocalBlockedStatus(input.tenantId, input.serialNumber, input.userId).blocked = false
  // AND the downstream operation (checkin/checkout/topup) proceeds identically
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many combinations of card statuses, user statuses, and userId values
- It catches edge cases like userId=0, missing records, and boundary conditions
- It provides strong guarantees that active cards/members are never incorrectly blocked

**Test Plan**: Observe behavior on UNFIXED code for active cards (they proceed through all flows), then write property-based tests asserting that `checkLocalBlockedStatus` returns `{ blocked: false }` for all active/missing records.

**Test Cases**:

1. **Active Card Preservation**: For any card with status "active" in localDb, verify `checkLocalBlockedStatus` returns not-blocked
2. **Missing Card Preservation**: For any serial number not in localDb, verify `checkLocalBlockedStatus` returns not-blocked (absence = not blocked)
3. **Active Member Preservation**: For any userId > 0 with status "active" in localDb, verify not-blocked
4. **Unlinked Card Preservation**: For userId=0, verify only card-level check applies (no member lookup)

### Unit Tests

- Test `checkLocalBlockedStatus` with all card status variants (`active`, `blocked_tamper`, `blocked_fraud`, `blocked_expired`, `blocked_admin`)
- Test `checkLocalBlockedStatus` with user status variants (`active`, `suspended`)
- Test `checkLocalBlockedStatus` with userId=0 (skip member check)
- Test `checkLocalBlockedStatus` with missing card record (not blocked)
- Test `checkLocalBlockedStatus` with missing user record (not blocked)
- Test serial number normalization (colons, uppercase, mixed)

### Property-Based Tests

- Generate random `(tenantId, serialNumber, userId, cardStatus, userStatus)` tuples and verify:
  - If cardStatus ≠ "active" → blocked
  - If userStatus ≠ "active" AND userId > 0 → blocked
  - If cardStatus = "active" AND (userId=0 OR userStatus = "active") → not blocked
  - If no card record exists → not blocked
- Generate random active-card scenarios and verify downstream operations proceed unchanged

### Integration Tests

- Test full GateSection flow with blocked card (using correct serial number key)
- Test full TerminalSection checkout flow with suspended member
- Test full StationSection topup flow with blocked card
- Test StationSection card issuance is NOT affected by block checks
- Test that on-card `identity.status` check still fires before local DB check in GateSection
