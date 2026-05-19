# Bugfix Requirements Document

## Introduction

Blocked or suspended members can still check in at the gate, check out at the terminal, and use the station because the local DB member/card status checks have critical gaps. The GateSection uses the wrong card identifier for its local DB lookup (on-card generated UUID instead of hardware serial number), making the card status check dead code. Additionally, when `userId` is 0 (falsy), the member status lookup is skipped entirely. The TerminalSection and StationSection have no local DB status checks at all.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a card is scanned at the gate AND the card's `payload.header.cardId` (6-byte generated UUID) is used to look up `localDb.cards` THEN the system never finds the card record because `localDb.cards` is keyed by hardware serial number, making the blocked-card check ineffective

1.2 WHEN a card is scanned at the gate AND `payload.identity.userId` is 0 (falsy) THEN the system skips the member suspension check entirely because the ternary resolves to `Promise.resolve(null)`

1.3 WHEN a blocked/suspended member's card is scanned at the terminal (checkout) THEN the system proceeds with checkout without any local DB member or card status validation

1.4 WHEN a blocked/suspended member's card is scanned at the station (topup) THEN the system proceeds with the topup operation without any local DB member or card status validation

### Expected Behavior (Correct)

2.1 WHEN a card is scanned at the gate THEN the system SHALL look up the card in `localDb.cards` using the hardware serial number (from the NFC scan) and reject check-in if the card status is not "active"

2.2 WHEN a card is scanned at the gate AND the card is linked to a member (userId > 0) THEN the system SHALL look up the member in `localDb.users` and reject check-in if the member status is not "active"

2.3 WHEN a card is scanned at the gate AND userId is 0 (unlinked card) THEN the system SHALL still enforce the card-level block check (skip only the member check, not the card check)

2.4 WHEN a blocked/suspended member's card is scanned at the terminal THEN the system SHALL check `localDb.cards` and `localDb.users` status and reject checkout if either is not "active"

2.5 WHEN a blocked/suspended member's card is scanned at the station THEN the system SHALL check `localDb.cards` and `localDb.users` status and reject the operation if either is not "active"

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a card with active status (both card and member) is scanned at the gate THEN the system SHALL CONTINUE TO allow check-in as before

3.2 WHEN a card's on-card `identity.status` is not `CardStatus.ACTIVE` THEN the system SHALL CONTINUE TO reject the card based on the on-card status check (existing first-line defense)

3.3 WHEN a card with active status is scanned at the terminal THEN the system SHALL CONTINUE TO process checkout normally including fee calculation and balance deduction

3.4 WHEN a card with active status is scanned at the station THEN the system SHALL CONTINUE TO allow topup and card operations normally

3.5 WHEN a card is scanned at the station for issuing (new card registration) THEN the system SHALL CONTINUE TO allow card issuance regardless of prior card status (new card starts fresh)

3.6 WHEN the `validateTransition` engine function is called THEN the system SHALL CONTINUE TO check on-card status as before (the local DB check is an additional layer, not a replacement)
