# Requirements Document

## Introduction

This document specifies the requirements for UX/UI stabilization of the three kiosk-mode NFC card interaction screens in the cooperative parking system: Gate (check-in), Terminal (check-out), and Scout (balance check). The stabilization eliminates race conditions in the scan→validate→act pipeline, provides consistent visual feedback at every phase transition, and ensures continuous kiosk operation without operator intervention between card taps.

## Glossary

- **Gate**: The kiosk screen responsible for NFC card check-in at parking entry
- **Terminal**: The kiosk screen responsible for NFC card check-out with parking fee deduction at parking exit
- **Scout**: The kiosk screen for read-only NFC card balance and status checks
- **NFC_Phase**: The current state of an NFC interaction cycle: idle, scanning, validating, ready, writing, success, or error
- **Card_Payload**: The decrypted data structure read from an NFC card containing identity, wallet, session, and log entries
- **Blocked_Check**: An asynchronous lookup against the local IndexedDB to determine if a card or member is blocked
- **Auto_Scan**: The automatic restart of NFC scanning after a completed interaction cycle in kiosk mode
- **Session_Grant**: A time-limited authorization token bound to (tenantId, accountId, deviceId) that permits NFC operations
- **FeedbackCard**: A declarative UI component that displays operation results (success, error, warning, blocked) with consistent styling
- **State_Machine**: The validation engine that enforces valid card state transitions (IDLE → CHECKED_IN → CHECKED_OUT)
- **MIN_BALANCE**: The minimum balance threshold of 10,000 units required for check-in and maintained after checkout
- **Reconciliation_Outbox**: The local queue of completed transactions awaiting server synchronization

## Requirements

### Requirement 1: NFC Phase State Management

**User Story:** As a kiosk operator, I want the NFC interaction to follow a deterministic phase sequence, so that the UI always reflects the true state of the card interaction pipeline.

#### Acceptance Criteria

1. THE NFC_Phase state machine SHALL enforce the nominal transition sequence: idle → scanning → validating → ready → writing → success → idle, and SHALL permit a transition from any phase to "error" and from "error" to "idle"
2. WHILE NFC_Phase is "ready", "writing", or "success", THE system SHALL ensure Card_Payload is non-null
3. WHILE NFC_Phase is "ready", "writing", or "success", THE system SHALL ensure serialNumber is non-null
4. WHILE NFC_Phase is "error", THE system SHALL ensure the error message is non-null
5. WHEN NFC_Phase transitions to "idle", THE system SHALL reset Card_Payload to null, serialNumber to null, error to null, and tamperDetected to false
6. IF a transition is attempted that does not match the permitted sequence defined in criterion 1, THEN THE system SHALL reject the transition and retain the current phase unchanged

### Requirement 2: Gate Check-in Flow

**User Story:** As a parking member, I want to tap my NFC card at the gate to check in automatically, so that I can enter the parking area without manual steps.

#### Acceptance Criteria

1. WHEN a card is scanned at the Gate AND card status is not ACTIVE, THEN THE Gate SHALL reject the check-in and display the block reason corresponding to the card's status code (BLOCKED_TAMPER, BLOCKED_FRAUD, BLOCKED_EXPIRED, or BLOCKED_ADMIN)
2. WHEN a card is scanned at the Gate AND the Blocked_Check returns blocked, THEN THE Gate SHALL reject the check-in and display the blocked reason from the local database
3. WHEN a card is scanned at the Gate AND card state is CHECKED_IN or STATION_OPERATION, THEN THE Gate SHALL display "Sudah Check-in" without performing a write
4. WHEN a card is scanned at the Gate AND wallet balance is below Rp 10,000, THEN THE Gate SHALL reject the check-in and display a message directing the user to top-up at a station
5. WHEN a card passes all validation checks at the Gate, THEN THE Gate SHALL write the check-in payload to the card, transitioning state from IDLE to CHECKED_IN and recording the terminal ID and current timestamp as session start time
6. WHEN a successful check-in write completes, THEN THE Gate SHALL display a success FeedbackCard for 2.5 seconds before auto-resetting to the scanning-ready state
7. IF the NFC write fails during check-in (card removed or communication error), THEN THE Gate SHALL display an error message and auto-reset to the scanning-ready state within 3 seconds without modifying the card state
8. WHEN a card is scanned at the Gate AND card state is CHECKED_OUT, THEN THE Gate SHALL treat the card as eligible for a new check-in following the standard validation sequence (status, blocked check, balance)

