# Requirements Document

## Introduction

This document specifies the requirements for replacing the relative `deltaTime` field in the on-card NFC log entry with an absolute Unix timestamp. The change eliminates the dependency on `session.startTime` for timestamp reconstruction, fixing the overflow problem for out-of-session operations (topup, admin reset) where `session.startTime = 0`. The 16-byte log entry constraint is preserved by reducing the chain hash from 6 bytes to 4 bytes. The card schema version is bumped from 3 to 4, and backward compatibility with v3 cards is dropped.

## Glossary

- **LogEntry**: The in-memory representation of a single transaction log entry stored on the NFC card
- **LogEntry_wire**: The 16-byte binary encoding of a LogEntry on the card
- **Payload_Engine**: The component responsible for encoding and decoding LogEntry objects to and from the binary wire format
- **Crypto_Engine**: The component responsible for computing chain hashes for tamper detection
- **State_Machine_Engine**: The component responsible for building log entries during card state transitions
- **Pipeline_Engine**: The component responsible for validating and recomputing chain hashes during read/write operations
- **Chain_Hash**: A 4-byte truncated SHA-256 hash linking each log entry to its predecessor for tamper detection
- **Empty_Sentinel**: A log entry whose hash field is all zeros, indicating an unwritten slot
- **Card_Schema_Version**: An integer identifying the binary layout version of the card data
- **nowSeconds**: The current wall-clock time in Unix seconds (uint32) passed to state transition functions

## Requirements

### Requirement 1: Absolute Timestamp in Log Entries

**User Story:** As a system operator, I want each log entry to contain an absolute Unix timestamp, so that transaction times can be reconstructed without depending on session state.

#### Acceptance Criteria

1. WHEN a state transition function (applyCheckin, applyCheckout, applyDebit, applyTopup, or applyResetState) creates a log entry, THE State_Machine_Engine SHALL set the `timestamp` field to the `nowSeconds` parameter value regardless of the current session state or `session.startTime` value
2. WHEN a log entry is created during an out-of-session operation (topup or admin reset with `session.startTime = 0`), THE State_Machine_Engine SHALL record `timestamp` equal to the `nowSeconds` parameter without applying any delta computation, uint16 clamping, or subtraction from `session.startTime`
3. THE LogEntry type SHALL contain a `timestamp` field of type uint32 (range 0 to 4,294,967,295) representing absolute Unix seconds, replacing the former `deltaTime` field of type uint16
4. IF `nowSeconds` equals 0 when a state transition function is invoked, THEN THE State_Machine_Engine SHALL use `Math.floor(Date.now() / 1000)` as the timestamp value
5. THE LogEntry type SHALL contain a `hash` field of exactly 4 bytes (reduced from the former 6 bytes), preserving the total log entry size at 16 bytes

### Requirement 2: 16-Byte Wire Format Preservation

**User Story:** As a system architect, I want the log entry binary size to remain exactly 16 bytes, so that the existing card memory layout and log area capacity are preserved.

#### Acceptance Criteria

1. THE LogEntry_wire format SHALL occupy exactly 16 bytes with the layout: timestamp (4 bytes, little-endian uint32) + amount (3 bytes, little-endian uint24) + balanceAfter (4 bytes, little-endian uint32) + flags (1 byte, uint8) + hash (4 bytes, raw)
2. THE Payload_Engine SHALL encode the `timestamp` field as a little-endian uint32 at byte offset 0 and SHALL decode a little-endian uint32 at byte offset 0 back to the `timestamp` field, such that decode(encode(entry)).timestamp equals the original value
3. THE Payload_Engine SHALL encode the `amount` field as a little-endian uint24 at byte offset 4 and SHALL decode a little-endian uint24 at byte offset 4 back to the `amount` field, such that decode(encode(entry)).amount equals the original value for values in the range 0 to 16,777,215
4. THE Payload_Engine SHALL encode the `balanceAfter` field as a little-endian uint32 at byte offset 7 and SHALL decode a little-endian uint32 at byte offset 7 back to the `balanceAfter` field, such that decode(encode(entry)).balanceAfter equals the original value
5. THE Payload_Engine SHALL encode the `flags` field as a uint8 at byte offset 11 and SHALL decode a uint8 at byte offset 11 back to the `flags` field, such that decode(encode(entry)).flags equals the original value
6. THE Payload_Engine SHALL encode the `hash` field as 4 raw bytes at byte offset 12 and SHALL decode 4 raw bytes at byte offset 12 back to the `hash` field, such that decode(encode(entry)).hash equals the original value
7. IF the 4 hash bytes at offset 12 through 15 of a log entry slot are all zero, THEN THE Payload_Engine SHALL treat that slot as empty and exclude it from the decoded log entries list
8. IF the `amount` value exceeds 16,777,215 during encoding, THEN THE Payload_Engine SHALL reject the entry with an error indicating the amount exceeds the uint24 maximum

