# Implementation Plan: Log Entry Absolute Timestamp

## Overview

Replace `deltaTime` (uint16, 2 bytes) with an absolute Unix timestamp (`timestamp`, uint32, 4 bytes) in the NFC log entry. Reduce chain hash from 6 to 4 bytes to maintain the 16-byte entry size. Bump schema version from 3 to 4 with no backward compatibility.

## Tasks

- [x] 1. Update LogEntry type definitions and constants
  - [x] 1.1 Update `src/core/payload/types.ts` with new LogEntry interface and constants
    - Change `CARD_SCHEMA_VERSION` from 3 to 4
    - Add `LOG_HASH_SIZE = 4` constant
    - Replace `deltaTime: number` with `timestamp: number` in `LogEntry` interface
    - Update `hash` field comment to indicate 4 bytes (truncated SHA-256)
    - _Requirements: 1.3, 1.5, 6.1_

- [x] 2. Update Payload Engine encode/decode
  - [x] 2.1 Update `src/core/payload/engine.ts` log entry encoding to new v4 layout
    - Encode `timestamp` as uint32 LE at offset 0 (4 bytes)
    - Encode `amount` as uint24 LE at offset 4 (3 bytes)
    - Encode `balanceAfter` as uint32 LE at offset 7 (4 bytes)
    - Encode `flags` as uint8 at offset 11 (1 byte)
    - Encode `hash` as 4 raw bytes at offset 12
    - Add validation: reject if `amount > 0xFFFFFF` with error
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 8.2, 8.4_

  - [x] 2.2 Update `src/core/payload/engine.ts` log entry decoding to new v4 layout
    - Decode `timestamp` as uint32 LE from offset 0
    - Decode `amount` as uint24 LE from offset 4
    - Decode `balanceAfter` as uint32 LE from offset 7
    - Decode `flags` as uint8 from offset 11
    - Decode `hash` as 4 raw bytes from offset 12
    - Update empty sentinel detection: check bytes 12-15 for all zeros (4-byte hash)
    - _Requirements: 2.1, 2.7, 3.2, 3.3, 3.4, 3.5, 3.6, 5.1_

  - [ ]\* 2.3 Write property test for encode-decode roundtrip
    - **Property 3: Encode-decode roundtrip**
    - Generate random valid LogEntry values (timestamp uint32, amount uint24, balanceAfter uint32, flags uint8, hash 4 bytes non-zero)
    - Assert `decode(encode(entry))` equals original entry for all fields
    - **Validates: Requirements 3.1, 2.2, 2.3, 2.4, 2.5, 2.6**

  - [ ]\* 2.4 Write property test for layout size invariant
    - **Property 2: Layout size invariant**
    - For any valid LogEntry, encoding produces exactly 16 bytes
    - **Validates: Requirements 2.1**

  - [ ]\* 2.5 Write property test for empty sentinel preservation
    - **Property 6: Empty sentinel preservation**
    - For any log entry bytes where hash field (bytes 12-15) is all zeros, decoder treats entry as empty
    - **Validates: Requirements 5.1**

