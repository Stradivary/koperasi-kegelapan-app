# Requirements Document

## Introduction

This document specifies the requirements for a Unified NFC Scanner system that standardizes the NFC experience across the application. The system is architected as a two-layer design:

1. **Generic NFC Layer**: Handles raw NFC operations independent of card format — scanning any NFC tag, detecting empty/invalid cards, reading serial numbers, and raw data operations. This layer is platform-agnostic and extensible.

2. **Payload Operation Layer**: Built on top of the generic layer, handles application-specific CardPayload operations — decryption, validation, business transactions (check-in, debit, topup), and tamper detection.

This separation allows:

- Scanning and identifying unknown/empty/invalid cards before attempting payload operations
- Platform-specific NFC adapters (Web NFC, React Native NFC, etc.)
- Easy extension for new card formats or operation types
- Reuse of the generic layer for non-payload operations (e.g., reading card serial for registration)

Currently, the app has multiple NFC implementations (NfcScanDrawer, NfcTapArea, StationFixCardPanel, StationCardsPanel, dev.nfc-test) with inconsistent UX patterns. The unified component will consolidate these into a single, flexible system.

## Glossary

- **Unified_NFC_Scanner**: The main UI component that provides a standardized NFC scanning experience
- **Generic_NFC_Layer**: The low-level layer handling raw NFC operations independent of card format
- **Payload_Operation_Layer**: The high-level layer handling CardPayload-specific operations
- **NFC_Adapter**: A platform-specific implementation of NFC operations (Web NFC, React Native, etc.)
- **Raw_NFC_Result**: The result of a generic NFC scan containing serial number, raw bytes, and tag metadata
- **Card_Classification**: The type of card detected (empty, invalid_format, valid_payload, unknown, foreign)
- **NFC_Phase**: The current state of the NFC operation (idle, scanning, validating, ready, writing, success, error)
- **Display_Mode**: The visual presentation mode of the scanner (drawer or inline)
- **Operation_Type**: The type of NFC operation being performed (read, write, check-in, check-out, debit, topup, card-issuance, card-repair)
- **Session_Grant**: A cryptographic session containing keys and permissions required for NFC card encryption/decryption
- **Card_Payload**: The data structure containing card information (identity, wallet, session, log entries)
- **Tamper_Detection**: The process of identifying cards with corrupted or manipulated data
- **Auto_Scan**: A mode where NFC scanning starts automatically without requiring user interaction
- **Write_Recovery**: The process of handling and recovering from failed write operations
- **Step_Indicator**: A visual progress indicator showing the current step in multi-step NFC operations

## Requirements

### Requirement 1: Generic NFC Layer - Raw Scanning

**User Story:** As a developer, I want a generic NFC scanning layer that works independently of card format, so that I can detect and handle any NFC tag before attempting payload-specific operations.

#### Acceptance Criteria

1. THE Generic_NFC_Layer SHALL scan NFC tags and return a Raw_NFC_Result containing serial number, raw bytes, NDEF records, and tag metadata
2. THE Generic_NFC_Layer SHALL operate without requiring a Session_Grant for basic scanning operations
3. THE Generic_NFC_Layer SHALL detect empty NFC tags (no NDEF data) and classify them as Card_Classification "empty"
4. THE Generic_NFC_Layer SHALL detect tags with unrecognized data format and classify them as Card_Classification "unknown"
5. THE Generic_NFC_Layer SHALL provide the raw bytes to consumers for custom processing
6. THE Generic_NFC_Layer SHALL expose an onRawScan callback that fires before any payload processing

### Requirement 2: Generic NFC Layer - Card Classification

**User Story:** As a station operator, I want the scanner to identify what type of card was scanned, so that I can take appropriate action for empty, invalid, or foreign cards.

#### Acceptance Criteria

1. THE Generic_NFC_Layer SHALL classify scanned cards into categories: "empty", "invalid_format", "valid_payload", "unknown", "foreign"
2. WHEN a card has no NDEF records, THE Generic_NFC_Layer SHALL classify it as "empty"
3. WHEN a card has NDEF data but does not match the expected magic bytes, THE Generic_NFC_Layer SHALL classify it as "foreign"
4. WHEN a card has matching magic bytes but fails structural validation, THE Generic_NFC_Layer SHALL classify it as "invalid_format"
5. WHEN a card passes structural validation, THE Generic_NFC_Layer SHALL classify it as "valid_payload" and pass to Payload_Operation_Layer
6. THE Generic_NFC_Layer SHALL provide the Card_Classification in the Raw_NFC_Result for UI decision-making

