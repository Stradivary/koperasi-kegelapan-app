/**
 * Property-Based Tests for validateUID Behavioral Equivalence
 *
 * **Validates: Requirements 6.4, 6.8**
 *
 * Property 4: validateUID behavioral equivalence
 *
 * For any valid (serialNumber, currentTenantId) pair and for any card database state,
 * calling the refactored validateUID with a mock CardRepository that replicates the
 * original Dexie query behavior, a mock UIDRemoteValidator, and a mock OnlineStatusProvider
 * shall produce an identical UIDValidationResult to what the original implementation
 * would produce given the same database state and network conditions.
 *
 * @module __tests__/core/validation/validateUID-equivalence.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  validateUID,
  validateUIDLocal,
  normalizeUID,
  type UIDValidationResult,
} from "#/core/validation/uidGlobalValidator";
import type { CardRepository } from "#/core/interfaces/CardRepository";
import type { UIDRemoteValidator } from "#/core/interfaces/UIDRemoteValidator";
import type { OnlineStatusProvider } from "#/core/interfaces/OnlineStatusProvider";
import type { CardRecord } from "#/core/interfaces/types";
import type { UIDCheckResult } from "#/core/interfaces/types";

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generates a valid hex character.
 */
const hexChar: fc.Arbitrary<string> = fc.constantFrom(..."0123456789abcdefABCDEF".split(""));

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
 * Generates a serial number that normalizes to a VALID UID (8-14 hex chars).
 * May include separators (colons, dashes) and mixed case.
 */
const arbitraryValidSerialNumber: fc.Arbitrary<string> = hexString(8, 14).chain((hex) => {
  return fc.constantFrom("none", "colon", "dash").map((sepType) => {
    if (sepType === "none") return hex;
    const sep = sepType === "colon" ? ":" : "-";
    const parts: string[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      parts.push(hex.slice(i, i + 2));
    }
    return parts.join(sep);
  });
});

/**
 * Generates a serial number that normalizes to an INVALID UID (too short or too long).
 */
const arbitraryInvalidSerialNumber: fc.Arbitrary<string> = fc.oneof(
  // Too short (< 8 hex chars after normalization)
  hexString(1, 7),
  // Too long (> 14 hex chars after normalization)
  hexString(15, 28),
  // Empty string
  fc.constant(""),
);

/**
 * Generates an arbitrary tenant ID (alphanumeric, non-empty).
 */
const arbitraryTenantId: fc.Arbitrary<string> = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/);

/**
 * Generates a remote validator response scenario.
 */
type RemoteScenario =
  | { type: "not_exists" }
  | { type: "exists"; tenantId: string }
  | { type: "throws" };

const arbitraryRemoteScenario: fc.Arbitrary<RemoteScenario> = fc.oneof(
  fc.constant({ type: "not_exists" } as RemoteScenario),
  arbitraryTenantId.map((tenantId) => ({ type: "exists", tenantId }) as RemoteScenario),
  fc.constant({ type: "throws" } as RemoteScenario),
);

/**
 * Generates online/offline state.
 */
const arbitraryOnlineState: fc.Arbitrary<boolean> = fc.boolean();

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Creates a mock CardRepository that returns cards from the given state,
 * replicating the original Dexie query behavior:
 * filterByCardIdExcludingDeleted returns cards where cardId matches and status !== "deleted"
 */
function createMockCardRepo(cards: CardRecord[]): CardRepository {
  return {
    async getByTenantAndCardId(tenantId: string, cardId: string): Promise<CardRecord | undefined> {
      return cards.find((c) => c.tenantId === tenantId && c.cardId === cardId);
    },
    async filterByCardIdExcludingDeleted(cardId: string): Promise<CardRecord[]> {
      return cards.filter((c) => c.cardId === cardId && c.status !== "deleted");
    },
    async updateStatus(): Promise<void> {},
    async put(): Promise<void> {},
  };
}

/**
 * Creates a mock UIDRemoteValidator based on the given scenario.
 */
function createMockRemoteValidator(scenario: RemoteScenario): UIDRemoteValidator {
  return {
    async checkUIDExists(_normalizedUID: string): Promise<UIDCheckResult> {
      switch (scenario.type) {
        case "not_exists":
          return { exists: false };
        case "exists":
          return { exists: true, tenantId: scenario.tenantId };
        case "throws":
          throw new Error("Network error");
      }
    },
  };
}

/**
 * Creates a mock OnlineStatusProvider.
 */
function createMockOnlineStatus(isOnline: boolean): OnlineStatusProvider {
  return {
    isOnline: () => isOnline,
  };
}

// ============================================================================
// Reference Implementation (expected behavior)
// ============================================================================

