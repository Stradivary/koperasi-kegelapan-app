# Implementation Plan: Unified NFC Scanner

## Overview

This implementation plan covers the Unified NFC Scanner system with a two-layer architecture:

1. **Generic NFC Layer** - Platform-agnostic raw NFC operations with card classification
2. **Payload Operation Layer** - Application-specific CardPayload operations with session validation

The implementation follows a bottom-up approach: adapters → generic layer → payload layer → hook → UI components.

## Tasks

- [x] 1. Set up NFC adapter infrastructure
  - [x] 1.1 Create NFC adapter types and interfaces
    - Create `src/core/nfc/adapters/types.ts` with NfcAdapter interface, NfcCapabilities, NfcScanOptions, NfcWriteOptions, NfcReadingEvent, NfcMessage, NfcRecord, NfcErrorEvent
    - Define NfcError type with code, message, and recoverable properties
    - Define NfcErrorCode union type
    - _Requirements: 3.1, 3.2_

  - [x] 1.2 Implement WebNfcAdapter
    - Create `src/core/nfc/adapters/webNfcAdapter.ts` implementing NfcAdapter interface
    - Use NDEFReader from Web NFC API
    - Implement isSupported(), getCapabilities(), scan(), write(), abort()
    - Handle permission requests and errors
    - _Requirements: 3.3, 3.5, 18.1, 18.4_

  - [x] 1.3 Implement MockNfcAdapter for testing
    - Create `src/core/nfc/adapters/mockNfcAdapter.ts` for unit tests
    - Support configurable responses and error simulation
    - _Requirements: 3.4_

  - [x] 1.4 Create adapter barrel export
    - Create `src/core/nfc/adapters/index.ts` exporting all adapters and types
    - _Requirements: 3.1_

- [x] 2. Implement Generic NFC Layer core
  - [x] 2.1 Create RawNfcResult and CardClassification types
    - Create `src/core/nfc/types.ts` with RawNfcResult interface
    - Define CardClassification union type: "empty" | "foreign" | "invalid_format" | "valid_payload" | "unknown"
    - Define WritePhase type
    - _Requirements: 1.1, 2.1, 2.6_

  - [x] 2.2 Implement CardClassifier
    - Create `src/core/nfc/cardClassifier.ts` with classify() function
    - Check for empty tags (no NDEF records)
    - Check magic bytes (0x4b4f5057) for foreign detection
    - Validate structure for invalid_format vs valid_payload
    - _Requirements: 1.3, 1.4, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.3 Write property test for CardClassifier (Property 1)
    - **Property 1: Classification Completeness and Correctness**
    - Test that classification is always exactly one of the valid types
    - Test empty tag → "empty" classification
    - Test wrong magic bytes → "foreign" classification
    - Test valid magic + invalid structure → "invalid_format"
    - Test valid magic + valid structure → "valid_payload"
    - **Validates: Requirements 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5**

  - [x] 2.4 Implement GenericNfcLayer class
    - Create `src/core/nfc/genericNfcLayer.ts`
    - Implement constructor with GenericNfcLayerOptions
    - Implement isSupported(), scan(), writeRaw(), writeText(), abort()
    - Integrate CardClassifier for classification
    - Fire onRawScan callback before payload processing
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 4.1, 4.2, 4.3, 4.4, 4.5, 19.4_

  - [x] 2.5 Write property test for write progress feedback (Property 7)
    - **Property 7: Write Progress Feedback**
    - Test that write operations transition through phases: "preparing" → "waiting" → "writing" → "complete"
    - Test error case transitions to "error" phase
    - **Validates: Requirements 4.3**

  - [x] 2.6 Write unit tests for GenericNfcLayer
    - Test scan flow with mock adapter
    - Test write flow with progress callbacks
    - Test abort functionality
    - Test error handling
    - _Requirements: 1.1, 4.1, 4.4, 19.4_