### Requirement 3: Generic NFC Layer - Platform Adapter

**User Story:** As a developer, I want to use different NFC implementations for different platforms, so that the scanner works on web browsers and mobile apps.

#### Acceptance Criteria

1. THE Generic_NFC_Layer SHALL define an NFC_Adapter interface for platform-specific implementations
2. THE NFC_Adapter interface SHALL include methods: scan(), write(), abort(), isSupported()
3. THE Generic_NFC_Layer SHALL provide a WebNfcAdapter implementation using the Web NFC API (NDEFReader)
4. THE Generic_NFC_Layer SHALL allow injection of custom NFC_Adapter implementations for other platforms
5. THE Generic_NFC_Layer SHALL gracefully handle adapter unavailability with appropriate error messages

### Requirement 4: Generic NFC Layer - Raw Write Operations

**User Story:** As a developer, I want to write raw bytes to NFC cards, so that I can initialize empty cards or perform low-level operations.

#### Acceptance Criteria

1. THE Generic_NFC_Layer SHALL support writing raw byte arrays to NFC tags
2. THE Generic_NFC_Layer SHALL support writing NDEF text records for testing purposes
3. THE Generic_NFC_Layer SHALL provide write progress feedback (preparing, waiting for tap, writing, complete)
4. THE Generic_NFC_Layer SHALL handle write failures with descriptive error messages
5. THE Generic_NFC_Layer SHALL support the overwrite flag to replace existing card data

### Requirement 5: Payload Operation Layer - Decryption and Validation

**User Story:** As a user, I want my card data to be securely decrypted and validated, so that my balance and identity are protected.

#### Acceptance Criteria

1. THE Payload_Operation_Layer SHALL receive Raw_NFC_Result from Generic_NFC_Layer for cards classified as "valid_payload"
2. THE Payload_Operation_Layer SHALL decrypt the card body using Session_Grant and AES-256-GCM encryption
3. THE Payload_Operation_Layer SHALL decode the decrypted bytes into a Card_Payload structure
4. THE Payload_Operation_Layer SHALL validate card data integrity including counter binding and hash chain
5. IF decryption or validation fails, THEN THE Payload_Operation_Layer SHALL set tamperDetected flag and provide error details
6. THE Payload_Operation_Layer SHALL invoke onCardRead callback with the validated Card_Payload

### Requirement 6: Payload Operation Layer - Business Operations

**User Story:** As a station operator, I want to perform business transactions on cards, so that I can process check-ins, debits, and topups.

#### Acceptance Criteria

1. THE Payload_Operation_Layer SHALL support Operation_Types: check-in, check-out, debit, topup, card-issuance, card-repair
2. THE Payload_Operation_Layer SHALL validate that the Session_Grant permits the requested Operation_Type
3. THE Payload_Operation_Layer SHALL prepare encrypted payloads for write operations using the Session_Grant
4. THE Payload_Operation_Layer SHALL delegate the actual write to Generic_NFC_Layer
5. THE Payload_Operation_Layer SHALL record successful transactions to the reconciliation outbox
6. THE Payload_Operation_Layer SHALL invoke onWriteSuccess callback with the updated Card_Payload

### Requirement 7: Payload Operation Layer - Session Grant Validation

**User Story:** As a system, I want to validate the session grant before payload operations, so that only authorized operations are performed.

#### Acceptance Criteria

1. THE Payload_Operation_Layer SHALL require a valid Session_Grant for all payload operations
2. IF the Session_Grant is null, THEN THE Payload_Operation_Layer SHALL allow Generic_NFC_Layer operations but block payload operations
3. IF the Session_Grant is expired, THEN THE Payload_Operation_Layer SHALL display an error message indicating session expiry
4. THE Payload_Operation_Layer SHALL validate that the Session_Grant tenant matches the card tenant
5. THE Payload_Operation_Layer SHALL check Session_Grant permissions before allowing specific Operation_Types

### Requirement 8: Display Mode Support

**User Story:** As a developer, I want to use the NFC scanner in different display modes, so that I can integrate it appropriately in various UI contexts (modal dialogs vs embedded screens).

#### Acceptance Criteria