/**
 * Reference implementation of validateUID logic.
 * This encodes the expected behavior based on the original algorithm:
 * 1. Normalize UID (strip non-hex, lowercase)
 * 2. Format validation (8-14 hex chars)
 * 3. Local DB check (filterByCardIdExcludingDeleted)
 * 4. Remote check (only if online, fail-closed on error)
 */
function expectedValidateUID(
  serialNumber: string,
  currentTenantId: string,
  cards: CardRecord[],
  isOnline: boolean,
  remoteScenario: RemoteScenario,
): UIDValidationResult {
  const normalizedUID = serialNumber.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();

  if (normalizedUID.length < 8 || normalizedUID.length > 14) {
    return { valid: false, reason: "INVALID_UID_FORMAT" };
  }

  const localCards = cards.filter((c) => c.cardId === normalizedUID && c.status !== "deleted");
  if (localCards.length > 0) {
    const existingCard = localCards[0];
    if (existingCard.tenantId === currentTenantId) {
      return {
        valid: false,
        reason: "UID_ALREADY_REGISTERED",
        existingCardId: normalizedUID,
      };
    }
    return {
      valid: false,
      reason: "UID_REGISTERED_OTHER_TENANT",
      existingTenantId: existingCard.tenantId,
    };
  }

  if (isOnline) {
    switch (remoteScenario.type) {
      case "exists":
        return {
          valid: false,
          reason: "UID_REGISTERED_OTHER_TENANT",
          existingTenantId: remoteScenario.tenantId,
        };
      case "throws":
        return { valid: false, reason: "NETWORK_ERROR" };
      case "not_exists":
        break;
    }
  }

  return { valid: true };
}

/**
 * Reference implementation of validateUIDLocal logic.
 * Only checks format and local DB (no remote check).
 */
function expectedValidateUIDLocal(
  serialNumber: string,
  currentTenantId: string,
  cards: CardRecord[],
): UIDValidationResult {
  const normalizedUID = serialNumber.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();

  if (normalizedUID.length < 8 || normalizedUID.length > 14) {
    return { valid: false, reason: "INVALID_UID_FORMAT" };
  }

  const localCards = cards.filter((c) => c.cardId === normalizedUID && c.status !== "deleted");
  if (localCards.length > 0) {
    const existingCard = localCards[0];
    if (existingCard.tenantId === currentTenantId) {
      return {
        valid: false,
        reason: "UID_ALREADY_REGISTERED",
        existingCardId: normalizedUID,
      };
    }
    return {
      valid: false,
      reason: "UID_REGISTERED_OTHER_TENANT",
      existingTenantId: existingCard.tenantId,
    };
  }

  return { valid: true };
}

// ============================================================================
// Property Tests
// ============================================================================

