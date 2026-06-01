/**
 * Property-Based Tests for evaluatePrintEligibility Behavioral Equivalence
 *
 * **Validates: Requirements 6.6, 6.8**
 *
 * Property 6: evaluatePrintEligibility behavioral equivalence
 *
 * For any valid (cardId, options, tenantId) triple and for any card database state
 * (including the "card not found" and "IndexedDB error" cases), calling the refactored
 * evaluatePrintEligibility with a mock CardRepository shall produce an identical
 * PrintEligibility to what the original implementation would produce.
 *
 * @module __tests__/core/validation/evaluatePrintEligibility-equivalence.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  evaluatePrintEligibility,
  evaluatePrintEligibilitySync,
  type PrintEligibility,
  type PrintOptions,
} from "#/core/validation/printButtonValidator";
import type { CardRepository } from "#/core/interfaces/CardRepository";
import type { CardRecord } from "#/core/interfaces/types";

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generates a valid hex character.
 */
const hexChar: fc.Arbitrary<string> = fc.constantFrom(..."0123456789abcdef".split(""));

/**
 * Generates a hex string of a given length range.
 */
function hexString(minLength: number, maxLength: number): fc.Arbitrary<string> {
  return fc
    .integer({ min: minLength, max: maxLength })
    .chain((len) =>
      fc.array(hexChar, { minLength: len, maxLength: len }).map((chars) => chars.join("")),
    );
}

/**
 * Generates a valid hex string card ID (like NFC serial numbers).
 */
const arbitraryCardId: fc.Arbitrary<string> = hexString(8, 14);

/**
 * Generates a non-empty tenant ID string.
 */
const arbitraryTenantId: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 50 });

/**
 * Generates PrintOptions with a boolean withMember flag.
 */
const arbitraryPrintOptions: fc.Arbitrary<PrintOptions> = fc.record({
  withMember: fc.boolean(),
});

/**
 * Generates a valid CardRecord status.
 */
const arbitraryCardStatus: fc.Arbitrary<CardRecord["status"]> = fc.oneof(
  fc.constant("active" as const),
  fc.constant("blocked_tamper" as const),
  fc.constant("blocked_fraud" as const),
  fc.constant("blocked_expired" as const),
  fc.constant("blocked_admin" as const),
  fc.constant("deleted" as const),
);

/**
 * Generates a full CardRecord with arbitrary but valid field values.
 */
const arbitraryCardRecord: fc.Arbitrary<CardRecord> = fc.record({
  tenantId: fc.string({ minLength: 1, maxLength: 50 }),
  cardId: arbitraryCardId,
  userId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  status: arbitraryCardStatus,
  balance: fc.integer({ min: 0, max: 1_000_000 }),
  counter: fc.nat({ max: 100_000 }),
  keyVersion: fc.integer({ min: 1, max: 10 }),
  createdAt: fc.integer({ min: 1_600_000_000, max: 1_800_000_000 }),
  lastActivityAt: fc.option(fc.integer({ min: 1_600_000_000, max: 1_800_000_000 }), {
    nil: null,
  }),
  expiresAt: fc.option(fc.integer({ min: 1_600_000_000, max: 1_900_000_000 }), { nil: null }),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: null }),
});

/**
 * Represents the three possible database states:
 * - "found": card exists in DB
 * - "not_found": card does not exist (returns undefined)
 * - "error": IndexedDB throws an error
 */
type DbState =
  | { type: "found"; card: CardRecord }
  | { type: "not_found" }
  | { type: "error"; message: string };

/**
 * Generates an arbitrary database state.
 */
const arbitraryDbState: fc.Arbitrary<DbState> = fc.oneof(
  arbitraryCardRecord.map((card) => ({ type: "found" as const, card })),
  fc.constant({ type: "not_found" as const }),
  fc.string({ minLength: 1, maxLength: 50 }).map((message) => ({
    type: "error" as const,
    message,
  })),
);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Creates a mock CardRepository that simulates the given database state.
 */
function createMockCardRepo(dbState: DbState): CardRepository {
  return {
    async getByTenantAndCardId(
      _tenantId: string,
      _cardId: string,
    ): Promise<CardRecord | undefined> {
      switch (dbState.type) {
        case "found":
          return dbState.card;
        case "not_found":
          return undefined;
        case "error":
          throw new Error(dbState.message);
      }
    },
    async filterByCardIdExcludingDeleted(_cardId: string): Promise<CardRecord[]> {
      return [];
    },
    async updateStatus(
      _tenantId: string,
      _cardId: string,
      _status: CardRecord["status"],
    ): Promise<void> {},
    async put(_card: CardRecord): Promise<void> {},
  };
}