1. THE Unified_NFC_Scanner SHALL support a "drawer" display mode that renders as a Vaul drawer/dialog
2. THE Unified_NFC_Scanner SHALL support an "inline" display mode that renders as an embedded component without modal behavior
3. WHEN the display mode is "drawer", THE Unified_NFC_Scanner SHALL provide open/close state management via props
4. WHEN the display mode is "inline", THE Unified_NFC_Scanner SHALL render directly in the parent container without overlay
5. THE Unified_NFC_Scanner SHALL maintain consistent visual styling across both display modes

### Requirement 9: NFC Phase State Management

**User Story:** As a user, I want to see clear visual feedback about the current NFC operation state, so that I know what action to take next.

#### Acceptance Criteria

1. THE Unified_NFC_Scanner SHALL display distinct visual states for each NFC_Phase (idle, scanning, classifying, validating, ready, writing, success, error)
2. WHEN the NFC_Phase is "idle", THE Unified_NFC_Scanner SHALL display a tap area prompting the user to scan a card
3. WHEN the NFC_Phase is "scanning", THE Unified_NFC_Scanner SHALL display an animated pulse effect indicating active scanning
4. WHEN the NFC_Phase is "classifying", THE Unified_NFC_Scanner SHALL display a brief indicator while determining card type
5. WHEN the NFC_Phase is "validating", THE Unified_NFC_Scanner SHALL display a loading indicator with validation message
6. WHEN the NFC_Phase is "ready", THE Unified_NFC_Scanner SHALL display the card information and available actions
7. WHEN the NFC_Phase is "writing", THE Unified_NFC_Scanner SHALL display a warning animation prompting user to hold the card steady
8. WHEN the NFC_Phase is "success", THE Unified_NFC_Scanner SHALL display a success indicator with operation result
9. WHEN the NFC_Phase is "error", THE Unified_NFC_Scanner SHALL display an error indicator with error message and recovery options

### Requirement 10: Empty and Invalid Card Handling

**User Story:** As a station operator, I want to see what type of card was scanned when it's not a valid payload card, so that I can decide whether to initialize it or reject it.

#### Acceptance Criteria

1. WHEN Card_Classification is "empty", THE Unified_NFC_Scanner SHALL display "Kartu Kosong" with the serial number
2. WHEN Card_Classification is "empty" AND onInitializeCard callback is provided, THE Unified_NFC_Scanner SHALL display an "Inisialisasi Kartu" button
3. WHEN Card_Classification is "foreign", THE Unified_NFC_Scanner SHALL display "Kartu Tidak Dikenal" with option to view raw data
4. WHEN Card_Classification is "invalid_format", THE Unified_NFC_Scanner SHALL display "Format Kartu Rusak" with repair option if available
5. THE Unified_NFC_Scanner SHALL always display the card serial number regardless of Card_Classification

### Requirement 11: Auto-Scan Capability

**User Story:** As a kiosk operator, I want the NFC scanner to start scanning automatically, so that users can tap their cards without pressing a button first.

#### Acceptance Criteria

1. WHERE the autoScan option is enabled, THE Unified_NFC_Scanner SHALL start scanning immediately when mounted or opened
2. WHERE the autoScan option is disabled, THE Unified_NFC_Scanner SHALL wait for user interaction before starting to scan
3. WHEN autoScan is enabled AND NFC is not supported, THE Unified_NFC_Scanner SHALL display an error message indicating NFC unavailability
4. WHERE autoScan is enabled AND requireGrant is false, THE Unified_NFC_Scanner SHALL scan without requiring Session_Grant

### Requirement 12: Scan Mode Configuration

**User Story:** As a developer, I want to configure whether the scanner requires payload validation or just raw scanning, so that I can use it for different purposes.

#### Acceptance Criteria

1. THE Unified_NFC_Scanner SHALL support scanMode "raw" that only uses Generic_NFC_Layer without payload processing
2. THE Unified_NFC_Scanner SHALL support scanMode "payload" that uses both layers with full validation
3. WHEN scanMode is "raw", THE Unified_NFC_Scanner SHALL NOT require a Session_Grant
4. WHEN scanMode is "payload", THE Unified_NFC_Scanner SHALL require a valid Session_Grant
5. THE default scanMode SHALL be "payload" for backward compatibility

### Requirement 13: Error Handling and Recovery

**User Story:** As a user, I want clear error messages and recovery options when NFC operations fail, so that I can resolve issues and complete my transaction.

#### Acceptance Criteria