- [x] 3. Update Crypto Engine chain hash computation
  - [x] 3.1 Update `computeChainHash` in `src/core/crypto/engine.ts` for v4 layout
    - Change first parameter from `deltaTime: number` (uint16) to `timestamp: number` (uint32)
    - Change `prevHash` parameter to expect 4 bytes (was 6)
    - Pack 16-byte input buffer: timestamp uint32 LE (0-3), amount uint24 LE (4-6), balanceAfter uint32 LE (7-10), flags uint8 (11), prevHash 4 bytes (12-15)
    - Truncate SHA-256 output to 4 bytes (was 6)
    - Right-pad prevHash with zeros if shorter than 4 bytes
    - _Requirements: 4.1, 4.2, 4.5_

  - [ ]\* 3.2 Write property test for chain hash determinism
    - **Property 4: Chain hash determinism**
    - For any valid inputs, calling `computeChainHash` twice with identical inputs produces the same 4-byte output
    - **Validates: Requirements 4.2, 4.3**

  - [ ]\* 3.3 Write property test for chain hash sensitivity
    - **Property 5: Chain hash sensitivity**
    - For any valid inputs, changing any single input field produces a different hash output
    - **Validates: Requirements 4.4**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Update State Machine Engine
  - [x] 5.1 Update `src/core/state-machine/engine.ts` to use absolute timestamp
    - Replace all `deltaTime` references with `timestamp: nowSeconds` in `applyCheckin`, `applyCheckout`, `applyDebit`, `applyTopup`, `applyResetState`
    - Remove `Math.min(nowSeconds - sessionStart, 0xFFFF)` clamping logic in `applyDebit` and `applyCheckout`
    - Change `hash: new Uint8Array(6)` to `hash: new Uint8Array(4)` in all apply functions
    - Add timestamp zero fallback: if `nowSeconds === 0`, use `Math.floor(Date.now() / 1000)` and log a warning
    - Update `buildLogEntry` type to use `timestamp` instead of `deltaTime`
    - _Requirements: 1.1, 1.2, 1.4, 9.1, 9.2, 9.3_

  - [ ]\* 5.2 Write property test for timestamp independence
    - **Property 1: Timestamp independence**
    - For any operation type and any card state, the resulting log entry has `timestamp === nowSeconds`
    - **Validates: Requirements 1.1, 1.2**

  - [ ]\* 5.3 Write unit tests for timestamp zero fallback
    - Test that `nowSeconds === 0` triggers `Math.floor(Date.now() / 1000)` substitution
    - Test that non-zero `nowSeconds` is used without modification
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 6. Update Pipeline Engine
  - [x] 6.1 Update `validateChainHash` in `src/core/nfc/pipelineEngine.ts` for 4-byte hashes
    - Change `prevHash` initialization from `new Uint8Array(6)` to `new Uint8Array(4)`
    - Update constant-time comparison loop from 6 to 4 bytes
    - Pass `entry.timestamp` instead of `entry.deltaTime` to `computeChainHash`
    - _Requirements: 7.1, 7.2_

  - [x] 6.2 Update `recomputeChainHashes` in `src/core/nfc/pipelineEngine.ts` for 4-byte hashes
    - Change `prevHash` initialization from `new Uint8Array(6)` to `new Uint8Array(4)`
    - Pass `entry.timestamp` instead of `entry.deltaTime` to `computeChainHash`
    - _Requirements: 7.3_

  - [x] 6.3 Update `prepareWrite` rootHash handling in `src/core/nfc/pipelineEngine.ts`
    - Update fallback rootHash from `new Uint8Array(6)` to remain 6 bytes (trailer rootHash is still 6 bytes per design)
    - Ensure last log entry's 4-byte chain hash is zero-padded to 6 bytes for rootHash in trailer
    - _Requirements: 7.4_

  - [x] 6.4 Add schema version gate in `src/core/nfc/pipelineEngine.ts`
    - In `validateCard`, add check: if `payload.header.version < 4`, reject with "Schema version mismatch" error
    - If `payload.header.version > 4`, reject with "Unrecognized schema version" error
    - _Requirements: 6.2, 6.3_

  - [ ]\* 6.5 Write property test for chain validation detects corruption
    - **Property 8: Chain validation detects corruption**
    - For any valid log entry chain, corrupting any single entry's hash causes chain validation to report failure
    - **Validates: Requirements 7.1, 7.2**

  - [ ]\* 6.6 Write property test for schema version rejection
    - **Property 7: Schema version rejection**
    - For any card payload with `header.version < 4`, pipeline rejects with schema version mismatch error
    - **Validates: Requirements 6.1, 6.2**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Integration wiring and test fixture updates
  - [x] 8.1 Update existing test fixtures and mocks across the codebase
    - Replace all `new Uint8Array(6)` hash references with `new Uint8Array(4)` in test files
    - Replace `deltaTime` with `timestamp` in all test LogEntry objects
    - Update mock `computeChainHash` returns to 4-byte arrays
    - Update any hardcoded binary payloads to match v4 layout
    - _Requirements: 2.1, 3.1_

  - [x] 8.2 Update `src/core/payload/engine.ts` schema version encoding
    - Ensure `encodeBuffer` writes `CARD_SCHEMA_VERSION` (4) to `header.version` field
    - _Requirements: 6.4_

  - [ ]\* 8.3 Write integration test for full pipeline roundtrip
    - Build payload → apply operation → recompute hashes → encode → decode → validate chain
    - Verify topup outside session produces correct absolute timestamp
    - Verify chain hash validation passes for valid entries and fails for corrupted entries
    - _Requirements: 1.1, 1.2, 7.1, 7.3_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The trailer `rootHash` remains 6 bytes — only log entry chain hashes are reduced to 4 bytes
- All existing tests referencing `deltaTime` or 6-byte hashes must be updated
- `fast-check` is already available in the project for property-based tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "3.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "2.5", "3.2", "3.3"] },
    { "id": 3, "tasks": ["5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.1", "6.2", "6.3", "6.4"] },
    { "id": 5, "tasks": ["6.5", "6.6"] },
    { "id": 6, "tasks": ["8.1", "8.2"] },
    { "id": 7, "tasks": ["8.3"] }
  ]
}
```
