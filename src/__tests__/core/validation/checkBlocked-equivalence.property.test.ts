/**
 * Property-Based Test: checkBlocked behavioral equivalence
 *
 * **Validates: Requirements 6.5**
 *
 * Property 5: checkBlocked behavioral equivalence
 *
 * For any valid (tenantId, cardId, onCardStatus) triple and for any card database state,
 * calling the refactored checkBlocked with a mock CardRepository shall produce an identical
 * BlockCheckResult to what the original implementation would produce given the same database state.
 *
 * This test verifies that:
 * 1. If onCardStatus is a blocked status → blocked=true with correct errorCode
 * 2. If DB card has blocked status → blocked=true with correct errorCode
 * 3. If both are active/not-blocked → blocked=false
 *
 * Also tests checkBlockedSync (the pure sync function) with the same property.
 *
 * @module __tests__/core/validation/checkBlocked-equivalence.property.test
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CardStatus } from "#/core/payload/types";
import type { CardRecord } from "#/core/interfaces/types";
import type { CardRepository } from "#/core/interfaces/CardRepository";
import {
  checkBlocked,
  checkBlockedSync,
  type BlockCheckResult,
} from "#/core/validation/blockEnforcer";

// ============================================================================
// Reference Implementation - Encodes the expected behavior
// ============================================================================

/**
 * Reference implementation of the block check logic.
 * This encodes the specification directly:
 * - On-card blocked status → immediate rejection with mapped errorCode
 * - DB card blocked status → rejection with mapped errorCode
 * - Otherwise → not blocked
 */
function referenceCheckBlocked(
  onCardStatus: CardStatus | undefined,
  dbCard: CardRecord | null | undefined,
): BlockCheckResult {
  const blockedStatuses = [
    CardStatus.BLOCKED_TAMPER,
    CardStatus.BLOCKED_FRAUD,
    CardStatus.BLOCKED_EXPIRED,
    CardStatus.BLOCKED_ADMIN,
  ];

  // Check on-card status first (authoritative)
  if (onCardStatus !== undefined && blockedStatuses.includes(onCardStatus)) {
    return {
      blocked: true,
      status: onCardStatus,
      message: "Akses Ditolak: Kartu Diblokir",
      errorCode: mapErrorCode(onCardStatus),
    };
  }

  // Check DB card status
  if (dbCard && dbCard.status !== "active") {
    const dbStatusMap: Record<string, CardStatus> = {
      blocked_tamper: CardStatus.BLOCKED_TAMPER,
      blocked_fraud: CardStatus.BLOCKED_FRAUD,
      blocked_expired: CardStatus.BLOCKED_EXPIRED,
      blocked_admin: CardStatus.BLOCKED_ADMIN,
    };
    const cardStatus = dbStatusMap[dbCard.status];
    if (cardStatus !== undefined) {
      return {
        blocked: true,
        status: cardStatus,
        message: "Akses Ditolak: Kartu Diblokir",
        errorCode: mapErrorCode(cardStatus),
      };
    }
  }

  return { blocked: false };
}

function mapErrorCode(
  status: CardStatus,
): "CARD_BLOCKED" | "CARD_BLOCKED_ADMIN" | "CARD_BLOCKED_TAMPER" {
  switch (status) {
    case CardStatus.BLOCKED_ADMIN:
      return "CARD_BLOCKED_ADMIN";
    case CardStatus.BLOCKED_TAMPER:
      return "CARD_BLOCKED_TAMPER";
    case CardStatus.BLOCKED_FRAUD:
    case CardStatus.BLOCKED_EXPIRED:
    default:
      return "CARD_BLOCKED";
  }
}

// ============================================================================
// Generators
// ============================================================================

/** Non-empty string for tenant IDs */
const tenantIdArb = fc.uuid();

/** Non-empty hex string for card IDs */
const cardIdArb = fc
  .array(fc.constantFrom(..."0123456789abcdef".split("")), { minLength: 4, maxLength: 14 })
  .map((chars) => chars.join(""));

/** CardStatus enum values */
const cardStatusArb = fc.constantFrom(
  CardStatus.ACTIVE,
  CardStatus.BLOCKED_TAMPER,
  CardStatus.BLOCKED_FRAUD,
  CardStatus.BLOCKED_EXPIRED,
  CardStatus.BLOCKED_ADMIN,
);

