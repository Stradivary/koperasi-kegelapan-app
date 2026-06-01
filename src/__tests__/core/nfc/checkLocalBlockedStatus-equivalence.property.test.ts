/**
 * Property 7: checkLocalBlockedStatus behavioral equivalence
 *
 * **Validates: Requirements 6.7**
 *
 * For any valid (tenantId, serialNumber) pair and for any combination of card
 * and user database states, calling the refactored checkLocalBlockedStatus with
 * mock CardRepository and UserRepository shall produce an identical
 * LocalStatusResult to what the original implementation would produce.
 *
 * This test verifies the refactored function (using injected deps) produces
 * correct results for all possible input combinations:
 * 1. Card not found → { blocked: false, reason: null, notInLocalDb: true }
 * 2. Card blocked → { blocked: true, reason: contains status suffix, notInLocalDb: false }
 * 3. Card active, no userId → { blocked: false, reason: null, notInLocalDb: false }
 * 4. Card active, user active → { blocked: false, reason: null, notInLocalDb: false }
 * 5. Card active, user suspended/deleted → { blocked: true, reason: contains "ditangguhkan", notInLocalDb: false }
 * 6. Card active, user not found → { blocked: false, reason: null, notInLocalDb: false }
 *
 * @module __tests__/core/nfc/checkLocalBlockedStatus-equivalence.property.test
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { checkLocalBlockedStatus } from "#/core/nfc/localStatusCheck";
import type { LocalStatusResult } from "#/core/nfc/localStatusCheck";
import type { CardRepository } from "#/core/interfaces/CardRepository";
import type { UserRepository } from "#/core/interfaces/UserRepository";
import type { CardRecord, UserRecord } from "#/core/interfaces/types";

// ============================================================================
// Generators
// ============================================================================

/** Non-empty tenant ID (UUID format) */
const tenantIdArb = fc.uuid();

/** Generate a hardware serial number (hex string, 8-14 hex chars like real NFC UIDs) */
const rawHexSerialArb = fc
  .array(fc.constantFrom(..."0123456789abcdef".split("")), { minLength: 8, maxLength: 14 })
  .map((chars) => chars.join(""));

/** Serial number with optional formatting (colons, dashes, mixed case) */
const serialNumberArb = rawHexSerialArb.chain((serial) =>
  fc.constantFrom(
    serial,
    serial.toUpperCase(),
    serial.match(/.{1,2}/g)?.join(":") ?? serial,
    serial.match(/.{1,2}/g)?.join("-") ?? serial,
    serial
      .match(/.{1,2}/g)
      ?.join(":")
      .toUpperCase() ?? serial,
  ),
);

/** All card statuses */
const cardStatusArb = fc.constantFrom(
  "active" as const,
  "blocked_tamper" as const,
  "blocked_fraud" as const,
  "blocked_expired" as const,
  "blocked_admin" as const,
  "deleted" as const,
);

/** Non-active card statuses (blocked or deleted) */
const blockedCardStatusArb = fc.constantFrom(
  "blocked_tamper" as const,
  "blocked_fraud" as const,
  "blocked_expired" as const,
  "blocked_admin" as const,
  "deleted" as const,
);

/** All user statuses */
const userStatusArb = fc.constantFrom("active" as const, "suspended" as const, "deleted" as const);

/** Non-active user statuses */
const nonActiveUserStatusArb = fc.constantFrom("suspended" as const, "deleted" as const);

/** User ID generator (non-empty string) */
const userIdArb = fc.uuid();

// ============================================================================
// Mock Repository Factories
// ============================================================================

function createMockCardRepo(cardRecord: CardRecord | undefined): CardRepository {
  return {
    getByTenantAndCardId: async () => cardRecord,
    filterByCardIdExcludingDeleted: async () => [],
    updateStatus: async () => {},
    put: async () => {},
  };
}

function createMockUserRepo(userRecord: UserRecord | undefined): UserRepository {
  return {
    getByTenantAndUserId: async () => userRecord,
  };
}

// ============================================================================
// Reference Implementation
// ============================================================================

/**
 * Reference implementation that encodes the expected behavior of
 * checkLocalBlockedStatus directly from the specification.
 */
function referenceCheckLocalBlockedStatus(
  cardRecord: CardRecord | undefined,
  userRecord: UserRecord | undefined,
): LocalStatusResult {
  // Card not found
  if (!cardRecord) {
    return { blocked: false, reason: null, notInLocalDb: true };
  }

  // Card not active (blocked or deleted)
  if (cardRecord.status !== "active") {
    return {
      blocked: true,
      reason: `Kartu diblokir: ${cardRecord.status.replaceAll("blocked_", "")}`,
      notInLocalDb: false,
    };
  }

  // Card active, check linked user
  const linkedUserId = cardRecord.userId ?? null;
  if (linkedUserId) {
    if (userRecord && userRecord.status !== "active") {
      return {
        blocked: true,
        reason: "Akun anggota ditangguhkan. Hubungi admin.",
        notInLocalDb: false,
      };
    }
  }

  return { blocked: false, reason: null, notInLocalDb: false };
}