/**
 * Computes the expected PrintEligibility based on the database state and options,
 * replicating the original implementation's behavior.
 */
function computeExpectedResult(dbState: DbState, options: PrintOptions): PrintEligibility {
  // If DB throws → { enabled: false, reason: "CARD_NOT_FOUND" }
  if (dbState.type === "error") {
    return { enabled: false, reason: "CARD_NOT_FOUND" };
  }

  // If card undefined → { enabled: false, reason: "CARD_NOT_FOUND" }
  if (dbState.type === "not_found") {
    return { enabled: false, reason: "CARD_NOT_FOUND" };
  }

  const card = dbState.card;

  // If card.status !== "active" → { enabled: false, reason: "CARD_BLOCKED" }
  if (card.status !== "active") {
    return { enabled: false, reason: "CARD_BLOCKED" };
  }

  // If !withMember && balance === 0 → { enabled: false, reason: "NO_MEMBER_NO_BALANCE" }
  if (options.withMember === false && card.balance === 0) {
    return { enabled: false, reason: "NO_MEMBER_NO_BALANCE" };
  }

  // Otherwise → { enabled: true }
  return { enabled: true };
}

// ============================================================================
// Property Tests
// ============================================================================

describe("evaluatePrintEligibility Property Tests", () => {
  describe("Property 6: evaluatePrintEligibility behavioral equivalence", () => {
    /**
     * **Validates: Requirements 6.6, 6.8**
     *
     * For any valid (cardId, options, tenantId) triple and for any card database state,
     * evaluatePrintEligibility with a mock CardRepository produces the correct PrintEligibility.
     */
    it("should produce identical results to the expected behavior for all inputs", () => {
      fc.assert(
        fc.asyncProperty(
          arbitraryCardId,
          arbitraryPrintOptions,
          arbitraryTenantId,
          arbitraryDbState,
          async (cardId, options, tenantId, dbState) => {
            const mockRepo = createMockCardRepo(dbState);
            const result = await evaluatePrintEligibility(cardId, options, tenantId, {
              cardRepo: mockRepo,
            });
            const expected = computeExpectedResult(dbState, options);

            expect(result).toEqual(expected);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements 6.6, 6.8**
     *
     * evaluatePrintEligibilitySync produces the correct result for card-found
     * and card-not-found states (sync path, no error case).
     */
    it("evaluatePrintEligibilitySync should produce identical results for all card states", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            arbitraryCardRecord.map((card) => ({ type: "found" as const, card })),
            fc.constant({ type: "not_found" as const }),
          ),
          arbitraryPrintOptions,
          (dbState, options) => {
            const card = dbState.type === "found" ? dbState.card : undefined;
            const result = evaluatePrintEligibilitySync(card, options);
            const expected = computeExpectedResult(dbState, options);

            expect(result).toEqual(expected);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements 6.8**
     *
     * When IndexedDB throws an error, evaluatePrintEligibility returns CARD_NOT_FOUND
     * (fail-closed behavior preserved).
     */
    it("should return CARD_NOT_FOUND when repository throws any error", () => {
      fc.assert(
        fc.asyncProperty(
          arbitraryCardId,
          arbitraryPrintOptions,
          arbitraryTenantId,
          fc.string({ minLength: 1, maxLength: 100 }),
          async (cardId, options, tenantId, errorMessage) => {
            const errorState: DbState = { type: "error", message: errorMessage };
            const mockRepo = createMockCardRepo(errorState);
            const result = await evaluatePrintEligibility(cardId, options, tenantId, {
              cardRepo: mockRepo,
            });

            expect(result).toEqual({ enabled: false, reason: "CARD_NOT_FOUND" });
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 6.6**
     *
     * The async evaluatePrintEligibility and sync evaluatePrintEligibilitySync
     * produce identical results when the card is successfully retrieved (no error).
     */
    it("async and sync versions should agree when card is found or not found", () => {
      fc.assert(
        fc.asyncProperty(
          arbitraryCardId,
          arbitraryPrintOptions,
          arbitraryTenantId,
          fc.oneof(
            arbitraryCardRecord.map((card) => ({ type: "found" as const, card })),
            fc.constant({ type: "not_found" as const }),
          ),
          async (cardId, options, tenantId, dbState) => {
            const mockRepo = createMockCardRepo(dbState);
            const asyncResult = await evaluatePrintEligibility(cardId, options, tenantId, {
              cardRepo: mockRepo,
            });

            const card = dbState.type === "found" ? dbState.card : undefined;
            const syncResult = evaluatePrintEligibilitySync(card, options);

            expect(asyncResult).toEqual(syncResult);
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