### Requirement 3: Encode-Decode Roundtrip Integrity

**User Story:** As a developer, I want log entries to survive encoding and decoding without data loss, so that card reads always produce the same data that was written.

#### Acceptance Criteria

1. WHEN a valid LogEntry (timestamp 0–4,294,967,295, amount 0–16,777,215, balanceAfter 0–4,294,967,295, flags 0–255, hash exactly 4 bytes with at least one non-zero byte) is encoded to wire format and then decoded, THE Payload_Engine SHALL produce a LogEntry whose timestamp, amount, balanceAfter, flags, and hash bytes are each identical to the original
2. WHEN decoding a log entry, THE Payload_Engine SHALL read the `timestamp` as a little-endian uint32 from byte offset 0
3. WHEN decoding a log entry, THE Payload_Engine SHALL read the `amount` as a little-endian uint24 from byte offset 4
4. WHEN decoding a log entry, THE Payload_Engine SHALL read the `balanceAfter` as a little-endian uint32 from byte offset 7
5. WHEN decoding a log entry, THE Payload_Engine SHALL read the `flags` as a uint8 from byte offset 11
6. WHEN decoding a log entry, THE Payload_Engine SHALL read the `hash` as 4 raw bytes from byte offset 12
7. IF the 4 hash bytes at offset 12 of a log entry slot are all zero, THEN THE Payload_Engine SHALL treat that slot as empty and exclude it from the decoded log entries list

### Requirement 4: Chain Hash Computation

**User Story:** As a security engineer, I want the chain hash to incorporate all log entry fields including the absolute timestamp, so that any tampering with entry data is detectable.

#### Acceptance Criteria

1. THE Crypto_Engine SHALL compute the chain hash by hashing a 16-byte input buffer containing: timestamp (uint32 LE, bytes 0-3), amount (uint24 LE, bytes 4-6), balanceAfter (uint32 LE, bytes 7-10), flags (uint8, byte 11), and prevHash (4 bytes, bytes 12-15)
2. THE Crypto_Engine SHALL produce a chain hash of exactly 4 bytes by taking the first 4 bytes of the SHA-256 digest of the 16-byte input buffer
3. WHEN the same inputs are provided, THE Crypto_Engine SHALL produce the same 4-byte hash output (determinism)
4. WHEN any single input field is changed, THE Crypto_Engine SHALL produce a different hash output with probability at least 1 − 2^−32 (avalanche property of SHA-256 truncated to 32 bits)
5. IF the provided prevHash is shorter than 4 bytes, THEN THE Crypto_Engine SHALL right-pad it with zero bytes to exactly 4 bytes before placing it in the input buffer at bytes 12-15

### Requirement 5: Empty Sentinel Detection

**User Story:** As a developer, I want to reliably detect unwritten log slots, so that the system correctly identifies the boundary between written and empty entries.

#### Acceptance Criteria

1. WHEN the Payload_Engine decodes log entries and encounters an entry whose 4-byte hash field is all zeros ([0,0,0,0]), THE Payload_Engine SHALL stop reading at that position and exclude that entry and all subsequent entries from the decoded log entries list
2. WHEN creating a new log entry before chain hash computation, THE State_Machine_Engine SHALL initialize the hash field to a 4-byte zero array as a placeholder
3. WHEN the Payload_Engine encodes a payload with fewer than 5 log entries, THE Payload_Engine SHALL ensure all byte positions in unused log entry slots remain as zeros so that the sentinel pattern is preserved for subsequent reads

