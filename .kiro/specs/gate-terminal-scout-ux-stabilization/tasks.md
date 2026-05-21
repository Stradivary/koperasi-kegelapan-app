# Implementation Plan: Gate-Terminal-Scout UX Stabilization

## Overview

This plan refactors the three kiosk NFC interaction screens (Gate, Terminal, Scout) to eliminate race conditions, provide consistent visual feedback, and ensure continuous kiosk operation. The approach extracts shared logic into two new hooks (`useKioskAutoScan`, `useBlockedCheck`), introduces a declarative `FeedbackCard` component, enhances `NfcTapArea` with accessibility attributes, and adds property-based tests for correctness properties defined in the design.

## Tasks

- [ ] 1. Create shared hooks and utility foundations
  - [ ] 1.1 Create `useBlockedCheck` hook
    - Create `src/hooks/useBlockedCheck.ts`
    - Implement the hook per the design interface: accepts `{ tenantId, serialNumber, phase, payload }` and returns `{ isChecking, isBlocked, blockedReason, notInLocalDb, isReady }`
    - Run `checkLocalBlockedStatus` when phase transitions to "ready" and serialNumber is non-null
    - Discard stale results if phase changes during in-flight check (use a ref to track the current phase/serialNumber at invocation time)
    - Reset all state to initial values when phase transitions to "idle"
    - On IndexedDB read error, treat as not blocked with `notInLocalDb: true`
    - `isReady` = phase === "ready" AND check complete AND not blocked
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ] 1.2 Create `useKioskAutoScan` hook
    - Create `src/hooks/useKioskAutoScan.ts`
    - Implement the hook per the design interface: accepts `{ enabled, grant, loading, phase, scan, resetDelay }`
    - Track `hasCompletedCycle` (true after at least one success or error phase observed)
    - Auto-invoke `scan()` when phase transitions to "idle" AND `hasCompletedCycle` AND `enabled` AND `grant` is non-null and not loading
    - Do NOT trigger on initial mount — only after first completed cycle
    - Return `{ hasCompletedCycle, isAutoScanning }`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ] 1.3 Create `FeedbackCard` component
    - Create `src/components/block/FeedbackCard.tsx`
    - Implement per design interface: `variant` ("success" | "error" | "warning" | "info" | "blocked"), `title`, `subtitle`, `details` (label/value pairs), `actions` (button array), `autoClose` (ms), `onClose`
    - Use `aria-live="polite"` for screen reader announcements
    - Implement auto-dismiss timer via `useEffect` with cleanup
    - Style variants using existing Tailwind design tokens (signal-valid, signal-error, signal-warning, brand-\*)
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 11.2_

  - [ ] 1.4 Enhance `NfcTapArea` with accessibility attributes
    - Update `src/components/block/NfcTapArea.tsx`
    - Add `role="button"` and dynamic `aria-label` reflecting phase-specific action text
    - Add `aria-busy="true"` when phase is "scanning", "validating", or "writing"
    - Add haptic feedback via `navigator.vibrate` on phase transitions (50ms intermediate, 100ms success, 2×50ms error)
    - Guard `navigator.vibrate` with feature detection (skip silently if unsupported)
    - Accept optional `sublabel` prop for additional context text
    - _Requirements: 8.1, 8.2, 8.3, 11.1, 11.3, 11.4_

