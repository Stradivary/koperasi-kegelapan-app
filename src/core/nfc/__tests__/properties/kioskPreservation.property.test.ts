/**
 * Preservation Property-Based Tests
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 *
 * Property 2: Preservation - Normal Operation Behavior for Valid Cards
 *
 * These tests capture the baseline behavior of the UNFIXED code for valid
 * (non-bug-condition) inputs. They MUST PASS on unfixed code to confirm
 * the behavior we want to preserve after the fix.
 *
 * Observation-first methodology:
 * - Valid same-tenant cards with balance >= 10,000 proceed through check-in
 * - Valid cards at checkout with balance >= fee calculate and deduct correctly
 * - Single normal-speed NFC taps process through full state machine cycle
 * - ACTIVE cards with valid tenant binding display member details correctly
 * - Blocked cards are rejected with appropriate blocked reason
 * - Valid session grants allow NFC write operations
 * - Debit transactions with sufficient balance deduct correctly
 * - Dual-buffer write scheme uses active/inactive pointer correctly
 *
 * @module core/nfc/__tests__/properties/kioskPreservation.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { fnv32a } from "../../../payload/tenantBind";
import {
  validateTransition,
  isWriteEligible,
  applyCheckin,
  applyCheckout,
  applyDebit,
  PARKING_RATE_PER_HOUR,
} from "../../../state-machine/engine";
import {
  decodePayload,
  encodePayload,
  encodePayloadWire,
  getActiveBufferOffset,
  getInactiveBufferOffset,
} from "../../../payload/engine";
import { nfcReducer, initialNfcState } from "../../stateMachine";
import type { NfcState } from "../../stateMachine";
import {
  MAGIC,
  CARD_SCHEMA_VERSION,
  CARD_SIZE,
  WIRE_SIZE,
  BUFFER_SIZE,
  CardState,
  CardStatus,
  TxType,
  type CardPayload,
  type SessionGrant,
} from "../../../payload/types";

// ============================================================================
// Constants & Helpers
// ============================================================================

const CURRENT_TENANT = "tenant-alpha";
const NOW_SECONDS = Math.floor(Date.now() / 1000);

function createMockSessionGrant(
  tenantId: string = CURRENT_TENANT,
  overrides: Partial<SessionGrant> = {},
): SessionGrant {
  return {
    keyVersion: 1,
    sessionKey: new Uint8Array(32).fill(0xab),
    expiresAt: NOW_SECONDS + 3600,
    allowedOps: ["debit", "checkin", "checkout", "topup"],
    signature: new Uint8Array(64),
    tenantId,
    accountId: "account-1",
    deviceId: "device-1",
    ...overrides,
  };
}

function createValidPayload(overrides: {
  balance?: number;
  status?: number;
  state?: number;
  name?: string;
  startTime?: number;
  activePtr?: number;
  counter?: bigint;
}): CardPayload {
  return {
    header: {
      magic: MAGIC,
      version: CARD_SCHEMA_VERSION,
      type: 0,
      cardId: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]),
      tenantBind: fnv32a(CURRENT_TENANT),
    },
    identity: {
      name: overrides.name ?? "Test Member",
      userId: "GJWt7u3g",
      gender: 1,
      status: overrides.status ?? CardStatus.ACTIVE,
      createdAt: NOW_SECONDS - 86400,
    },
    wallet: {
      balance: overrides.balance ?? 50_000,
      lastBalance: 50_000,
      counter: overrides.counter ?? 10n,
      lastTimestamp: NOW_SECONDS - 3600,
      state: overrides.state ?? CardState.IDLE,
      flags: 0,
    },
    session: {
      startTime: overrides.startTime ?? NOW_SECONDS - 3600,
      endTime: 0,
      terminalId: 1,
    },
    logEntries: [],
    trailer: {
      expiresAt: NOW_SECONDS + 86400,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: Number((overrides.counter ?? 10n) & 0xffffffffn),
      hmac: new Uint8Array(8),
      activePtr: overrides.activePtr ?? 0,
    },
  };
}

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/** Generates a balance >= 10,000 (valid for check-in) */
const arbSufficientCheckinBalance = fc.integer({ min: 10_000, max: 500_000 });

/** Generates hours parked (1-12) */
const arbHoursParked = fc.integer({ min: 1, max: 12 });

/** Generates a valid member name (non-empty, ASCII for simplicity) */
const arbMemberName = fc
  .string({ minLength: 1, maxLength: 31 })
  .filter((s) => s.length > 0 && !s.includes("\0"));