/** Optional CardStatus (undefined or a valid enum value) */
const optionalCardStatusArb = fc.option(cardStatusArb, { nil: undefined });

/** Card DB status strings */
const dbCardStatusArb = fc.constantFrom(
  "active" as const,
  "blocked_tamper" as const,
  "blocked_fraud" as const,
  "blocked_expired" as const,
  "blocked_admin" as const,
  "deleted" as const,
);

/** Generate a CardRecord with a specific status */
function cardRecordArb(tenantId: string, cardId: string): fc.Arbitrary<CardRecord> {
  return fc.record({
    tenantId: fc.constant(tenantId),
    cardId: fc.constant(cardId),
    userId: fc.option(
      fc
        .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
          minLength: 1,
          maxLength: 8,
        })
        .map((c) => c.join("")),
      { nil: null },
    ),
    status: dbCardStatusArb,
    balance: fc.integer({ min: 0, max: 10_000_000 }),
    counter: fc.integer({ min: 0, max: 100_000 }),
    keyVersion: fc.integer({ min: 1, max: 10 }),
    createdAt: fc.integer({ min: 1_600_000_000, max: 1_800_000_000 }),
    lastActivityAt: fc.option(fc.integer({ min: 1_600_000_000, max: 1_800_000_000 }), {
      nil: null,
    }),
    expiresAt: fc.option(fc.integer({ min: 1_600_000_000, max: 1_900_000_000 }), { nil: null }),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
  });
}

/** Generate a card database state: either card exists or doesn't */
const dbStateArb = (tenantId: string, cardId: string) =>
  fc.oneof(
    fc.constant(undefined as CardRecord | undefined), // card not found
    cardRecordArb(tenantId, cardId), // card exists with random status
  );

// ============================================================================
// Mock CardRepository
// ============================================================================

function createMockCardRepo(dbCard: CardRecord | undefined): CardRepository {
  return {
    getByTenantAndCardId: async () => dbCard,
    filterByCardIdExcludingDeleted: async () =>
      dbCard && dbCard.status !== "deleted" ? [dbCard] : [],
    updateStatus: async () => {},
    put: async () => {},
  };
}

// ============================================================================
// Property 5: checkBlocked behavioral equivalence
// ============================================================================