### Requirement 6: Schema Version Gate

**User Story:** As a system operator, I want the system to reject cards with outdated schema versions, so that only cards with the correct binary layout are processed.

#### Acceptance Criteria

1. THE system SHALL define CARD_SCHEMA_VERSION as the constant value 4
2. IF a decoded card payload has `header.version` less than 4, THEN THE Pipeline_Engine SHALL reject the card with an error indicating schema version mismatch and SHALL NOT proceed with further validation or state-machine operations on that payload
3. IF a decoded card payload has `header.version` greater than 4, THEN THE Pipeline_Engine SHALL reject the card with an error indicating an unrecognized schema version
4. WHEN encoding a card payload, THE Payload_Engine SHALL write the value of CARD_SCHEMA_VERSION (4) to the `header.version` field

### Requirement 7: Chain Hash Validation in Pipeline

**User Story:** As a system operator, I want the pipeline to validate chain hashes on every card read, so that tampered or corrupted log entries are detected before processing.

#### Acceptance Criteria

1. WHEN validating a card payload, THE Pipeline_Engine SHALL iterate through all log entries whose hash bytes are not all zeros, recompute the expected chain hash for each entry using the previous entry's hash (or a zero-filled byte array of the chain hash size for the first entry), and compare the recomputed hash against the stored hash using a constant-time comparison across all hash bytes
2. IF a recomputed chain hash does not match the stored hash for any log entry, THEN THE Pipeline_Engine SHALL reject the card payload as invalid, flag the result as tampered, and prevent further processing of that payload
3. WHEN writing a card payload, THE Pipeline_Engine SHALL recompute the chain hash for every log entry in sequence (each entry's hash derived from its fields and the preceding entry's hash) and update the stored hashes before encoding the payload to wire format
4. WHEN writing a card payload with at least one log entry, THE Pipeline_Engine SHALL set the trailer rootHash to the chain hash of the last log entry

### Requirement 8: Amount Field Range

**User Story:** As a product owner, I want the amount field to support values up to 16,777,215, so that all valid IDR transaction amounts can be recorded.

#### Acceptance Criteria

1. THE LogEntry type SHALL represent the `amount` field as a uint24 supporting values in the range 0 to 16,777,215 (0x000000 to 0xFFFFFF)
2. WHEN encoding the amount field, THE Payload_Engine SHALL write the value as 3 bytes in little-endian order at byte offset 4 within the 16-byte log entry
3. WHEN decoding the amount field, THE Payload_Engine SHALL read 3 bytes in little-endian order from byte offset 4 within the 16-byte log entry and reconstruct the uint24 value
4. IF the amount value provided to the encoder exceeds 16,777,215, THEN THE Payload_Engine SHALL reject the value with an error indicating the amount is out of uint24 range
5. WHEN encoding and then decoding any amount value in the range 0 to 16,777,215, THE Payload_Engine SHALL produce a decoded value identical to the original input value

### Requirement 9: Timestamp Zero Fallback

**User Story:** As a developer, I want the system to handle the edge case where `nowSeconds` is zero, so that programming errors do not produce silently incorrect log entries.

#### Acceptance Criteria

1. IF `nowSeconds` equals zero is passed to any state transition apply function (applyCheckin, applyCheckout, applyDebit, applyTopup, applyResetState), THEN THE State_Machine_Engine SHALL substitute `Math.floor(Date.now() / 1000)` as the effective timestamp value for all fields that would use `nowSeconds` (log entry timestamp, `wallet.lastTimestamp`, and session time fields)
2. IF `nowSeconds` equals zero is passed to a state transition apply function and the fallback is used, THEN THE State_Machine_Engine SHALL log a warning message indicating that a zero timestamp was replaced with the current wall-clock time
3. IF `nowSeconds` is a valid non-zero value (1 to 4,294,967,295), THEN THE State_Machine_Engine SHALL use the provided `nowSeconds` value without modification