- [ ] 2. Checkpoint - Verify foundations
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Refactor GateSection to use new hooks
  - [ ] 3.1 Refactor `GateSection` to use `useBlockedCheck` and `useKioskAutoScan`
    - Update `src/components/section/GateSection.tsx`
    - Replace inline `checkLocalBlockedStatus` call and manual state (`blockedReason`, `blockedCheckDone`, `notInLocalDb`) with `useBlockedCheck` hook
    - Replace manual auto-scan logic (`hasCompletedCycle` ref, idle-phase scan restart) with `useKioskAutoScan` hook
    - Maintain `autoCheckinTriggered` ref as the duplicate-write prevention guard
    - Wire auto-checkin effect to trigger only when `blockedCheck.isReady` is true (eliminates race condition)
    - Reset `autoCheckinTriggered` ref in the idle-phase cleanup (via `useKioskAutoScan` reset or separate effect)
    - Preserve simulation mode functionality
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 5.1, 5.2, 5.3, 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 3.2 Replace inline feedback rendering in `GateSection` with `FeedbackCard`
    - Replace success card markup with `<FeedbackCard variant="success" ... autoClose={2500} />`
    - Replace blocked/rejected card markup with `<FeedbackCard variant="blocked" ... />`
    - Replace "Sudah Check-in" card with `<FeedbackCard variant="warning" ... />`
    - Replace error display with `<FeedbackCard variant="error" ... actions={[{ label: "Coba Lagi", onClick: reset }]} />`
    - Add "Memproses..." indicator while `blockedCheck.isChecking` is true
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 8.8_

  - [ ]\* 3.3 Write property test for Gate rejects invalid cards without writing
    - **Property 4: Gate Rejects Invalid Cards Without Writing**
    - Generate arbitrary CardPayload with status ≠ ACTIVE, or blocked=true, or state ∈ {CHECKED_IN, STATION_OPERATION}, or balance < 10,000
    - Assert that no write operation is invoked for any such payload
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [ ]\* 3.4 Write property test for Gate check-in produces correct state transition
    - **Property 5: Gate Check-in Produces Correct State Transition**
    - Generate arbitrary valid CardPayload (status=ACTIVE, state=IDLE, balance ≥ 10,000)
    - Apply `applyCheckin` and assert resulting state = CHECKED_IN and counter incremented by 1
    - **Validates: Requirement 2.5**

- [ ] 4. Refactor TerminalSection to use new hooks
  - [ ] 4.1 Refactor `TerminalSection` to use `useBlockedCheck` and `useKioskAutoScan`
    - Update `src/components/section/TerminalSection.tsx`
    - Replace inline `checkLocalBlockedStatus` call and manual state with `useBlockedCheck` hook
    - Add `useKioskAutoScan` hook for auto-scan loop (currently Terminal does not auto-scan — add it)
    - Maintain `autoCheckoutTriggered` ref as the duplicate-write prevention guard
    - Wire auto-checkout effect to trigger only when `blockedCheck.isReady` is true
    - Preserve existing fee calculation and receipt display logic
    - _Requirements: 1.1, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 5.1, 5.2, 5.3, 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 4.2 Replace inline feedback rendering in `TerminalSection` with `FeedbackCard`
    - Replace success receipt with `<FeedbackCard variant="success" details={[duration, fee, balance]} autoClose={3000} />`
    - Replace blocked card with `<FeedbackCard variant="blocked" ... />`
    - Replace insufficient balance card with `<FeedbackCard variant="warning" details={[balance, fee, deficit]} />`
    - Replace "Belum Check-in" / "Sudah Checkout" cards with `<FeedbackCard variant="warning" ... />`
    - Replace error display with `<FeedbackCard variant="error" ... />`
    - Add "Memproses..." indicator while `blockedCheck.isChecking` is true
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 8.8_

  - [ ]\* 4.3 Write property test for Terminal rejects invalid cards without writing
    - **Property 6: Terminal Rejects Invalid Cards Without Writing**
    - Generate arbitrary CardPayload where blocked=true, or state ∈ {IDLE, CHECKED_OUT}, or balance - fee < MIN_BALANCE
    - Assert that no write operation is invoked for any such payload
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]\* 4.4 Write property test for Terminal checkout produces correct balance deduction
    - **Property 7: Terminal Checkout Produces Correct Balance Deduction**
    - Generate arbitrary valid CardPayload (state=CHECKED_IN, sufficient balance) and nowSeconds > session.startTime
    - Apply `applyCheckout` and assert balanceAfter = balanceBefore − fee AND balanceAfter ≥ MIN_BALANCE
    - **Validates: Requirements 3.4, 10.4**