- [x] 3. Checkpoint - Generic NFC Layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Payload Operation Layer
  - [x] 4.1 Create PayloadOperationLayer types
    - Create `src/core/nfc/payloadTypes.ts` with PayloadOperationLayerOptions, PayloadError, PayloadErrorCode
    - Define OperationType union type
    - Define OperationHandler interface
    - Define SessionValidationResult interface
    - _Requirements: 6.1, 7.1_

  - [x] 4.2 Implement session validation
    - Create `src/core/nfc/sessionValidator.ts` with validateSession() function
    - Check for null session grant → "NO_SESSION"
    - Check for expired session → "SESSION_EXPIRED"
    - Check tenant mismatch → "TENANT_MISMATCH"
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 4.3 Write unit tests for session validation
    - Create `src/core/nfc/sessionValidator.test.ts`
    - Test null session → "NO_SESSION" error
    - Test expired session → "SESSION_EXPIRED" error
    - Test tenant mismatch → "TENANT_MISMATCH" error
    - Test valid session → { valid: true }
    - Test validation order (null → expired → tenant)
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

  - [x] 4.4 Implement payload decryption, validation, and write pipeline
    - Create `src/core/nfc/pipelineEngine.ts`
    - Implement readAndValidateCard() with decrypt → decode → validate flow
    - Implement validateCard() with HMAC, counter binding, and chain hash checks
    - Implement prepareWrite() for encrypting and signing updated payloads
    - Implement commitWrite() for writing to NFC tag
    - Set tamperDetected flag on validation failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.3, 6.4_

  - [x] 4.5 Write integration tests for pipeline flows
    - Create `src/core/nfc/flows.test.ts`
    - Test card issuance flow
    - Test read → validate → write cycle
    - Test check-in/check-out operations
    - Test tamper detection scenarios
    - _Requirements: 5.1, 5.4, 5.5, 6.1_

- [x] 5. Checkpoint - Payload Operation Layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement NFC State Machine and Hook
  - [x] 6.1 Create NFC state machine
    - Create `src/core/nfc/stateMachine.ts` with NfcPhase, NfcState, NfcAction types
    - Implement nfcReducer function for state transitions
    - Handle phase sequence: idle → scanning → classifying → validating/ready → writing → success
    - Handle cancel from any active phase → idle
    - Handle reset → idle with cleared data
    - _Requirements: 9.1, 19.1, 19.2, 19.3, 19.4_

  - [ ]\* 6.2 Write property test for state machine integrity (Property 6)
    - **Property 6: State Machine Integrity**
    - Test phase transitions follow defined sequence
    - Test cancel from any active phase → idle
    - Test reset → idle with cleared data
    - **Validates: Requirements 4.3, 19.1, 19.2, 19.3, 19.4**

  - [x] 6.3 Implement useUnifiedNfc hook
    - Create `src/hooks/useUnifiedNfc.ts`
    - Integrate GenericNfcLayer and PayloadOperationLayer (pipelineEngine)
    - Expose state, isNfcSupported, scan(), write(), reset(), cancel()
    - Handle scanMode "raw" vs "payload"
    - Use nfcReducer for state management
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 18.3, 19.3_

  - [ ]\* 6.4 Write unit tests for useUnifiedNfc hook
    - Test scan flow in raw mode
    - Test scan flow in payload mode
    - Test write operation
    - Test reset and cancel
    - _Requirements: 12.1, 12.2, 19.3_

- [x] 7. Checkpoint - Hook implementation complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement UI Sub-Components
  - [x] 8.1 Create NfcTapArea component
    - Create `src/components/block/UnifiedNfcScanner/NfcTapArea.tsx`
    - Display tap prompt in idle state
    - Show animated pulse effect during scanning
    - Support phase-specific visual states
    - _Requirements: 9.2, 9.3_

  - [x] 8.2 Create StepIndicator component
    - Create `src/components/block/UnifiedNfcScanner/StepIndicator.tsx`
    - Display steps: "Tap Kartu", "Kartu Ditemukan", "Tulis Kartu", "Selesai"
    - Highlight current step based on NfcPhase
    - Show checkmark for completed steps
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 8.3 Create CardInfoDisplay component
    - Create `src/components/block/UnifiedNfcScanner/CardInfoDisplay.tsx`
    - Display cardholder name, CardStatusBadge, wallet balance
    - Format balance as Indonesian Rupiah
    - Show check-in status when enabled
    - Handle non-payload cards (show serial and classification)
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 8.4 Create ActionButtons component
    - Create `src/components/block/UnifiedNfcScanner/ActionButtons.tsx`
    - Display check-in/check-out buttons based on operation type
    - Disable buttons based on card state (checked in, status)
    - Support custom renderActions prop
    - Show initialization actions for empty cards
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [x] 8.5 Create RawDataInspector component
    - Create `src/components/block/UnifiedNfcScanner/RawDataInspector.tsx`
    - Display serial number, byte count, hex dump, NDEF record types
    - Make collapsible to avoid cluttering UI
    - _Requirements: 25.1, 25.2, 25.3, 25.4_

  - [x] 8.6 Create sub-components barrel export
    - Create `src/components/block/UnifiedNfcScanner/index.ts`
    - Export all sub-components
    - _Requirements: 8.5_