### Requirement 3: Terminal Check-out Flow

**User Story:** As a parking member, I want to tap my NFC card at the terminal to check out and pay the parking fee automatically, so that I can exit without manual calculation.

#### Acceptance Criteria

1. WHEN a card is scanned at the Terminal AND the Blocked_Check returns blocked, THEN THE Terminal SHALL reject the checkout without performing a write and display the blocked reason to the member
2. WHEN a card is scanned at the Terminal AND card state is IDLE or CHECKED_OUT, THEN THE Terminal SHALL display "Belum Check-in" or "Sudah Checkout" respectively without performing a write
3. WHEN a card is scanned at the Terminal AND balance minus fee would leave less than Rp 10,000 (MIN_BALANCE_AFTER_CHECKOUT), THEN THE Terminal SHALL display the fee breakdown showing current balance, parking fee, and required top-up amount without performing a write
4. WHEN a card is scanned at the Terminal AND card status is ACTIVE AND card state is CHECKED_IN AND balance minus fee is greater than or equal to Rp 10,000, THEN THE Terminal SHALL write the checkout payload, transitioning state to CHECKED_OUT and deducting the calculated fee from the balance
5. WHEN a successful checkout write completes, THEN THE Terminal SHALL display a receipt showing duration, fee, and remaining balance for 3 seconds before auto-resetting to the idle scan state
6. THE Terminal SHALL calculate the parking fee as ceil(duration_in_seconds / 3600) multiplied by Rp 2,000 (PARKING_RATE_PER_HOUR)
7. IF the NFC write fails during checkout, THEN THE Terminal SHALL display an error indication and allow the member to retry without altering the card state

### Requirement 4: Scout Balance Check Flow

**User Story:** As a parking member, I want to tap my NFC card at the scout terminal to view my balance and transaction history, so that I can check my account status without modifying the card.

#### Acceptance Criteria

1. THE Scout SHALL never perform a write operation to the NFC card regardless of card state or validation results
2. WHEN a card is scanned at the Scout, THE Scout SHALL display the member name, balance (formatted as currency), card ID (hexadecimal), transaction counter, and card status
3. WHEN the Blocked_Check returns blocked for a Scout scan, THE Scout SHALL display the blocked reason as a warning indicator alongside the full card information without suppressing any displayed fields
4. WHEN the Blocked_Check indicates the card is not in the local database, THE Scout SHALL display a warning that the card is not registered locally alongside the card information
5. WHEN a card is scanned at the Scout, THE Scout SHALL display the on-card transaction log entries below the card information summary
6. WHEN the user taps "Selesai" on the Scout display, THE Scout SHALL transition NFC_Phase to "idle" and clear all per-scan state including localBlockedReason and notInLocalDb flags

### Requirement 5: Blocked Check Race Condition Elimination

**User Story:** As a kiosk operator, I want the system to complete the blocked status check before showing any intermediate UI state, so that users never see misleading information.

#### Acceptance Criteria

1. WHEN NFC_Phase transitions to "ready", THE system SHALL initiate the Blocked_Check before rendering any flow-specific UI content (auto-action triggers, state-specific messages, or write operations)
2. WHILE the Blocked_Check is in progress, THE system SHALL display the NfcTapArea in its scanning/validating visual state and suppress all action-specific messages (e.g., "Sudah Check-in", balance displays, auto-write triggers)
3. WHEN the Blocked_Check completes with "not blocked", THE system SHALL set the isReady flag to true and proceed with the flow-specific validation and action logic defined in Requirements 2, 3, or 4
4. IF NFC_Phase changes during an in-flight Blocked_Check, THEN THE system SHALL discard the stale result and not apply it to the current state
5. WHEN NFC_Phase transitions to "idle", THE system SHALL reset all Blocked_Check state (isChecking, isBlocked, blockedReason, notInLocalDb) to their initial values
6. IF the Blocked_Check fails due to an IndexedDB read error, THEN THE system SHALL treat the card as not blocked (blocked=false, notInLocalDb=true) and allow the flow to proceed

### Requirement 6: Kiosk Auto-Scan Loop

**User Story:** As a kiosk operator, I want the NFC scanner to automatically restart after each completed interaction, so that the kiosk is always ready for the next card tap without manual intervention.

#### Acceptance Criteria