// ============================================================================
// Property 7: checkLocalBlockedStatus behavioral equivalence
// ============================================================================

describe("Property 7: checkLocalBlockedStatus behavioral equivalence", () => {
  describe("Case 1: Card not found → notInLocalDb: true", () => {
    it("returns { blocked: false, reason: null, notInLocalDb: true } when card is not in DB", async () => {
      /**
       * **Validates: Requirements 6.7**
       */
      await fc.assert(
        fc.asyncProperty(tenantIdArb, serialNumberArb, async (tenantId, serialNumber) => {
          const cardRepo = createMockCardRepo(undefined);
          const userRepo = createMockUserRepo(undefined);

          const result = await checkLocalBlockedStatus(tenantId, serialNumber, {
            cardRepo,
            userRepo,
          });

          const expected = referenceCheckLocalBlockedStatus(undefined, undefined);

          expect(result).toEqual(expected);
          expect(result.blocked).toBe(false);
          expect(result.reason).toBeNull();
          expect(result.notInLocalDb).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Case 2: Card blocked → blocked with status reason", () => {
    it("returns blocked with reason containing the status suffix for any blocked card", async () => {
      /**
       * **Validates: Requirements 6.7**
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          serialNumberArb,
          blockedCardStatusArb,
          async (tenantId, serialNumber, cardStatus) => {
            const normalizedSerial = serialNumber.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();

            const cardRecord: CardRecord = {
              tenantId,
              cardId: normalizedSerial,
              userId: null,
              status: cardStatus,
              balance: 0,
              counter: 0,
              keyVersion: 1,
              createdAt: 0,
              lastActivityAt: null,
              expiresAt: null,
              notes: null,
            };

            const cardRepo = createMockCardRepo(cardRecord);
            const userRepo = createMockUserRepo(undefined);

            const result = await checkLocalBlockedStatus(tenantId, serialNumber, {
              cardRepo,
              userRepo,
            });

            const expected = referenceCheckLocalBlockedStatus(cardRecord, undefined);

            expect(result).toEqual(expected);
            expect(result.blocked).toBe(true);
            expect(result.reason).toContain(cardStatus.replaceAll("blocked_", ""));
            expect(result.notInLocalDb).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Case 3: Card active, no userId → not blocked", () => {
    it("returns { blocked: false, reason: null, notInLocalDb: false } when card is active with no linked user", async () => {
      /**
       * **Validates: Requirements 6.7**
       */
      await fc.assert(
        fc.asyncProperty(tenantIdArb, serialNumberArb, async (tenantId, serialNumber) => {
          const normalizedSerial = serialNumber.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();

          const cardRecord: CardRecord = {
            tenantId,
            cardId: normalizedSerial,
            userId: null,
            status: "active",
            balance: 0,
            counter: 0,
            keyVersion: 1,
            createdAt: 0,
            lastActivityAt: null,
            expiresAt: null,
            notes: null,
          };

          const cardRepo = createMockCardRepo(cardRecord);
          const userRepo = createMockUserRepo(undefined);

          const result = await checkLocalBlockedStatus(tenantId, serialNumber, {
            cardRepo,
            userRepo,
          });

          const expected = referenceCheckLocalBlockedStatus(cardRecord, undefined);

          expect(result).toEqual(expected);
          expect(result.blocked).toBe(false);
          expect(result.reason).toBeNull();
          expect(result.notInLocalDb).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Case 4: Card active, user active → not blocked", () => {
    it("returns { blocked: false, reason: null, notInLocalDb: false } when card and user are both active", async () => {
      /**
       * **Validates: Requirements 6.7**
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          serialNumberArb,
          userIdArb,
          async (tenantId, serialNumber, userId) => {
            const normalizedSerial = serialNumber.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();

            const cardRecord: CardRecord = {
              tenantId,
              cardId: normalizedSerial,
              userId,
              status: "active",
              balance: 0,
              counter: 0,
              keyVersion: 1,
              createdAt: 0,
              lastActivityAt: null,
              expiresAt: null,
              notes: null,
            };

            const userRecord: UserRecord = {
              tenantId,
              userId,
              name: "Test User",
              status: "active",
            };

            const cardRepo = createMockCardRepo(cardRecord);
            const userRepo = createMockUserRepo(userRecord);

            const result = await checkLocalBlockedStatus(tenantId, serialNumber, {
              cardRepo,
              userRepo,
            });

            const expected = referenceCheckLocalBlockedStatus(cardRecord, userRecord);

            expect(result).toEqual(expected);
            expect(result.blocked).toBe(false);
            expect(result.reason).toBeNull();
            expect(result.notInLocalDb).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Case 5: Card active, user suspended/deleted → blocked", () => {
    it("returns blocked with 'ditangguhkan' reason when user is suspended or deleted", async () => {
      /**
       * **Validates: Requirements 6.7**
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          serialNumberArb,
          userIdArb,
          nonActiveUserStatusArb,
          async (tenantId, serialNumber, userId, userStatus) => {
            const normalizedSerial = serialNumber.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();

            const cardRecord: CardRecord = {
              tenantId,
              cardId: normalizedSerial,
              userId,
              status: "active",
              balance: 0,
              counter: 0,
              keyVersion: 1,
              createdAt: 0,
              lastActivityAt: null,
              expiresAt: null,
              notes: null,
            };

            const userRecord: UserRecord = {
              tenantId,
              userId,
              name: "Test User",
              status: userStatus,
            };

            const cardRepo = createMockCardRepo(cardRecord);
            const userRepo = createMockUserRepo(userRecord);

            const result = await checkLocalBlockedStatus(tenantId, serialNumber, {
              cardRepo,
              userRepo,
            });

            const expected = referenceCheckLocalBlockedStatus(cardRecord, userRecord);

            expect(result).toEqual(expected);
            expect(result.blocked).toBe(true);
            expect(result.reason).toContain("ditangguhkan");
            expect(result.notInLocalDb).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Case 6: Card active, user not found → not blocked", () => {
    it("returns { blocked: false, reason: null, notInLocalDb: false } when user is not in DB", async () => {
      /**
       * **Validates: Requirements 6.7**
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          serialNumberArb,
          userIdArb,
          async (tenantId, serialNumber, userId) => {
            const normalizedSerial = serialNumber.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();

            const cardRecord: CardRecord = {
              tenantId,
              cardId: normalizedSerial,
              userId,
              status: "active",
              balance: 0,
              counter: 0,
              keyVersion: 1,
              createdAt: 0,
              lastActivityAt: null,
              expiresAt: null,
              notes: null,
            };

            const cardRepo = createMockCardRepo(cardRecord);
            const userRepo = createMockUserRepo(undefined);

            const result = await checkLocalBlockedStatus(tenantId, serialNumber, {
              cardRepo,
              userRepo,
            });

            const expected = referenceCheckLocalBlockedStatus(cardRecord, undefined);

            expect(result).toEqual(expected);
            expect(result.blocked).toBe(false);
            expect(result.reason).toBeNull();
            expect(result.notInLocalDb).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Comprehensive: all state combinations produce equivalent results", () => {
    it("for any (tenantId, serialNumber, cardState, userState) the refactored function matches reference", async () => {
      /**
       * **Validates: Requirements 6.7**
       *
       * Generates all possible combinations of card and user database states
       * and verifies the refactored implementation matches the reference.
       */
      const scenarioArb = fc.record({
        tenantId: tenantIdArb,
        serialNumber: serialNumberArb,
        cardPresent: fc.boolean(),
        cardStatus: cardStatusArb,
        hasUserId: fc.boolean(),
        userId: userIdArb,
        userPresent: fc.boolean(),
        userStatus: userStatusArb,
      });

      await fc.assert(
        fc.asyncProperty(scenarioArb, async (scenario) => {
          const {
            tenantId,
            serialNumber,
            cardPresent,
            cardStatus,
            hasUserId,
            userId,
            userPresent,
            userStatus,
          } = scenario;

          const normalizedSerial = serialNumber.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();

          // Build card record based on scenario
          const cardRecord: CardRecord | undefined = cardPresent
            ? {
                tenantId,
                cardId: normalizedSerial,
                userId: hasUserId ? userId : null,
                status: cardStatus,
                balance: 0,
                counter: 0,
                keyVersion: 1,
                createdAt: 0,
                lastActivityAt: null,
                expiresAt: null,
                notes: null,
              }
            : undefined;

          // Build user record based on scenario
          const linkedUserId = cardRecord?.userId ?? null;
          const userRecord: UserRecord | undefined =
            userPresent && linkedUserId
              ? {
                  tenantId,
                  userId: linkedUserId,
                  name: "User",
                  status: userStatus,
                }
              : undefined;

          const cardRepo = createMockCardRepo(cardRecord);
          const userRepo = createMockUserRepo(userRecord);

          const result = await checkLocalBlockedStatus(tenantId, serialNumber, {
            cardRepo,
            userRepo,
          });

          const expected = referenceCheckLocalBlockedStatus(cardRecord, userRecord);

          expect(result).toEqual(expected);
        }),
        { numRuns: 200 },
      );
    });
  });
});