- [ ] 5. Checkpoint - Verify Gate and Terminal refactoring
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Refactor ScoutSection and implement fee calculation tests
  - [ ] 6.1 Refactor `ScoutSection` to use `useBlockedCheck` hook
    - Update `src/components/section/ScoutSection.tsx`
    - Replace inline `checkLocalBlockedStatus` effect and manual state (`localBlockedReason`, `notInLocalDb`) with `useBlockedCheck` hook
    - Ensure Scout never invokes `write` — only uses `scan` and `reset`
    - Display all card info fields: member name, balance (formatted), card ID (hex), transaction counter, status
    - Show blocked reason as warning alongside full card info (not suppressing fields)
    - Show "not in local DB" warning when applicable
    - Wire "Selesai" button to `reset()` which transitions phase to idle and clears all state
    - Add "Memproses..." indicator while `blockedCheck.isChecking` is true
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3_

  - [ ]\* 6.2 Write property test for Scout never writes
    - **Property 10: Scout Never Writes**
    - Generate arbitrary CardPayload in any state (ACTIVE, blocked, IDLE, CHECKED_IN, CHECKED_OUT)
    - Assert that the Scout flow never invokes an NFC write operation
    - **Validates: Requirement 4.1**

  - [ ]\* 6.3 Write property test for fee calculation correctness
    - **Property 8: Fee Calculation Correctness**
    - Generate arbitrary positive duration in seconds (1..100_000)
    - Assert fee = ceil(duration / 3600) × 2000
    - Test boundary cases: 3599s → 2000, 3600s → 2000, 3601s → 4000
    - **Validates: Requirements 3.6, 10.1, 10.2, 10.3**

  - [ ]\* 6.4 Write property test for balance sufficiency check
    - **Property 9: Balance Sufficiency Check Correctness**
    - Generate arbitrary balance (0..1_000_000) and duration (1..100_000)
    - Assert `validateCheckoutBalance` returns sufficient=true iff (balance − fee) ≥ 10,000
    - When insufficient, assert deficit = 10,000 − (balance − fee)
    - **Validates: Requirements 10.4, 10.5**

- [ ] 7. Implement NFC phase state machine property tests and error recovery
  - [ ] 7.1 Implement error recovery enhancements in `useNfcCard`
    - Update `src/hooks/useNfcCard.ts`
    - Add post-write read failure detection: if NFC read fails within 10s of a successful write, set error to "Lepas kartu sebentar lalu tap ulang"
    - Add `pendingWriteRef` to store pending write when card is removed during write
    - On next scan: if serialNumber matches pending write target, execute stored write; if mismatch, discard and process as fresh scan
    - Add 30-second timeout for pending writes: discard and show error if no tap occurs
    - Auto-reset after transient post-write read errors (3s delay)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]\* 7.2 Write property test for NFC phase transition validity
    - **Property 1: NFC Phase Transition Validity**
    - Generate arbitrary sequences of phase transitions
    - Assert only valid transitions are permitted: idle→scanning→validating→ready→writing→success→idle, or any→error→idle
    - Assert invalid transitions are rejected (phase unchanged)
    - **Validates: Requirement 1.1**

  - [ ]\* 7.3 Write property test for NFC state data invariants
    - **Property 2: NFC State Data Invariants**
    - Generate arbitrary reachable NFC states
    - Assert: payload/serialNumber non-null iff phase ∈ {ready, writing, success}
    - Assert: error non-null iff phase = error
    - Assert: tamperDetected true only when phase = error
    - **Validates: Requirements 1.2, 1.3, 1.4**

  - [ ]\* 7.4 Write property test for idle transition resets all state
    - **Property 3: Idle Transition Resets All State**
    - Generate arbitrary NFC state that transitions to idle
    - Assert all mutable state (payload, serialNumber, error, tamperDetected, blockedReason, blockedCheckDone, notInLocalDb, autoActionTriggered) is reset to initial values
    - **Validates: Requirements 1.5, 5.5, 6.3, 7.3**

  - [ ]\* 7.5 Write property test for duplicate write prevention
    - **Property 14: Duplicate Write Prevention Within Scan Cycle**
    - Simulate multiple auto-action effect fires and async callback resolutions within a single scan cycle
    - Assert at most one NFC write operation is initiated per cycle
    - **Validates: Requirements 7.1, 7.2**

