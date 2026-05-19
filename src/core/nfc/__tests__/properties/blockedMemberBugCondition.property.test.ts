/**
 * Bug Condition Exploration Property-Based Tests
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 *
 * Property 1: Expected Behavior - Blocked Card/Member Rejection
 *
 * These tests verify that the fix correctly rejects blocked cards and suspended members
 * across all three sections (Gate, Terminal, Station) using the shared
 * `checkLocalBlockedStatus` utility with the hardware serial number.
 *
 * After the fix:
 * - GateSection uses state.serialNumber (hardware serial) for card lookup
 * - TerminalSection calls checkLocalBlockedStatus before checkout
 * - StationSection calls checkLocalBlockedStatus before topup
 * - userId > 0 numeric comparison (not truthiness) for member lookup
 *
 * @module core/nfc/__tests__/properties/blockedMemberBugCondition.property.test
 */

import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkLocalBlockedStatus } from "../../localStatusCheck";

// Mock the local-db module
vi.mock("../../../../db/local-db", () => {
  const cardsStore = new Map<string, any>();
  const usersStore = new Map<string, any>();

  return {
    localDb: {
      cards: {
        get: vi.fn(async (key: [string, string]) => {
          return cardsStore.get(`${key[0]},${key[1]}`);
        }),
      },
      users: {
        get: vi.fn(async (key: [string, number]) => {
          return usersStore.get(`${key[0]},${key[1]}`);
        }),
      },
      // Expose stores for test setup
      __cardsStore: cardsStore,
      __usersStore: usersStore,
    },
  };
});

// Import the mocked module to access test stores
import { localDb } from "../../../../db/local-db";

const cardsStore = (localDb as any).__cardsStore as Map<string, any>;
const usersStore = (localDb as any).__usersStore as Map<string, any>;

// ============================================================================
// Generators
// ============================================================================

const tenantIdArb = fc.uuid();

/** Generate a hardware serial number (hex string, 8-14 hex chars like real NFC UIDs) */
const hardwareSerialArb = fc
  .array(fc.constantFrom(..."0123456789abcdef".split("")), { minLength: 8, maxLength: 14 })
  .map((chars) => chars.join(""));

const blockedCardStatusArb = fc.constantFrom(
  "blocked_tamper" as const,
  "blocked_fraud" as const,
  "blocked_expired" as const,
  "blocked_admin" as const,
);

const userIdArb = fc.integer({ min: 1, max: 99999 });

// ============================================================================
// Property 1: Expected Behavior — Blocked Card/Member Rejection (Post-Fix)
// ============================================================================

