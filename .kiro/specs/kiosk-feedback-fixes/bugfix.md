# Bugfix Requirements Document

## Introduction

This document addresses a batch of bugs and missing behaviors reported by Ahmad Muzaki (21:39–21:48) for the koperasi kiosk system. The issues span NFC card scanning, tenant validation, balance enforcement, error messaging, rapid-tap handling, CRUD synchronization, and audit logging across the Gate (check-in/checkout) and Kiosk (balance/transaction) modes. These bugs cause incorrect fallback behavior, missing user feedback, payload corruption on rapid taps, stale CRUD data, and empty audit logs.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an NFC card is scanned that belongs to a different tenant (the session-encrypted block decrypts with a different tenant key, revealing it's from another tenant) THEN the system does not display the correct fallback message and may attempt to write using the wrong encryption context

1.2 WHEN a non-tenant card is detected via the dual-encryption scheme (static key decrypts the base block but tenant-specific session key fails) THEN the system leaks card details (balance, name) instead of treating the card as foreign with no detail exposure

1.3 WHEN a user taps their NFC card rapidly (multiple scans within < 1 second) THEN the system processes duplicate scan events causing the entire payload to get cleaned up / corrupted when the write fails mid-cycle

1.4 WHEN registering a new card on the Saldo/balance screen without selecting an amount first THEN the system encounters an error and fails to complete the card registration flow

1.5 WHEN a member attempts check-in with a balance below 10,000 (Rp 10.000) THEN the system allows check-in without enforcing the minimum balance requirement

1.6 WHEN a member attempts checkout but their balance is insufficient to cover the parking fee THEN the system does not display a fallback message directing the user to top up at a station

1.7 WHEN an unregistered card (no valid payload or unknown card) is scanned THEN the system does not display the message "Kartu anda tidak terdaftar / anda bukan member, harap daftarkan terlebih dahulu di station"

1.8 WHEN checkout completes successfully THEN the system shows transaction history (log entries) instead of only displaying the final balance after deduction

1.9 WHEN a card with insufficient balance (< checkout fee) is scanned at checkout THEN the system does not display the message "Saldo anda kurang untuk checkout, harap isi Saldo terlebih dahulu"

1.10 WHEN a card with balance below 10,000 is scanned at check-in THEN the system does not display the message "Saldo anda dibawah 10rb, harap isi topup dahulu di station"

1.11 WHEN a checkout or topup operation is performed on a card THEN the system only updates the NFC card payload but does NOT update the backend CRUD (database records), causing the CRUD to retain stale data (all top-ups recorded, no deductions reflected)

1.12 WHEN any card operation (check-in, checkout, debit, topup) is performed THEN the audit log remains empty and no transaction event is recorded for reconciliation

### Expected Behavior (Correct)

2.1 WHEN an NFC card is scanned that belongs to a different tenant (session-encrypted block fails tenant-specific decryption) THEN the system SHALL identify the card as foreign using the dual-encryption scheme (static key for base detection, tenant key for session block) and SHALL display "Kartu anda tidak terdaftar / anda bukan member, harap daftarkan terlebih dahulu di station" without exposing any card details (balance, name, etc.)

2.2 WHEN a non-tenant card is detected THEN the system SHALL only use the static-key decrypted block to confirm it is a valid koperasi card, SHALL NOT decrypt or display the tenant-specific session data, and SHALL NOT proceed with any write operation

2.3 WHEN a user taps their NFC card rapidly (multiple scans within < 1 second) THEN the system SHALL debounce/ignore subsequent taps while a scan cycle is in progress (phase ≠ idle), SHALL process only the first tap, and SHALL NOT corrupt or clean up the existing payload if a write is in progress

2.4 WHEN registering a new card on the Saldo/balance screen THEN the system SHALL allow registration without requiring an amount to be pre-selected, SHALL provide a custom amount input option, and SHALL complete the registration flow without errors

2.5 WHEN a member attempts check-in with a balance below 10,000 (Rp 10.000) THEN the system SHALL reject the check-in and display "Saldo anda dibawah 10rb, harap isi topup dahulu di station"

2.6 WHEN a member attempts checkout but their balance is insufficient to cover the calculated parking fee THEN the system SHALL reject the checkout and display "Saldo anda kurang untuk checkout, harap isi Saldo terlebih dahulu"

2.7 WHEN an unregistered card (no valid payload, unknown classification, or card not in local DB) is scanned THEN the system SHALL display "Kartu anda tidak terdaftar / anda bukan member, harap daftarkan terlebih dahulu di station"

2.8 WHEN checkout completes successfully THEN the system SHALL display only the final balance after deduction without showing transaction history/log entries

2.9 WHEN a card with insufficient balance for checkout is detected THEN the system SHALL display "Saldo anda kurang untuk checkout, harap isi Saldo terlebih dahulu" and SHALL NOT proceed with the checkout write

2.10 WHEN a card with balance below 10,000 is detected at check-in THEN the system SHALL display "Saldo anda dibawah 10rb, harap isi topup dahulu di station" and SHALL NOT proceed with the check-in write

2.11 WHEN a checkout or topup operation is performed on a card THEN the system SHALL update both the NFC card payload AND the backend CRUD (database records) to reflect the new balance, ensuring deductions and credits are synchronized

2.12 WHEN any card operation (check-in, checkout, debit, topup) is performed THEN the system SHALL write an audit log entry recording the transaction type, amount, card ID, timestamp, and balance-after for reconciliation purposes

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a valid card belonging to the current tenant is scanned with sufficient balance (≥ 10,000) THEN the system SHALL CONTINUE TO process check-in normally and write the updated state to the card

3.2 WHEN a valid card is scanned at checkout with sufficient balance to cover the parking fee THEN the system SHALL CONTINUE TO calculate the fee, deduct from balance, and write the checkout state to the card

3.3 WHEN a single NFC tap occurs at normal speed (no rapid repeat) THEN the system SHALL CONTINUE TO process the scan through the full state machine cycle (idle → scanning → classifying → validating → ready → writing → success)

3.4 WHEN a card with ACTIVE status and valid tenant binding is scanned THEN the system SHALL CONTINUE TO display the member name, balance, and card status correctly

3.5 WHEN a blocked card (BLOCKED_TAMPER, BLOCKED_FRAUD, BLOCKED_EXPIRED, BLOCKED_ADMIN) is scanned THEN the system SHALL CONTINUE TO reject the operation with the appropriate blocked reason message

3.6 WHEN the session grant is valid and not expired THEN the system SHALL CONTINUE TO allow NFC write operations for authorized operation types

3.7 WHEN a debit transaction is performed at the kiosk with sufficient balance THEN the system SHALL CONTINUE TO deduct the amount and show the remaining balance

3.8 WHEN a card is successfully written with new data THEN the system SHALL CONTINUE TO use the dual-buffer scheme (active/inactive pointer) to prevent data loss on interrupted writes