- [ ] 8. Checkpoint - Verify all property tests and error recovery
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement accessibility, haptics, and offline continuity
  - [ ] 9.1 Add haptic feedback utility
    - Create `src/lib/haptics.ts`
    - Export `triggerHaptic(type: "intermediate" | "success" | "error"): void`
    - Intermediate: `navigator.vibrate(50)`
    - Success: `navigator.vibrate(100)`
    - Error: `navigator.vibrate([50, 50, 50])`
    - Guard with `typeof navigator !== "undefined" && "vibrate" in navigator`
    - _Requirements: 11.3, 11.4_

  - [ ] 9.2 Integrate haptic feedback into NfcTapArea phase transitions
    - Update `NfcTapArea` to call `triggerHaptic` on phase changes using a `useEffect` that watches the `phase` prop
    - Map scanning/validating/writing → "intermediate", success → "success", error → "error"
    - _Requirements: 11.3, 11.4_

  - [ ] 9.3 Implement session grant expiry handling in kiosk sections
    - When `grant` is null and not loading, display "Tidak ada sesi aktif" with scan button disabled
    - Ensure `useKioskAutoScan` remains inactive when grant is null
    - When tamper detection occurs, disable auto-scan and require manual "Coba Lagi"
    - _Requirements: 9.7, 9.8_

  - [ ] 9.4 Verify offline operation continuity
    - Ensure existing `useSessionGrant` caches grant and continues operating offline until `expiresAt`
    - Ensure `useNfcCard` persists completed transactions to reconciliation outbox
    - Verify `useSyncEngine` auto-syncs outbox when connectivity is restored
    - Add connectivity toast notifications (online/offline transitions) if not already present
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [ ] 10. Final integration and wiring
  - [ ] 10.1 Wire all sections together and verify end-to-end flow
    - Ensure Gate, Terminal, and Scout route components (`tenant.$tenantId.gate.tsx`, `tenant.$tenantId.terminal.tsx`, `tenant.$tenantId.scout.tsx`) pass correct props to refactored sections
    - Verify `FeedbackCard` auto-close timers: 2500ms for Gate, 3000ms for Terminal
    - Verify auto-scan restarts correctly after success/error cycles
    - Verify blocked check completes before any action rendering in all three flows
    - _Requirements: 1.1, 6.1, 8.5_

  - [ ]\* 10.2 Write property test for blocked check completes before action rendering
    - **Property 12: Blocked Check Completes Before Action Rendering**
    - Simulate phase transition to "ready" with async blocked check
    - Assert no action-specific UI content (auto-write trigger, state messages) renders until check resolves
    - Assert stale results are discarded if phase changes during in-flight check
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [ ]\* 10.3 Write property test for auto-scan triggers only after completed cycle
    - **Property 13: Auto-Scan Triggers Only After Completed Cycle With Valid Grant**
    - Generate arbitrary sequences of phase transitions with varying grant states
    - Assert scan() is invoked automatically iff: hasCompletedCycle AND grant non-null AND phase just transitioned to idle
    - **Validates: Requirements 6.1, 6.2, 6.4**

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementations use TypeScript/React
- Existing `useNfcCard`, `useSessionGrant`, and state machine engine are preserved; new hooks compose on top of them
- The `FeedbackCard` component replaces inline conditional rendering across all three sections for consistency

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["3.1", "4.1", "6.1", "9.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "3.4", "4.2", "4.3", "4.4", "6.2", "6.3", "6.4", "9.2"] },
    { "id": 3, "tasks": ["7.1", "9.3", "9.4"] },
    { "id": 4, "tasks": ["7.2", "7.3", "7.4", "7.5"] },
    { "id": 5, "tasks": ["10.1"] },
    { "id": 6, "tasks": ["10.2", "10.3"] }
  ]
}
```
