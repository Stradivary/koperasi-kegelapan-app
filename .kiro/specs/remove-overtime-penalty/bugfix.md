# Bugfix Requirements Document

## Introduction

The overtime penalty feature is unwanted functionality that must be completely removed from the codebase. Currently, when a check-in session exceeds 24 hours (86400 seconds), the system calculates and deducts a penalty from the member's balance at a rate of 5000 IDR per overtime hour. This behavior is undesirable — checkout should always proceed using the standard parking fee calculation (`applyCheckout`) regardless of session duration. The overtime penalty modules, UI indicators, and related validation logic must be eliminated entirely.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a session duration exceeds 86400 seconds (24 hours) THEN the system calculates an overtime penalty using `calculatePenalty` (overtimeHours × tariffRate) and deducts it from the member's balance instead of charging the normal parking fee

1.2 WHEN a session is overtime and the member's balance is insufficient to cover the penalty THEN the system blocks checkout entirely and displays "Saldo tidak cukup untuk denda overtime" requiring a top-up

1.3 WHEN an overtime checkout succeeds with penalty deduction THEN the system displays "Denda Overtime" and "⚠ Overtime — Denda diterapkan" in the terminal UI instead of the normal fee label

1.4 WHEN a session is overtime THEN the system uses `resetWithPenalty` and `applyReset` from `cardResetHandler` to reset the card state with penalty deduction, bypassing the standard `applyCheckout` flow

### Expected Behavior (Correct)

2.1 WHEN a session duration exceeds 86400 seconds (24 hours) THEN the system SHALL perform a normal checkout using `applyCheckout` with the standard parking fee calculation (hours × PARKING_RATE_PER_HOUR, capped at balance)

2.2 WHEN a session is overtime THEN the system SHALL NOT block checkout due to insufficient balance for a penalty — checkout SHALL always proceed with the standard fee

2.3 WHEN checkout succeeds for any session duration THEN the system SHALL display "Biaya" as the fee label with the standard parking fee amount, without any overtime warning or penalty indicator

2.4 WHEN checkout is performed THEN the system SHALL use `applyCheckout` from the state machine engine directly, without routing through overtime detection or penalty calculation logic

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a session duration is within 24 hours THEN the system SHALL CONTINUE TO perform normal checkout with the standard parking fee (hours × PARKING_RATE_PER_HOUR capped at balance)

3.2 WHEN a card is in IDLE or CHECKED_OUT state THEN the system SHALL CONTINUE TO show the appropriate "Belum Check-in" or "Sudah Checkout" message without attempting checkout

3.3 WHEN a card is blocked (via local DB status check) THEN the system SHALL CONTINUE TO reject checkout with the blocked reason message

3.4 WHEN checkout succeeds THEN the system SHALL CONTINUE TO display the member name, duration, fee, and remaining balance in the success UI

3.5 WHEN checkout succeeds THEN the system SHALL CONTINUE TO write the updated payload to the NFC card and trigger sync engine notification

3.6 WHEN a card's state transition is invalid THEN the system SHALL CONTINUE TO reject the checkout with "Transisi tidak valid"