describe("Property 5: checkBlocked behavioral equivalence", () => {
  describe("checkBlockedSync equivalence", () => {
    it("produces identical BlockCheckResult to reference for any (onCardStatus, dbCard) pair", () => {
      /**
       * **Validates: Requirements 6.5**
       *
       * For any combination of on-card status and DB card record,
       * checkBlockedSync produces the same result as the reference implementation.
       */
      fc.assert(
        fc.property(
          tenantIdArb,
          cardIdArb,
          optionalCardStatusArb,
          (tenantId, cardId, onCardStatus) => {
            return fc.assert(
              fc.property(dbStateArb(tenantId, cardId), (dbCard) => {
                const actual = checkBlockedSync(onCardStatus, dbCard ?? null);
                const expected = referenceCheckBlocked(onCardStatus, dbCard ?? null);

                expect(actual.blocked).toBe(expected.blocked);
                expect(actual.errorCode).toBe(expected.errorCode);
                expect(actual.status).toBe(expected.status);
                expect(actual.message).toBe(expected.message);
              }),
              { numRuns: 20 },
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it("on-card blocked status always takes priority over DB card status", () => {
      /**
       * **Validates: Requirements 6.5**
       *
       * When on-card status is blocked, the result reflects the on-card status
       * regardless of what the DB card says.
       */
      const blockedOnCardArb = fc.constantFrom(
        CardStatus.BLOCKED_TAMPER,
        CardStatus.BLOCKED_FRAUD,
        CardStatus.BLOCKED_EXPIRED,
        CardStatus.BLOCKED_ADMIN,
      );

      fc.assert(
        fc.property(
          tenantIdArb,
          cardIdArb,
          blockedOnCardArb,
          dbCardStatusArb,
          (tenantId, cardId, onCardStatus, dbStatus) => {
            const dbCard: CardRecord = {
              tenantId,
              cardId,
              userId: null,
              status: dbStatus,
              balance: 0,
              counter: 0,
              keyVersion: 1,
              createdAt: 1_700_000_000,
              lastActivityAt: null,
              expiresAt: null,
              notes: null,
            };

            const result = checkBlockedSync(onCardStatus, dbCard);

            expect(result.blocked).toBe(true);
            expect(result.status).toBe(onCardStatus);
            expect(result.errorCode).toBe(mapErrorCode(onCardStatus));
          },
        ),
        { numRuns: 100 },
      );
    });

    it("returns blocked=false only when both on-card and DB are non-blocked", () => {
      /**
       * **Validates: Requirements 6.5**
       *
       * The function returns blocked=false only when:
       * - onCardStatus is undefined or ACTIVE, AND
       * - dbCard is null/undefined or has "active" status
       */
      const nonBlockedOnCardArb = fc.constantFrom(undefined, CardStatus.ACTIVE);

      fc.assert(
        fc.property(
          tenantIdArb,
          cardIdArb,
          nonBlockedOnCardArb,
          (tenantId, cardId, onCardStatus) => {
            // DB card is active
            const activeDbCard: CardRecord = {
              tenantId,
              cardId,
              userId: null,
              status: "active",
              balance: 0,
              counter: 0,
              keyVersion: 1,
              createdAt: 1_700_000_000,
              lastActivityAt: null,
              expiresAt: null,
              notes: null,
            };

            const resultWithActive = checkBlockedSync(onCardStatus, activeDbCard);
            expect(resultWithActive.blocked).toBe(false);

            // DB card is null (not found)
            const resultWithNull = checkBlockedSync(onCardStatus, null);
            expect(resultWithNull.blocked).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("checkBlocked async equivalence", () => {
    it("produces identical result to checkBlockedSync for any DB state", async () => {
      /**
       * **Validates: Requirements 6.5**
       *
       * For any (tenantId, cardId, onCardStatus) triple and any card database state,
       * the async checkBlocked with a mock CardRepository produces the same result
       * as calling checkBlockedSync directly with the same DB card.
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          cardIdArb,
          optionalCardStatusArb,
          fc.boolean(), // whether card exists in DB
          dbCardStatusArb,
          async (tenantId, cardId, onCardStatus, cardExists, dbStatus) => {
            const dbCard: CardRecord | undefined = cardExists
              ? {
                  tenantId,
                  cardId,
                  userId: null,
                  status: dbStatus,
                  balance: 0,
                  counter: 0,
                  keyVersion: 1,
                  createdAt: 1_700_000_000,
                  lastActivityAt: null,
                  expiresAt: null,
                  notes: null,
                }
              : undefined;

            const mockRepo = createMockCardRepo(dbCard);

            const asyncResult = await checkBlocked(
              tenantId,
              cardId,
              { cardRepo: mockRepo },
              onCardStatus,
            );
            const syncResult = checkBlockedSync(onCardStatus, dbCard ?? null);

            expect(asyncResult.blocked).toBe(syncResult.blocked);
            expect(asyncResult.errorCode).toBe(syncResult.errorCode);
            expect(asyncResult.status).toBe(syncResult.status);
            expect(asyncResult.message).toBe(syncResult.message);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("skips DB lookup when on-card status is already blocked", async () => {
      /**
       * **Validates: Requirements 6.5**
       *
       * When on-card status indicates blocked, checkBlocked returns immediately
       * without querying the repository. This is an optimization that preserves
       * the original behavior.
       */
      const blockedOnCardArb = fc.constantFrom(
        CardStatus.BLOCKED_TAMPER,
        CardStatus.BLOCKED_FRAUD,
        CardStatus.BLOCKED_EXPIRED,
        CardStatus.BLOCKED_ADMIN,
      );

      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          cardIdArb,
          blockedOnCardArb,
          async (tenantId, cardId, onCardStatus) => {
            let dbWasCalled = false;
            const mockRepo: CardRepository = {
              getByTenantAndCardId: async () => {
                dbWasCalled = true;
                return undefined;
              },
              filterByCardIdExcludingDeleted: async () => [],
              updateStatus: async () => {},
              put: async () => {},
            };

            const result = await checkBlocked(
              tenantId,
              cardId,
              { cardRepo: mockRepo },
              onCardStatus,
            );

            expect(result.blocked).toBe(true);
            expect(result.errorCode).toBe(mapErrorCode(onCardStatus));
            expect(dbWasCalled).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("queries DB when on-card status is not blocked", async () => {
      /**
       * **Validates: Requirements 6.5**
       *
       * When on-card status is ACTIVE or undefined, checkBlocked queries the
       * CardRepository and uses the DB card status to determine the result.
       */
      const nonBlockedOnCardArb = fc.constantFrom(undefined, CardStatus.ACTIVE);

      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          cardIdArb,
          nonBlockedOnCardArb,
          dbCardStatusArb,
          async (tenantId, cardId, onCardStatus, dbStatus) => {
            const dbCard: CardRecord = {
              tenantId,
              cardId,
              userId: null,
              status: dbStatus,
              balance: 0,
              counter: 0,
              keyVersion: 1,
              createdAt: 1_700_000_000,
              lastActivityAt: null,
              expiresAt: null,
              notes: null,
            };

            const mockRepo = createMockCardRepo(dbCard);
            const result = await checkBlocked(
              tenantId,
              cardId,
              { cardRepo: mockRepo },
              onCardStatus,
            );
            const expected = referenceCheckBlocked(onCardStatus, dbCard);

            expect(result.blocked).toBe(expected.blocked);
            expect(result.errorCode).toBe(expected.errorCode);
            expect(result.status).toBe(expected.status);
            expect(result.message).toBe(expected.message);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("errorCode mapping correctness", () => {
    it("maps all blocked statuses to the correct errorCode", () => {
      /**
       * **Validates: Requirements 6.5**
       *
       * Verifies the errorCode mapping is consistent:
       * - BLOCKED_ADMIN → "CARD_BLOCKED_ADMIN"
       * - BLOCKED_TAMPER → "CARD_BLOCKED_TAMPER"
       * - BLOCKED_FRAUD → "CARD_BLOCKED"
       * - BLOCKED_EXPIRED → "CARD_BLOCKED"
       */
      const statusToExpectedCode: [CardStatus, string][] = [
        [CardStatus.BLOCKED_ADMIN, "CARD_BLOCKED_ADMIN"],
        [CardStatus.BLOCKED_TAMPER, "CARD_BLOCKED_TAMPER"],
        [CardStatus.BLOCKED_FRAUD, "CARD_BLOCKED"],
        [CardStatus.BLOCKED_EXPIRED, "CARD_BLOCKED"],
      ];

      fc.assert(
        fc.property(fc.constantFrom(...statusToExpectedCode), ([status, expectedCode]) => {
          const result = checkBlockedSync(status, null);
          expect(result.blocked).toBe(true);
          expect(result.errorCode).toBe(expectedCode);
          expect(result.message).toBe("Akses Ditolak: Kartu Diblokir");
        }),
        { numRuns: 50 },
      );
    });

    it("DB status strings map to the same errorCodes as their CardStatus equivalents", () => {
      /**
       * **Validates: Requirements 6.5**
       *
       * Verifies that blocked DB statuses produce the same errorCode as
       * their corresponding CardStatus enum values when checked via on-card status.
       */
      const dbStatusToCardStatus: [CardRecord["status"], CardStatus][] = [
        ["blocked_tamper", CardStatus.BLOCKED_TAMPER],
        ["blocked_fraud", CardStatus.BLOCKED_FRAUD],
        ["blocked_expired", CardStatus.BLOCKED_EXPIRED],
        ["blocked_admin", CardStatus.BLOCKED_ADMIN],
      ];

      fc.assert(
        fc.property(
          tenantIdArb,
          cardIdArb,
          fc.constantFrom(...dbStatusToCardStatus),
          (tenantId, cardId, [dbStatus, cardStatus]) => {
            const dbCard: CardRecord = {
              tenantId,
              cardId,
              userId: null,
              status: dbStatus,
              balance: 0,
              counter: 0,
              keyVersion: 1,
              createdAt: 1_700_000_000,
              lastActivityAt: null,
              expiresAt: null,
              notes: null,
            };

            // Result from DB card status
            const dbResult = checkBlockedSync(undefined, dbCard);
            // Result from on-card status
            const onCardResult = checkBlockedSync(cardStatus, null);

            // Both should produce the same errorCode
            expect(dbResult.errorCode).toBe(onCardResult.errorCode);
            expect(dbResult.blocked).toBe(true);
            expect(onCardResult.blocked).toBe(true);
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
