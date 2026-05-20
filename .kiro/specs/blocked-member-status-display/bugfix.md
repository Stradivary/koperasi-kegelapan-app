# Bugfix Requirements Document

## Introduction

After blocking a member (via admin action or system detection), the blocked status is not properly displayed across the application's NFC scanning views. In the Terminal and Gate views, scanning a blocked card that is in IDLE state (not checked in) shows "belum check-in/check-out" instead of indicating the card is blocked. In the Scout view, the status badge reads from the on-card payload status only, missing cases where the member was blocked via the local database (admin block) but the physical card hasn't been updated yet.

This bug undermines the blocking mechanism because operators at terminals and gates are not informed that a card/member is blocked, potentially allowing blocked members to continue using services.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a blocked card (blocked in local DB) is scanned at the Terminal AND the card's wallet state is IDLE (not checked in) THEN the system shows "Belum Check-in" message instead of showing the blocked status, because the card-state check short-circuits before the `checkLocalBlockedStatus` call is reached

1.2 WHEN a blocked card (blocked in local DB) is scanned at the Terminal AND the card's wallet state is CHECKED_OUT THEN the system shows "Sudah Checkout" message instead of showing the blocked status, because the card-state check short-circuits before the `checkLocalBlockedStatus` call is reached

1.3 WHEN a blocked card (blocked in local DB) is scanned at the Gate AND the card's wallet state is already CHECKED_IN THEN the system shows "Sudah Check-in" message instead of showing the blocked status, because the `isAlreadyCheckedIn` render condition takes priority over the `blockedReason` state when both could apply

1.4 WHEN a blocked member's card is scanned at the Scout view AND the on-card status is still ACTIVE (card not yet physically updated) THEN the system displays "Active" status badge instead of showing "Blocked" status, because the Scout only reads `payload.identity.status` from the card and does not check the local DB blocked status

### Expected Behavior (Correct)

2.1 WHEN a blocked card (blocked in local DB) is scanned at the Terminal AND the card's wallet state is IDLE THEN the system SHALL display the blocked status message (e.g., "Kartu diblokir" or "Akun anggota ditangguhkan") with the access denied UI, regardless of the card's wallet state

2.2 WHEN a blocked card (blocked in local DB) is scanned at the Terminal AND the card's wallet state is CHECKED_OUT THEN the system SHALL display the blocked status message with the access denied UI, regardless of the card's wallet state

2.3 WHEN a blocked card (blocked in local DB) is scanned at the Gate AND the card's wallet state is already CHECKED_IN THEN the system SHALL display the blocked status message with the access denied UI, taking priority over the "Sudah Check-in" message

2.4 WHEN a blocked member's card is scanned at the Scout view AND the on-card status is still ACTIVE but the local DB shows the member/card as blocked THEN the system SHALL display "Blocked" status (or the specific block reason) in the status badge area, supplementing the on-card status with local DB information

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an active (non-blocked) card in IDLE state is scanned at the Terminal THEN the system SHALL CONTINUE TO show "Belum Check-in" message as before

3.2 WHEN an active (non-blocked) card in CHECKED_IN state is scanned at the Terminal THEN the system SHALL CONTINUE TO perform the auto-checkout flow normally

3.3 WHEN an active (non-blocked) card in IDLE state is scanned at the Gate THEN the system SHALL CONTINUE TO perform the auto-checkin flow normally

3.4 WHEN an active (non-blocked) card that is already CHECKED_IN is scanned at the Gate THEN the system SHALL CONTINUE TO show "Sudah Check-in" message as before

3.5 WHEN an active (non-blocked) card is scanned at the Scout view THEN the system SHALL CONTINUE TO display "Active" status badge and show member information normally

3.6 WHEN a card with on-card blocked status (e.g., BLOCKED_TAMPER, BLOCKED_ADMIN) is scanned at the Gate THEN the system SHALL CONTINUE TO show the blocked reason from the on-card status as it currently does

3.7 WHEN a blocked card is scanned at the Gate AND the block is detected THEN the system SHALL CONTINUE TO reject the check-in operation and show the access denied UI