1. WHEN NFC_Phase transitions to "idle" after a cycle that reached "success" or "error" AND Auto_Scan is enabled AND Session_Grant is non-null and not expired, THEN THE system SHALL automatically invoke scan() to begin the next cycle
2. THE Auto_Scan SHALL NOT trigger on initial component mount; the system SHALL only begin auto-scanning after NFC_Phase has reached "success" or "error" at least once since mount
3. WHEN NFC_Phase transitions to "idle" and Auto_Scan prepares the next cycle, THE system SHALL reset all per-cycle state: blockedReason, blockedCheckDone, notInLocalDb, autoActionTriggered flag, insufficientBalance, and lastTx
4. WHILE Session_Grant is null or loading, THE Auto_Scan SHALL remain inactive and not invoke scan()
5. IF Auto_Scan invokes scan() and the scan results in an error phase, THEN THE system SHALL wait for the error display period to elapse and reset to idle before attempting the next auto-scan cycle, preventing immediate retry loops

### Requirement 7: Duplicate Operation Prevention

**User Story:** As a system operator, I want the system to prevent duplicate card writes within a single scan cycle, so that a card is never written to twice from one tap.

#### Acceptance Criteria

1. THE system SHALL maintain an autoActionTriggered guard ref that prevents re-entry into the auto-action logic within a single scan cycle, where a scan cycle is defined as the interval from scan() invocation to the next NFC_Phase transition to "idle"
2. THE system SHALL set the autoActionTriggered guard to true before initiating any write operation, ensuring no subsequent auto-action logic can invoke a second write within the same scan cycle
3. IF the autoActionTriggered guard is already set when an async callback (such as Blocked_Check resolution) attempts to trigger a write, THEN THE system SHALL discard the callback result and not initiate any write operation
4. THE system SHALL permit at most one NFC write operation per scan cycle, regardless of how many times the auto-action effect fires or async callbacks resolve
5. WHEN NFC_Phase transitions to "idle", THE system SHALL reset the autoActionTriggered guard to false to allow the next scan cycle to proceed

### Requirement 8: Consistent Visual Feedback

**User Story:** As a parking member, I want clear visual feedback at every step of the card interaction, so that I know what is happening and what to do next.

#### Acceptance Criteria

1. WHEN NFC_Phase is "idle", THE system SHALL display the NfcTapArea as a circular tap target with a dashed border, NFC icon, and a label indicating the expected action (e.g., "Tap untuk Masuk", "Tap untuk Checkout"), clickable to initiate a scan
2. WHEN NFC_Phase is "scanning" or "validating", THE system SHALL display the NfcTapArea with a pulsing NFC icon, an animated ring indicator, and a status label describing the current sub-step ("Menunggu kartu NFC..." or "Memvalidasi...")
3. WHEN NFC_Phase is "writing", THE system SHALL display the NfcTapArea with a spinning ring animation, a warning-colored border, and a status label instructing the user not to move the card ("Menulis kartu, jangan pindahkan...")
4. WHEN NFC_Phase is "success", THE system SHALL display a success FeedbackCard showing: for Gate check-in — member name and confirmation message; for Terminal checkout — member name, duration, fee, and remaining balance; for Scout — member name, balance, card ID, transaction counter, and status
5. WHEN NFC_Phase is "success", THE system SHALL auto-dismiss the success FeedbackCard after 2500 ms for Gate or 3000 ms for Terminal, then reset to idle
6. WHEN NFC_Phase is "error", THE system SHALL display an error FeedbackCard with the error description text and a "Coba Lagi" (retry) button that resets the phase to idle
7. IF a card is blocked or rejected during validation, THEN THE system SHALL display a rejection FeedbackCard with the specific blocked reason text, the member name, and a "Selesai" (done) button that resets the phase to idle
8. WHILE the Blocked_Check is in progress after phase transitions to "ready", THE system SHALL display a processing indicator ("Memproses...") and suppress any action-specific content until the check resolves

### Requirement 9: Error Recovery

**User Story:** As a kiosk operator, I want the system to recover gracefully from NFC errors without requiring manual intervention, so that the kiosk remains operational.

#### Acceptance Criteria