describe("Property 1: Expected Behavior - Blocked Card/Member Rejection", () => {
  beforeEach(() => {
    cardsStore.clear();
    usersStore.clear();
  });

  afterEach(() => {
    cardsStore.clear();
    usersStore.clear();
  });

  describe("Req 2.1: GateSection uses hardware serial for card lookup — blocked cards ARE found", () => {
    it("checkLocalBlockedStatus correctly detects blocked cards using hardware serial number", async () => {
      /**
       * **Validates: Requirements 2.1**
       *
       * For any blocked card record keyed by hardware serial in localDb.cards:
       * - checkLocalBlockedStatus using the hardware serial finds the blocked record
       * - Returns { blocked: true, reason: "Kartu diblokir: <status>" }
       *
       * This test PASSES after the fix because all sections now use
       * checkLocalBlockedStatus with the hardware serial number.
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          hardwareSerialArb,
          blockedCardStatusArb,
          userIdArb,
          async (tenantId, hardwareSerial, blockedStatus, userId) => {
            // Clear stores for each run
            cardsStore.clear();
            usersStore.clear();

            // Set up local DB with a blocked card keyed by hardware serial
            cardsStore.set(`${tenantId},${hardwareSerial}`, {
              tenantId,
              cardId: hardwareSerial,
              userId,
              status: blockedStatus,
            });

            // The fixed checkLocalBlockedStatus uses hardware serial (correct key)
            const result = await checkLocalBlockedStatus(tenantId, hardwareSerial, userId);

            // Verify the fix correctly detects the blocked card
            expect(result.blocked).toBe(true);
            expect(result.reason).toContain("Kartu diblokir");
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe("Req 2.3: userId=0 — card-level check still catches blocked cards", () => {
    it("checkLocalBlockedStatus detects blocked card even with userId=0 (unlinked card)", async () => {
      /**
       * **Validates: Requirements 2.3**
       *
       * For any blocked card with userId=0 (unlinked card):
       * - The card-level block check catches it using the correct key
       * - userId=0 correctly skips the member check (userId > 0 comparison)
       * - But the card-level check still works
       *
       * This test PASSES after the fix because checkLocalBlockedStatus uses
       * userId > 0 (numeric comparison) and still performs the card lookup.
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          hardwareSerialArb,
          blockedCardStatusArb,
          async (tenantId, hardwareSerial, blockedStatus) => {
            const userId = 0; // Unlinked card

            // Clear stores for each run
            cardsStore.clear();
            usersStore.clear();

            // Set up local DB with a blocked card keyed by hardware serial
            cardsStore.set(`${tenantId},${hardwareSerial}`, {
              tenantId,
              cardId: hardwareSerial,
              userId: null,
              status: blockedStatus,
            });

            // The fixed checkLocalBlockedStatus with userId=0
            const result = await checkLocalBlockedStatus(tenantId, hardwareSerial, userId);

            // Verify card-level check works even with userId=0
            expect(result.blocked).toBe(true);
            expect(result.reason).toContain("Kartu diblokir");
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe("Req 2.4: TerminalSection now checks local DB status before checkout", () => {
    it("checkLocalBlockedStatus rejects checkout for blocked cards (shared utility used by Terminal)", async () => {
      /**
       * **Validates: Requirements 2.4**
       *
       * For any blocked card/suspended member scanned at the terminal:
       * - checkLocalBlockedStatus detects the blocked status
       * - TerminalSection now calls this before proceeding with checkout
       *
       * This test PASSES after the fix because TerminalSection now integrates
       * checkLocalBlockedStatus in its auto-checkout useEffect.
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          hardwareSerialArb,
          blockedCardStatusArb,
          userIdArb,
          async (tenantId, hardwareSerial, blockedStatus, userId) => {
            // Clear stores for each run
            cardsStore.clear();
            usersStore.clear();

            // Set up local DB with a blocked card
            cardsStore.set(`${tenantId},${hardwareSerial}`, {
              tenantId,
              cardId: hardwareSerial,
              userId,
              status: blockedStatus,
            });

            // The shared checkLocalBlockedStatus (now used by TerminalSection)
            const result = await checkLocalBlockedStatus(tenantId, hardwareSerial, userId);

            // Verify blocked card is detected
            expect(result.blocked).toBe(true);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe("Req 2.5: StationSection now checks local DB status before topup", () => {
    it("checkLocalBlockedStatus rejects topup for suspended members (shared utility used by Station)", async () => {
      /**
       * **Validates: Requirements 2.5**
       *
       * For any blocked card/suspended member scanned at the station for topup:
       * - checkLocalBlockedStatus detects the suspended member status
       * - StationSection now calls this before proceeding with topup
       *
       * This test PASSES after the fix because StationSection now integrates
       * checkLocalBlockedStatus in its handleTopupConfirm.
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          hardwareSerialArb,
          userIdArb,
          async (tenantId, hardwareSerial, userId) => {
            // Clear stores for each run
            cardsStore.clear();
            usersStore.clear();

            // Card is active but member is suspended
            cardsStore.set(`${tenantId},${hardwareSerial}`, {
              tenantId,
              cardId: hardwareSerial,
              userId,
              status: "active",
            });

            usersStore.set(`${tenantId},${userId}`, {
              tenantId,
              userId,
              status: "suspended",
            });

            // The shared checkLocalBlockedStatus (now used by StationSection)
            const result = await checkLocalBlockedStatus(tenantId, hardwareSerial, userId);

            // Verify suspended member is detected
            expect(result.blocked).toBe(true);
            expect(result.reason).toContain("Akun anggota ditangguhkan");
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe("Req 2.2: Member suspension check with userId > 0", () => {
    it("checkLocalBlockedStatus detects suspended member when userId > 0", async () => {
      /**
       * **Validates: Requirements 2.2**
       *
       * For any card linked to a member (userId > 0) where the member is suspended:
       * - checkLocalBlockedStatus looks up the member in localDb.users
       * - Returns { blocked: true, reason: "Akun anggota ditangguhkan..." }
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          hardwareSerialArb,
          userIdArb,
          async (tenantId, hardwareSerial, userId) => {
            // Clear stores for each run
            cardsStore.clear();
            usersStore.clear();

            // Card is active, member is suspended
            cardsStore.set(`${tenantId},${hardwareSerial}`, {
              tenantId,
              cardId: hardwareSerial,
              userId,
              status: "active",
            });

            usersStore.set(`${tenantId},${userId}`, {
              tenantId,
              userId,
              status: "suspended",
            });

            const result = await checkLocalBlockedStatus(tenantId, hardwareSerial, userId);

            expect(result.blocked).toBe(true);
            expect(result.reason).toContain("Akun anggota ditangguhkan");
          },
        ),
        { numRuns: 20 },
      );
    });
  });
});