/** Generates a valid activePtr (0 or 1) */
const arbActivePtr = fc.integer({ min: 0, max: 1 });

/** Generates a valid counter value */
const arbCounter = fc.bigInt({ min: 1n, max: 1000000n });

/** Generates a blocked card status */
const arbBlockedStatus = fc.constantFrom(
  CardStatus.BLOCKED_TAMPER,
  CardStatus.BLOCKED_FRAUD,
  CardStatus.BLOCKED_EXPIRED,
  CardStatus.BLOCKED_ADMIN,
);

// ============================================================================
// Property 3.1: Valid Same-Tenant Cards with Balance >= 10,000 Check-in Normally
// ============================================================================

describe("Preservation 3.1: Valid same-tenant cards with balance >= 10,000 check-in normally", () => {
  it("for all valid same-tenant cards with balance >= 10,000, check-in proceeds normally and writes updated state", () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * For any valid same-tenant card with balance >= 10,000 at check-in,
     * the system proceeds through the full state machine cycle and writes
     * the updated state (CHECKED_IN) to the card.
     */
    fc.assert(
      fc.property(
        arbSufficientCheckinBalance,
        arbMemberName,
        arbCounter,
        (balance, name, counter) => {
          const payload = createValidPayload({
            balance,
            name,
            state: CardState.IDLE,
            counter,
          });

          // 1. Validate transition: IDLE -> CHECKED_IN via gate_checkin
          const transition = validateTransition(payload, "gate_checkin", NOW_SECONDS);
          expect(transition.valid).toBe(true);
          expect(transition.nextState).toBe(CardState.CHECKED_IN);

          // 2. Apply check-in
          const terminalId = 1;
          const result = applyCheckin(payload, terminalId, NOW_SECONDS);

          // 3. Verify the result preserves correct behavior
          expect(result.wallet.state).toBe(CardState.CHECKED_IN);
          expect(result.wallet.balance).toBe(balance); // Balance unchanged on check-in
          expect(result.wallet.counter).toBe(counter + 1n);
          expect(result.wallet.lastTimestamp).toBe(NOW_SECONDS);
          expect(result.session.startTime).toBe(NOW_SECONDS);
          expect(result.session.terminalId).toBe(terminalId);
          expect(result.identity.name).toBe(name);

          // 4. Verify log entry is added with CHECKIN type
          const lastLog = result.logEntries.at(-1);
          expect(lastLog?.flags).toBe(TxType.CHECKIN);
          expect(lastLog?.amount).toBe(0);
          expect(lastLog?.balanceAfter).toBe(balance);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ============================================================================
// Property 3.2: Valid Cards at Checkout with Balance >= Fee
// ============================================================================

describe("Preservation 3.2: Valid cards with balance >= fee checkout normally", () => {
  it("for all valid cards with balance >= fee, checkout calculates fee, deducts, and writes", () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * For any valid card at checkout with balance >= calculated fee,
     * the system calculates the fee based on parking duration, deducts it,
     * and writes the checkout state.
     */
    fc.assert(
      fc.property(
        arbHoursParked,
        fc.integer({ min: 10_000, max: 500_000 }),
        arbCounter,
        (hours, balance, counter) => {
          const fee = hours * PARKING_RATE_PER_HOUR;
          // Only test cases where balance >= fee (preservation condition)
          if (balance < fee) return;

          const startTime = NOW_SECONDS - hours * 3600;
          const payload = createValidPayload({
            balance,
            state: CardState.CHECKED_IN,
            startTime,
            counter,
          });

          // 1. Validate transition: CHECKED_IN -> CHECKED_OUT via gate_checkout
          const transition = validateTransition(payload, "gate_checkout", NOW_SECONDS);
          expect(transition.valid).toBe(true);
          expect(transition.nextState).toBe(CardState.CHECKED_OUT);

          // 2. Apply checkout
          const result = applyCheckout(payload, NOW_SECONDS);

          // 3. Verify fee calculation and deduction
          const expectedFee = Math.ceil((NOW_SECONDS - startTime) / 3600) * PARKING_RATE_PER_HOUR;
          const actualFee = Math.min(expectedFee, balance);
          expect(result.wallet.balance).toBe(balance - actualFee);
          expect(result.wallet.lastBalance).toBe(balance);
          expect(result.wallet.state).toBe(CardState.CHECKED_OUT);
          expect(result.wallet.counter).toBe(counter + 1n);
          expect(result.session.endTime).toBe(NOW_SECONDS);

          // 4. Verify log entry with CHECKOUT type
          const lastLog = result.logEntries.at(-1);
          expect(lastLog?.flags).toBe(TxType.CHECKOUT);
          expect(lastLog?.amount).toBe(actualFee);
          expect(lastLog?.balanceAfter).toBe(balance - actualFee);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ============================================================================
// Property 3.3: Single Normal-Speed NFC Tap State Machine Transitions
// ============================================================================

describe("Preservation 3.3: Single-tap scan events produce identical state machine transitions", () => {
  it("for all single-tap scan events at normal speed, state machine transitions are identical", () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * For any single NFC tap at normal speed, the state machine transitions
     * through: idle → scanning → classifying → validating → ready → writing → success
     */
    fc.assert(
      fc.property(arbMemberName, arbSufficientCheckinBalance, (name, balance) => {
        // Simulate the full state machine cycle for a single tap
        let state: NfcState = { ...initialNfcState };

        // idle → scanning
        state = nfcReducer(state, { type: "START_SCAN" });
        expect(state.phase).toBe("scanning");

        // scanning → classifying
        state = nfcReducer(state, {
          type: "RAW_SCAN_COMPLETE",
          result: {
            rawBytes: new Uint8Array(WIRE_SIZE),
            serialNumber: "ABC123",
            records: [{ recordType: "unknown", data: new Uint8Array(WIRE_SIZE) }],
            classification: "valid_payload",
            metadata: { recordCount: 1, totalBytes: WIRE_SIZE, hasNdef: true },
          },
        });
        expect(state.phase).toBe("classifying");

        // classifying → validating (for valid_payload cards)
        state = nfcReducer(state, {
          type: "CLASSIFICATION_COMPLETE",
          classification: "valid_payload",
        });
        expect(state.phase).toBe("validating");

        // validating → ready
        const payload = createValidPayload({ name, balance });
        state = nfcReducer(state, {
          type: "VALIDATION_COMPLETE",
          payload,
        });
        expect(state.phase).toBe("ready");
        expect(state.payload).toBe(payload);

        // ready → writing
        state = nfcReducer(state, { type: "START_WRITE" });
        expect(state.phase).toBe("writing");

        // writing → success
        const updatedPayload = createValidPayload({
          name,
          balance,
          state: CardState.CHECKED_IN,
        });
        state = nfcReducer(state, {
          type: "WRITE_COMPLETE",
          payload: updatedPayload,
        });
        expect(state.phase).toBe("success");
        expect(state.payload).toBe(updatedPayload);
      }),
      { numRuns: 30 },
    );
  });

  it("state machine rejects invalid transitions and preserves current state", () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * Invalid actions at wrong phases are ignored (state unchanged).
     */
    fc.assert(
      fc.property(
        fc.constantFrom(
          "idle" as const,
          "scanning" as const,
          "classifying" as const,
          "validating" as const,
          "ready" as const,
          "writing" as const,
          "write_pending_retry" as const,
          "success" as const,
          "error" as const,
        ),
        (phase) => {
          const state: NfcState = { ...initialNfcState, phase };

          // START_SCAN only works from idle or error
          if (phase !== "idle" && phase !== "error") {
            const next = nfcReducer(state, { type: "START_SCAN" });
            expect(next.phase).toBe(phase); // unchanged
          }

          // RAW_SCAN_COMPLETE only works from scanning
          if (phase !== "scanning") {
            const next = nfcReducer(state, {
              type: "RAW_SCAN_COMPLETE",
              result: {
                rawBytes: new Uint8Array(WIRE_SIZE),
                serialNumber: "X",
                records: [{ recordType: "unknown", data: new Uint8Array(WIRE_SIZE) }],
                classification: "valid_payload",
                metadata: { recordCount: 1, totalBytes: WIRE_SIZE, hasNdef: true },
              },
            });
            expect(next.phase).toBe(phase); // unchanged
          }

          // START_WRITE only works from ready or write_pending_retry
          if (phase !== "ready" && phase !== "write_pending_retry") {
            const next = nfcReducer(state, { type: "START_WRITE" });
            expect(next.phase).toBe(phase); // unchanged
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ============================================================================
// Property 3.4: ACTIVE Cards Display Member Details Correctly
// ============================================================================

describe("Preservation 3.4: Cards with ACTIVE status and valid tenant binding display member details correctly", () => {
  it("for all cards with ACTIVE status and valid tenant binding, member details display correctly", () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * For any card with ACTIVE status and valid tenant binding,
     * the system displays member name, balance, and status correctly.
     * This is verified by checking that the payload decode preserves
     * identity and wallet data through encode/decode roundtrip.
     */
    fc.assert(
      fc.property(
        arbMemberName,
        arbSufficientCheckinBalance,
        arbCounter,
        (name, balance, counter) => {
          const payload = createValidPayload({
            name,
            balance,
            status: CardStatus.ACTIVE,
            counter,
          });

          // Encode and decode to verify data integrity (simulates NFC read)
          const encoded = encodePayloadWire(payload);
          const decoded = decodePayload(encoded);

          // Member details are preserved correctly
          expect(decoded.identity.name).toBe(name);
          expect(decoded.identity.status).toBe(CardStatus.ACTIVE);
          expect(decoded.wallet.balance).toBe(balance);
          expect(decoded.header.tenantBind).toBe(fnv32a(CURRENT_TENANT));

          // Verify the card is recognized as valid for the current tenant
          expect(decoded.header.magic).toBe(MAGIC);
          expect(decoded.header.version).toBe(CARD_SCHEMA_VERSION);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ============================================================================
// Property 3.5: Blocked Cards Rejected with Appropriate Reason
// ============================================================================

describe("Preservation 3.5: Blocked cards are rejected with appropriate blocked reason", () => {
  it("for all blocked cards, rejection messages match expected blocked reason", () => {
    /**
     * **Validates: Requirements 3.5**
     *
     * For any card with a blocked status (BLOCKED_TAMPER, BLOCKED_FRAUD,
     * BLOCKED_EXPIRED, BLOCKED_ADMIN), the system rejects the operation
     * with the appropriate blocked reason.
     */
    fc.assert(
      fc.property(
        arbBlockedStatus,
        arbSufficientCheckinBalance,
        fc.constantFrom(
          "gate_checkin" as const,
          "gate_checkout" as const,
          "terminal_start" as const,
        ),
        (blockedStatus, balance, trigger) => {
          const payload = createValidPayload({
            balance,
            status: blockedStatus,
            state: trigger === "gate_checkout" ? CardState.CHECKED_IN : CardState.IDLE,
          });

          // Validate transition should reject blocked cards
          const transition = validateTransition(payload, trigger, NOW_SECONDS);
          expect(transition.valid).toBe(false);
          expect(transition.reason).toContain("not active");

          // isWriteEligible should also reject blocked cards
          const grant = createMockSessionGrant();
          const eligibility = isWriteEligible(payload, grant, "debit", NOW_SECONDS);
          expect(eligibility.eligible).toBe(false);
          expect(eligibility.reason).toContain("blocked");
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ============================================================================
// Property 3.6: Valid Session Grants Allow NFC Write Operations
// ============================================================================

describe("Preservation 3.6: Valid session grants allow NFC write operations", () => {
  it("for all valid session grants, NFC write operations are allowed", () => {
    /**
     * **Validates: Requirements 3.6**
     *
     * For any valid (non-expired) session grant with the required operation
     * in allowedOps, the system allows NFC write operations.
     */
    fc.assert(
      fc.property(
        fc.constantFrom("debit", "checkin", "checkout", "topup"),
        arbSufficientCheckinBalance,
        (operation, balance) => {
          const payload = createValidPayload({
            balance,
            status: CardStatus.ACTIVE,
            state: CardState.CHECKED_IN,
          });

          const grant = createMockSessionGrant(CURRENT_TENANT, {
            expiresAt: NOW_SECONDS + 3600, // valid for 1 hour
            allowedOps: ["debit", "checkin", "checkout", "topup"],
          });

          const eligibility = isWriteEligible(payload, grant, operation, NOW_SECONDS);
          expect(eligibility.eligible).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("expired session grants are rejected", () => {
    /**
     * **Validates: Requirements 3.6**
     *
     * Expired session grants are correctly rejected.
     */
    fc.assert(
      fc.property(
        fc.constantFrom("debit", "checkin", "checkout", "topup"),
        fc.integer({ min: 1, max: 86400 }), // seconds expired
        (operation, secondsExpired) => {
          const payload = createValidPayload({
            balance: 50_000,
            status: CardStatus.ACTIVE,
            state: CardState.CHECKED_IN,
          });

          const grant = createMockSessionGrant(CURRENT_TENANT, {
            expiresAt: NOW_SECONDS - secondsExpired, // expired
            allowedOps: ["debit", "checkin", "checkout", "topup"],
          });

          const eligibility = isWriteEligible(payload, grant, operation, NOW_SECONDS);
          expect(eligibility.eligible).toBe(false);
          expect(eligibility.reason).toContain("expired");
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ============================================================================
// Property 3.7: Debit Transactions with Sufficient Balance Deduct Correctly
// ============================================================================

describe("Preservation 3.7: Debit transactions with sufficient balance deduct correctly", () => {
  it("for all debit transactions with sufficient balance, amount is deducted correctly", () => {
    /**
     * **Validates: Requirements 3.7**
     *
     * For any debit transaction at the kiosk with sufficient balance,
     * the system deducts the amount and the remaining balance is correct.
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000, max: 500_000 }), // balance
        fc.integer({ min: 1, max: 100_000 }), // amount
        arbCounter,
        (balance, amount, counter) => {
          // Only test cases where balance >= amount (sufficient balance)
          if (amount > balance) return;

          const payload = createValidPayload({
            balance,
            state: CardState.STATION_OPERATION,
            counter,
          });

          const result = applyDebit(payload, amount, NOW_SECONDS);

          // Verify deduction
          expect(result.wallet.balance).toBe(balance - amount);
          expect(result.wallet.lastBalance).toBe(balance);
          expect(result.wallet.counter).toBe(counter + 1n);
          expect(result.wallet.lastTimestamp).toBe(NOW_SECONDS);

          // Verify log entry
          const lastLog = result.logEntries.at(-1);
          expect(lastLog?.amount).toBe(amount);
          expect(lastLog?.balanceAfter).toBe(balance - amount);
          expect(lastLog?.flags).toBe(TxType.DEBIT);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ============================================================================
// Property 3.8: Dual-Buffer Write Scheme Uses Active/Inactive Pointer Correctly
// ============================================================================

describe("Preservation 3.8: Dual-buffer write scheme uses active/inactive pointer correctly", () => {
  it("for all payloads, encode uses the correct buffer based on activePtr", () => {
    /**
     * **Validates: Requirements 3.8**
     *
     * The dual-buffer write scheme continues to use the active/inactive
     * pointer correctly. When activePtr=0, Buffer A is active; when
     * activePtr=1, Buffer B is active.
     */
    fc.assert(
      fc.property(
        arbActivePtr,
        arbMemberName,
        arbSufficientCheckinBalance,
        arbCounter,
        (activePtr, name, balance, counter) => {
          const payload = createValidPayload({
            name,
            balance,
            activePtr,
            counter,
          });

          // Encode to full card format
          const encoded = encodePayload(payload);
          expect(encoded.length).toBe(CARD_SIZE);

          // Verify the active buffer offset is correct
          const activeOffset = getActiveBufferOffset(activePtr);
          const inactiveOffset = getInactiveBufferOffset(activePtr);

          expect(activeOffset).toBe(activePtr === 0 ? 0 : BUFFER_SIZE);
          expect(inactiveOffset).toBe(activePtr === 0 ? BUFFER_SIZE : 0);

          // Decode from the full format should read the active buffer
          const decoded = decodePayload(encoded);
          expect(decoded.header.magic).toBe(MAGIC);
          expect(decoded.identity.name).toBe(name);
          expect(decoded.wallet.balance).toBe(balance);
          expect(decoded.trailer.activePtr).toBe(activePtr);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("wire format always uses activePtr=0 for compact writes", () => {
    /**
     * **Validates: Requirements 3.8**
     *
     * The wire format (compact NFC write) always sets activePtr=0
     * since it only contains one buffer.
     */
    fc.assert(
      fc.property(
        arbActivePtr,
        arbMemberName,
        arbSufficientCheckinBalance,
        (originalActivePtr, name, balance) => {
          const payload = createValidPayload({
            name,
            balance,
            activePtr: originalActivePtr,
          });

          // Wire format should always produce WIRE_SIZE bytes
          const wire = encodePayloadWire(payload);
          expect(wire.length).toBe(WIRE_SIZE);

          // Decode wire format
          const decoded = decodePayload(wire);
          expect(decoded.header.magic).toBe(MAGIC);
          expect(decoded.identity.name).toBe(name);
          expect(decoded.wallet.balance).toBe(balance);
          // Wire format always uses activePtr=0
          expect(decoded.trailer.activePtr).toBe(0);
        },
      ),
      { numRuns: 30 },
    );
  });
});