1. WHEN an NFC read failure occurs within 10 seconds of a successful write, THEN THE system SHALL display "Lepas kartu sebentar lalu tap ulang" instead of a generic error
2. WHEN a transient post-write read error is displayed, THE system SHALL auto-reset after 3 seconds and restart the scan loop
3. IF the card is removed during an NFC write operation, THEN THE system SHALL store the pending write in memory and display "Tap ulang untuk menyelesaikan"
4. WHEN the next card tap occurs after a stored pending write AND the scanned serialNumber matches the pending write's target serialNumber, THE system SHALL execute the stored write operation before processing a new scan
5. IF the next card tap occurs after a stored pending write AND the scanned serialNumber does not match the pending write's target serialNumber, THEN THE system SHALL discard the stored pending write and process the new card as a fresh scan
6. IF no card tap occurs within 30 seconds of a stored pending write, THEN THE system SHALL discard the pending write, display an error indicating the operation was not completed, and auto-reset to idle after 3 seconds
7. WHEN Session_Grant expires while the device is online, THE system SHALL display "Tidak ada sesi aktif" with the scan button disabled and Auto_Scan inactive until a new grant is obtained
8. WHEN tamper detection identifies an HMAC mismatch or invalid hash chain, THE system SHALL display a tamper warning using the error FeedbackCard variant, disable Auto_Scan, and require the operator to tap "Coba Lagi" to restart the scan loop

### Requirement 10: Checkout Fee Calculation Correctness

**User Story:** As a parking member, I want the checkout fee to be calculated correctly based on my parking duration, so that I am charged fairly.

#### Acceptance Criteria

1. THE Terminal SHALL calculate duration as the difference between current time and session start time in seconds, treating any result less than 1 second as 1 second (minimum 1-hour billing)
2. IF the calculated duration is negative due to clock drift, THEN THE Terminal SHALL treat the duration as 1 second and apply the minimum 1-hour fee
3. THE Terminal SHALL round duration up to the next full hour for fee calculation (ceiling function), such that any partial hour is billed as a complete hour
4. THE Terminal SHALL compute the fee as ceil(duration_seconds / 3600) multiplied by PARKING_RATE_PER_HOUR (2,000)
5. THE Terminal SHALL verify that balance after fee deduction remains at or above MIN_BALANCE (10,000)
6. IF balance after fee deduction would fall below MIN_BALANCE, THEN THE Terminal SHALL display the deficit amount needed for top-up, calculated as (fee + MIN_BALANCE) minus current balance

### Requirement 11: Accessibility and Kiosk UX

**User Story:** As a parking member with varying abilities, I want the kiosk interface to be accessible and provide appropriate feedback modalities, so that I can use the system independently.

#### Acceptance Criteria

1. THE NfcTapArea SHALL include role="button", an aria-label reflecting the phase-specific action text (e.g., "Tempelkan Kartu" when idle, "Menunggu kartu" when scanning, "Memproses" when writing), and aria-busy="true" when NFC_Phase is "scanning", "validating", or "writing"
2. THE FeedbackCard SHALL use aria-live="polite" to announce status changes to screen readers when the card variant or title content changes
3. WHEN NFC_Phase transitions occur, THE system SHALL trigger haptic feedback via navigator.vibrate with a 50ms pulse for intermediate transitions (scanning, validating, writing), a 100ms pulse for success, and two 50ms pulses separated by 50ms for error
4. IF navigator.vibrate is not supported, THEN THE system SHALL skip haptic feedback without throwing an error or degrading other feedback modalities
5. THE system SHALL maintain a minimum text contrast ratio of 4.5:1 against the background for body text (type-body1, type-body2) and 3:1 for large text (type-title-bold), consistent with WCAG 2.1 AA

### Requirement 12: Offline Operation Continuity

**User Story:** As a kiosk operator, I want the system to continue operating when the network is unavailable, so that parking operations are not interrupted by connectivity issues.

#### Acceptance Criteria

1. WHILE the device is offline AND the cached Session_Grant has not exceeded its expiresAt timestamp, THE system SHALL continue processing NFC card operations using the cached Session_Grant
2. IF the cached Session_Grant expiresAt timestamp is reached while the device is offline, THEN THE system SHALL cease NFC write operations and display a session-expired notification until connectivity is restored and a new grant is obtained
3. WHEN a card operation completes while offline, THE system SHALL persist the transaction to the Reconciliation_Outbox for later synchronization
4. WHEN the device transitions from online to offline, THE system SHALL display a toast notification indicating loss of connectivity for 4 seconds
5. WHEN the device transitions from offline to online, THE system SHALL display a toast notification indicating restored connectivity for 3 seconds
6. WHEN the device transitions from offline to online AND the Reconciliation_Outbox contains pending transactions, THE system SHALL initiate outbox synchronization automatically
7. THE system SHALL use indexed keys ([tenantId, serialNumber]) for Blocked_Check lookups to maintain response times of 100 milliseconds or less regardless of database size