1. WHEN an error occurs, THE Unified_NFC_Scanner SHALL display a descriptive error message in Indonesian
2. WHEN an error occurs AND the error is recoverable, THE Unified_NFC_Scanner SHALL display a "Coba Lagi" (Retry) button
3. WHEN Tamper_Detection identifies a corrupted card, THE Unified_NFC_Scanner SHALL display a "Kartu Terdeteksi Rusak" warning
4. WHERE the onFixCard callback is provided AND Tamper_Detection is true, THE Unified_NFC_Scanner SHALL display a "Perbaiki Kartu" (Fix Card) button
5. THE Unified_NFC_Scanner SHALL provide an onError callback that receives the error details including Card_Classification
6. WHEN the user clicks the retry button, THE Unified_NFC_Scanner SHALL reset the state and restart the scan operation

### Requirement 14: Error Skipping

**User Story:** As a station operator, I want to skip certain errors and continue with the next operation, so that I can handle edge cases without blocking the workflow.

#### Acceptance Criteria

1. WHERE the allowSkip option is enabled, THE Unified_NFC_Scanner SHALL display a "Lewati" (Skip) button on error states
2. WHEN the user clicks the skip button, THE Unified_NFC_Scanner SHALL invoke the onSkip callback with error details and reset to idle state
3. WHERE the allowSkip option is disabled, THE Unified_NFC_Scanner SHALL NOT display the skip button

### Requirement 15: Step Indicator

**User Story:** As a user, I want to see my progress through multi-step NFC operations, so that I understand where I am in the process.

#### Acceptance Criteria

1. WHERE the showSteps option is enabled, THE Unified_NFC_Scanner SHALL display a Step_Indicator showing operation progress
2. THE Step_Indicator SHALL display steps: "Tap Kartu", "Kartu Ditemukan", "Tulis Kartu", "Selesai"
3. THE Step_Indicator SHALL highlight the current step based on the NFC_Phase
4. THE Step_Indicator SHALL show completed steps with a checkmark indicator
5. WHERE the showSteps option is disabled, THE Unified_NFC_Scanner SHALL NOT display the Step_Indicator

### Requirement 16: Card Information Display

**User Story:** As a user, I want to see my card information after scanning, so that I can verify my identity and balance before proceeding.

#### Acceptance Criteria

1. WHEN the NFC_Phase is "ready" AND Card_Classification is "valid_payload", THE Unified_NFC_Scanner SHALL display the cardholder name from Card_Payload
2. WHEN the NFC_Phase is "ready" AND Card_Classification is "valid_payload", THE Unified_NFC_Scanner SHALL display the card status using a CardStatusBadge component
3. WHEN the NFC_Phase is "ready" AND Card_Classification is "valid_payload", THE Unified_NFC_Scanner SHALL display the wallet balance formatted as Indonesian Rupiah
4. WHERE the showCheckInStatus option is enabled, THE Unified_NFC_Scanner SHALL display whether the card is currently checked in
5. WHEN Card_Classification is not "valid_payload", THE Unified_NFC_Scanner SHALL display the serial number and classification type

### Requirement 17: Action Buttons

**User Story:** As a station operator, I want contextual action buttons based on the card state, so that I can perform the appropriate operation.

#### Acceptance Criteria

1. WHERE the Operation_Type is "check-in" or "check-out", THE Unified_NFC_Scanner SHALL display check-in and check-out buttons
2. WHEN the card is already checked in, THE Unified_NFC_Scanner SHALL disable the check-in button
3. WHEN the card is not checked in, THE Unified_NFC_Scanner SHALL disable the check-out button
4. WHEN the card status is not ACTIVE, THE Unified_NFC_Scanner SHALL disable transaction buttons
5. WHERE custom action buttons are provided via renderActions prop, THE Unified_NFC_Scanner SHALL render those instead of default buttons
6. WHEN Card_Classification is "empty", THE Unified_NFC_Scanner SHALL display card initialization actions if permitted

### Requirement 18: NFC Support Detection

**User Story:** As a user, I want to be informed if my device doesn't support NFC, so that I know why the scanner isn't working.

#### Acceptance Criteria

1. WHEN the component mounts, THE Generic_NFC_Layer SHALL check for NFC_Adapter availability
2. IF NFC is not supported, THEN THE Unified_NFC_Scanner SHALL display a message indicating NFC is not available on the device
3. THE Unified_NFC_Scanner SHALL provide an isNfcSupported property for parent components to check NFC availability
4. THE Generic_NFC_Layer SHALL provide adapter capability information (read-only, read-write, etc.)