describe("validateUID Behavioral Equivalence Property Tests", () => {
  describe("Property 4: validateUID behavioral equivalence", () => {
    /**
     * **Validates: Requirements 6.4, 6.8**
     *
     * For any valid serial number, tenant ID, card database state, online state,
     * and remote validator response, validateUID produces the expected result.
     */
    it("validateUID produces identical results to reference implementation for valid serial numbers", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryValidSerialNumber,
          arbitraryTenantId,
          arbitraryOnlineState,
          arbitraryRemoteScenario,
          async (serialNumber, currentTenantId, isOnline, remoteScenario) => {
            const normalizedUID = normalizeUID(serialNumber);
            // Use deterministic card DB state based on inputs
            const cards = generateDeterministicCards(normalizedUID, currentTenantId);

            for (const cardState of cards) {
              const cardRepo = createMockCardRepo(cardState);
              const remoteValidator = createMockRemoteValidator(remoteScenario);
              const onlineStatus = createMockOnlineStatus(isOnline);

              const actual = await validateUID(serialNumber, currentTenantId, {
                cardRepo,
                remoteValidator,
                onlineStatus,
              });

              const expected = expectedValidateUID(
                serialNumber,
                currentTenantId,
                cardState,
                isOnline,
                remoteScenario,
              );

              expect(actual).toEqual(expected);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 6.4, 6.8**
     *
     * For any invalid serial number, validateUID returns INVALID_UID_FORMAT
     * regardless of other inputs.
     */
    it("validateUID rejects invalid format serial numbers", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryInvalidSerialNumber,
          arbitraryTenantId,
          arbitraryOnlineState,
          arbitraryRemoteScenario,
          async (serialNumber, currentTenantId, isOnline, remoteScenario) => {
            const cardRepo = createMockCardRepo([]);
            const remoteValidator = createMockRemoteValidator(remoteScenario);
            const onlineStatus = createMockOnlineStatus(isOnline);

            const actual = await validateUID(serialNumber, currentTenantId, {
              cardRepo,
              remoteValidator,
              onlineStatus,
            });

            expect(actual).toEqual({ valid: false, reason: "INVALID_UID_FORMAT" });
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 6.4, 6.8**
     *
     * validateUIDLocal produces identical results to reference implementation.
     */
    it("validateUIDLocal produces identical results to reference implementation", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryValidSerialNumber,
          arbitraryTenantId,
          async (serialNumber, currentTenantId) => {
            const normalizedUID = normalizeUID(serialNumber);
            const cards = generateDeterministicCards(normalizedUID, currentTenantId);

            for (const cardState of cards) {
              const cardRepo = createMockCardRepo(cardState);

              const actual = await validateUIDLocal(serialNumber, currentTenantId, {
                cardRepo,
              });

              const expected = expectedValidateUIDLocal(serialNumber, currentTenantId, cardState);

              expect(actual).toEqual(expected);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 6.4, 6.8**
     *
     * validateUIDLocal rejects invalid format serial numbers.
     */
    it("validateUIDLocal rejects invalid format serial numbers", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryInvalidSerialNumber,
          arbitraryTenantId,
          async (serialNumber, currentTenantId) => {
            const cardRepo = createMockCardRepo([]);

            const actual = await validateUIDLocal(serialNumber, currentTenantId, { cardRepo });

            expect(actual).toEqual({ valid: false, reason: "INVALID_UID_FORMAT" });
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 6.4, 6.8**
     *
     * When offline, validateUID skips remote check and behaves like validateUIDLocal.
     */
    it("validateUID behaves like validateUIDLocal when offline", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryValidSerialNumber,
          arbitraryTenantId,
          arbitraryRemoteScenario,
          async (serialNumber, currentTenantId, remoteScenario) => {
            const normalizedUID = normalizeUID(serialNumber);
            const cards = generateDeterministicCards(normalizedUID, currentTenantId);

            for (const cardState of cards) {
              const cardRepo = createMockCardRepo(cardState);
              const remoteValidator = createMockRemoteValidator(remoteScenario);
              const onlineStatus = createMockOnlineStatus(false); // offline

              const fullResult = await validateUID(serialNumber, currentTenantId, {
                cardRepo,
                remoteValidator,
                onlineStatus,
              });

              const localOnlyCardRepo = createMockCardRepo(cardState);
              const localResult = await validateUIDLocal(serialNumber, currentTenantId, {
                cardRepo: localOnlyCardRepo,
              });

              expect(fullResult).toEqual(localResult);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 6.8**
     *
     * Fail-closed behavior: when online and remote validator throws,
     * validateUID returns NETWORK_ERROR (unless local check already found a match).
     */
    it("validateUID implements fail-closed on network error when online", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryValidSerialNumber,
          arbitraryTenantId,
          async (serialNumber, currentTenantId) => {
            // Empty local DB so we reach the remote check
            const cardRepo = createMockCardRepo([]);
            const remoteValidator = createMockRemoteValidator({ type: "throws" });
            const onlineStatus = createMockOnlineStatus(true);

            const result = await validateUID(serialNumber, currentTenantId, {
              cardRepo,
              remoteValidator,
              onlineStatus,
            });

            expect(result).toEqual({ valid: false, reason: "NETWORK_ERROR" });
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirements 6.4**
     *
     * normalizeUID is idempotent: normalizing an already-normalized UID
     * produces the same result.
     */
    it("normalizeUID is idempotent", () => {
      fc.assert(
        fc.property(arbitraryValidSerialNumber, (serialNumber) => {
          const once = normalizeUID(serialNumber);
          const twice = normalizeUID(once);
          expect(once).toBe(twice);
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generates deterministic card database states for testing.
 * Returns multiple scenarios: empty DB, same-tenant match, different-tenant match.
 */
function generateDeterministicCards(
  normalizedUID: string,
  currentTenantId: string,
): CardRecord[][] {
  const baseCard: CardRecord = {
    tenantId: currentTenantId,
    cardId: normalizedUID,
    userId: null,
    status: "active",
    balance: 0,
    counter: 0,
    keyVersion: 1,
    createdAt: 1700000000,
    lastActivityAt: null,
    expiresAt: null,
    notes: null,
  };

  const otherTenantId = currentTenantId === "other" ? "another" : "other";

  return [
    // Empty DB - no cards
    [],
    // Card exists in same tenant
    [{ ...baseCard, tenantId: currentTenantId }],
    // Card exists in different tenant
    [{ ...baseCard, tenantId: otherTenantId }],
    // Card exists but is deleted (should be filtered out)
    [{ ...baseCard, status: "deleted" }],
  ];
}