- [x] 9. Implement UnifiedNfcScanner Main Component
  - [x] 9.1 Create UnifiedNfcScanner component structure
    - Create `src/components/block/UnifiedNfcScanner.tsx`
    - Implement props interface with all configuration options
    - Set up useUnifiedNfc hook integration
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 9.2 Implement drawer display mode
    - Use Vaul drawer for modal behavior
    - Implement open/close state management via props
    - Handle autoCloseOnSuccess with configurable delay
    - _Requirements: 8.1, 8.3, 20.1, 20.2, 20.3_

  - [x] 9.3 Implement inline display mode
    - Render directly in parent container without overlay
    - Maintain consistent styling with drawer mode
    - _Requirements: 8.2, 8.4_

  - [x] 9.4 Implement phase-specific UI rendering
    - Render distinct visual states for each NfcPhase
    - Show classifying indicator during card type detection
    - Show validation loading indicator
    - Show writing warning animation
    - Show success/error indicators
    - _Requirements: 9.1, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [x] 9.5 Implement empty and invalid card handling
    - Display "Kartu Kosong" for empty cards with serial
    - Show "Inisialisasi Kartu" button when callback provided
    - Display "Kartu Tidak Dikenal" for foreign cards
    - Display "Format Kartu Rusak" for invalid format
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 9.6 Implement auto-scan capability
    - Start scanning on mount/open when autoScan enabled
    - Handle NFC not supported error
    - Support scanning without session grant when requireGrant false
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 9.7 Implement error handling UI
    - Display descriptive error messages in Indonesian
    - Show "Coba Lagi" button for recoverable errors
    - Show "Kartu Terdeteksi Rusak" for tamper detection
    - Show "Perbaiki Kartu" button when onFixCard provided
    - Implement onError callback
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 9.8 Implement error skipping
    - Show "Lewati" button when allowSkip enabled
    - Invoke onSkip callback and reset to idle
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 9.9 Implement cancel and reset operations
    - Show cancel button during active phases
    - Abort operation and reset to idle on cancel
    - Expose reset function for programmatic reset
    - _Requirements: 19.1, 19.2, 19.3_

  - [x] 9.10 Implement continuous scan mode
    - Auto-reset to scanning after success when enabled
    - Show countdown indicator before auto-reset
    - Allow manual reset before countdown completes
    - _Requirements: 24.1, 24.2, 24.3, 24.4_

  - [x] 9.11 Implement customizable labels
    - Accept labels prop for text customization
    - Provide DEFAULT_LABELS in Indonesian
    - Merge custom labels with defaults
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

  - [x] 9.12 Implement accessibility features
    - Add ARIA labels to all interactive elements
    - Support keyboard navigation
    - Announce state changes with ARIA live regions
    - Ensure sufficient color contrast
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

- [x] 10. Checkpoint - UI components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Create barrel exports and integration
  - [x] 11.1 Create NFC core barrel export
    - Create `src/core/nfc/index.ts`
    - Export GenericNfcLayer, CardClassifier, pipelineEngine functions, sessionValidator
    - Export all types
    - _Requirements: 3.1_

  - [x] 11.2 Update components barrel export
    - Update `src/components/block/index.ts` to export UnifiedNfcScanner
    - _Requirements: 8.1_

  - [ ]\* 11.3 Write integration tests for UnifiedNfcScanner
    - Test drawer mode open/close
    - Test inline mode rendering
    - Test full scan → classify → validate → ready flow
    - Test error → retry → success flow
    - Test custom labels
    - _Requirements: 8.1, 8.2, 9.1, 13.6_

- [x] 12. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation follows bottom-up approach: adapters → layers → hook → UI
- All labels default to Indonesian as per existing app localization
- Tasks 1–5 are complete: NFC adapters, GenericNfcLayer, CardClassifier, pipelineEngine, and sessionValidator are fully implemented
- The PayloadOperationLayer is implemented as functional modules (`pipelineEngine.ts` + `sessionValidator.ts`) rather than a single class

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["6.1"] },
    { "id": 1, "tasks": ["6.2", "6.3"] },
    { "id": 2, "tasks": ["6.4", "8.1", "8.2", "8.3", "8.4", "8.5"] },
    { "id": 3, "tasks": ["8.6", "9.1"] },
    { "id": 4, "tasks": ["9.2", "9.3", "9.4"] },
    { "id": 5, "tasks": ["9.5", "9.6", "9.7"] },
    { "id": 6, "tasks": ["9.8", "9.9", "9.10"] },
    { "id": 7, "tasks": ["9.11", "9.12"] },
    { "id": 8, "tasks": ["11.1", "11.2"] },
    { "id": 9, "tasks": ["11.3"] }
  ]
}
```