### Requirement 19: Cancel and Reset Operations

**User Story:** As a user, I want to cancel an ongoing NFC operation, so that I can abort if I change my mind.

#### Acceptance Criteria

1. WHEN the NFC_Phase is "scanning", "classifying", "validating", or "writing", THE Unified_NFC_Scanner SHALL display a cancel button
2. WHEN the user clicks the cancel button, THE Unified_NFC_Scanner SHALL abort the current operation via NFC_Adapter and reset to idle state
3. THE Unified_NFC_Scanner SHALL provide a reset function that can be called programmatically to reset the scanner state
4. THE Generic_NFC_Layer SHALL properly clean up NFC_Adapter resources on abort

### Requirement 20: Success Auto-Close

**User Story:** As a user in drawer mode, I want the scanner to close automatically after a successful operation, so that I don't have to manually dismiss it.

#### Acceptance Criteria

1. WHERE the autoCloseOnSuccess option is enabled AND display mode is "drawer", THE Unified_NFC_Scanner SHALL automatically close after a configurable delay following success
2. THE default auto-close delay SHALL be 2000 milliseconds
3. WHERE the autoCloseOnSuccess option is disabled, THE Unified_NFC_Scanner SHALL remain open until manually closed

### Requirement 21: Accessibility

**User Story:** As a user with accessibility needs, I want the NFC scanner to be accessible, so that I can use it with assistive technologies.

#### Acceptance Criteria

1. THE Unified_NFC_Scanner SHALL provide appropriate ARIA labels for all interactive elements
2. THE Unified_NFC_Scanner SHALL support keyboard navigation for all buttons and controls
3. THE Unified_NFC_Scanner SHALL announce state changes to screen readers using ARIA live regions
4. THE Unified_NFC_Scanner SHALL maintain sufficient color contrast ratios for all visual states

### Requirement 22: Customizable Labels

**User Story:** As a developer, I want to customize the labels and messages in the scanner, so that I can adapt it to different use cases.

#### Acceptance Criteria

1. THE Unified_NFC_Scanner SHALL accept a labels prop for customizing displayed text
2. THE Unified_NFC_Scanner SHALL provide default Indonesian labels for all text content
3. WHEN custom labels are provided, THE Unified_NFC_Scanner SHALL use them instead of defaults
4. THE labels prop SHALL include messages for all Card_Classification types

### Requirement 23: Extensible Operation Handlers

**User Story:** As a developer, I want to register custom operation handlers, so that I can extend the scanner with new business operations without modifying core code.

#### Acceptance Criteria

1. THE Payload_Operation_Layer SHALL support registration of custom operation handlers via an operations prop
2. EACH operation handler SHALL receive the current Card_Payload and return an updated Card_Payload
3. THE Payload_Operation_Layer SHALL validate operation handler results before writing
4. THE Unified_NFC_Scanner SHALL display custom operation buttons when custom handlers are registered
5. THE operation handler interface SHALL include: name, label, icon, isEnabled(payload), execute(payload)

### Requirement 24: Continuous Scan Mode

**User Story:** As a kiosk operator processing multiple cards, I want the scanner to automatically reset after each successful operation, so that the next user can scan immediately.

#### Acceptance Criteria

1. WHERE the continuousScan option is enabled, THE Unified_NFC_Scanner SHALL automatically reset to scanning state after success
2. THE continuousScan reset delay SHALL be configurable with a default of 3000 milliseconds
3. WHERE continuousScan is enabled, THE Unified_NFC_Scanner SHALL display a countdown indicator before auto-reset
4. THE user SHALL be able to manually reset before the countdown completes

### Requirement 25: Raw Data Inspection

**User Story:** As a developer or support staff, I want to inspect the raw data on a card, so that I can debug issues or verify card contents.

#### Acceptance Criteria

1. WHERE the showRawData option is enabled, THE Unified_NFC_Scanner SHALL display a "Lihat Data Mentah" (View Raw Data) button
2. WHEN the raw data button is clicked, THE Unified_NFC_Scanner SHALL display the Raw_NFC_Result in a readable format
3. THE raw data display SHALL include: serial number, byte count, hex dump, NDEF record types
4. THE raw data display SHALL be collapsible to avoid cluttering the main UI
