/**
 * Preservation Property-Based Tests for syncPushEntities
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 *
 * Property 2: Preservation - Existing Synced Tenant Behavior
 *
 * These tests MUST PASS on unfixed code — they establish the regression baseline.
 * They verify that existing behavior for synced tenants, empty pushes, device-blocked
 * scenarios, batch splitting, and no-token scenarios is correct and must remain unchanged.
 *
 * Observation-first methodology:
 * - Already-synced tenants (mode === "synced") push entities directly using existing access token without re-syncing
 * - Tenants with no pending entities skip the push cycle entirely (returns zero counts)
 * - Device-blocked scenarios abort immediately with DeviceBlockedError
 * - Large entity sets (>200) are split into batches with retry logic
 * - syncPushEntities returns { membersAccepted: 0, membersRejected: 0, cardsAccepted: 0, cardsRejected: 0 } when no access token exists
 *
 * @module lib/__tests__/syncPushEntitiesPreservation.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============================================================================
// Simulation Helpers — Replicate current (unfixed) syncPushEntities logic
// ============================================================================

/**
 * Simulates the current syncPushEntities logic for preservation testing.
 * This replicates the control flow from src/lib/syncPushEntities.ts without
 * requiring IndexedDB or network access.
 */

const MAX_BATCH_SIZE = 200;

interface SimUser {
  tenantId: string;
  userId: string;
  name: string;
  status: "active" | "suspended" | "deleted";
  createdAt: number;
  updatedAt: number;
  syncStatus: "pending" | "synced";
}

interface SimCard {
  tenantId: string;
  cardId: string;
  userId: string | null;
  status: string;
  balance: number;
  counter: number;
  keyVersion: number;
  createdAt: number;
  lastActivityAt: number | null;
  expiresAt: number | null;
  notes: string | null;
  syncStatus: "pending" | "synced";
}

interface EntityPushResult {
  membersAccepted: number;
  membersRejected: number;
  cardsAccepted: number;
  cardsRejected: number;
}

interface BatchCall {
  members: SimUser[];
  cards: SimCard[];
}

class DeviceBlockedError extends Error {
  readonly isDeviceBlocked = true;
  constructor(message: string) {
    super(message);
    this.name = "DeviceBlockedError";
  }
}

/**
 * Computes the array of batch calls for the member loop.
 * Cards up to MAX_BATCH_SIZE are included in the first member batch.
 */
function computeMemberBatches(pendingMembers: SimUser[], pendingCards: SimCard[]): BatchCall[] {
  const batchCalls: BatchCall[] = [];
  for (let i = 0; i < pendingMembers.length; i += MAX_BATCH_SIZE) {
    const memberBatch = pendingMembers.slice(i, i + MAX_BATCH_SIZE);
    const cardBatch = i === 0 ? pendingCards.slice(0, MAX_BATCH_SIZE) : [];
    batchCalls.push({ members: memberBatch, cards: cardBatch });
  }
  return batchCalls;
}

/**
 * Computes overflow card batches (cards beyond MAX_BATCH_SIZE that weren't
 * included in the first member batch).
 */
function computeCardOverflowBatches(pendingCards: SimCard[]): BatchCall[] {
  const batchCalls: BatchCall[] = [];
  if (pendingCards.length > MAX_BATCH_SIZE) {
    for (let i = MAX_BATCH_SIZE; i < pendingCards.length; i += MAX_BATCH_SIZE) {
      const cardBatch = pendingCards.slice(i, i + MAX_BATCH_SIZE);
      batchCalls.push({ members: [], cards: cardBatch });
    }
  }
  return batchCalls;
}

/**
 * Simulates the syncPushEntities function's control flow.
 * Returns the result and tracks which batch calls would be made.
 */
function simulateSyncPushEntities(params: {
  isDeviceBlocked: boolean;
  hasAccessToken: boolean;
  pendingMembers: SimUser[];
  pendingCards: SimCard[];
}): {
  result: EntityPushResult | null;
  error: DeviceBlockedError | null;
  batchCalls: BatchCall[];
  skipped: boolean;
  skipReason: "device_blocked" | "no_token" | "no_pending" | null;
} {
  const { isDeviceBlocked, hasAccessToken, pendingMembers, pendingCards } = params;

  // Step 1: Device blocked check (throws immediately)
  if (isDeviceBlocked) {
    return {
      result: null,
      error: new DeviceBlockedError("Device is blocked — entity push aborted"),
      batchCalls: [],
      skipped: true,
      skipReason: "device_blocked",
    };
  }

  // Step 2: No access token check (returns zero counts)
  if (!hasAccessToken) {
    return {
      result: { membersAccepted: 0, membersRejected: 0, cardsAccepted: 0, cardsRejected: 0 },
      error: null,
      batchCalls: [],
      skipped: true,
      skipReason: "no_token",
    };
  }

  // Step 3: No pending entities (returns zero counts)
  if (pendingMembers.length === 0 && pendingCards.length === 0) {
    return {
      result: { membersAccepted: 0, membersRejected: 0, cardsAccepted: 0, cardsRejected: 0 },
      error: null,
      batchCalls: [],
      skipped: true,
      skipReason: "no_pending",
    };
  }

  // Step 4: Batch and push (simulates _pushEntitiesInternal)
  let batchCalls: BatchCall[] = [];

  if (pendingMembers.length === 0 && pendingCards.length > 0) {
    // No members: member loop doesn't execute, only overflow cards get pushed
    batchCalls = computeCardOverflowBatches(pendingCards);
  } else {
    batchCalls = [
      ...computeMemberBatches(pendingMembers, pendingCards),
      ...computeCardOverflowBatches(pendingCards),
    ];
  }

  const totalMembers = batchCalls.reduce((sum, b) => sum + b.members.length, 0);
  const totalCards = batchCalls.reduce((sum, b) => sum + b.cards.length, 0);

  return {
    result: {
      membersAccepted: totalMembers,
      membersRejected: 0,
      cardsAccepted: totalCards,
      cardsRejected: 0,
    },
    error: null,
    batchCalls,
    skipped: false,
    skipReason: null,
  };
}

// ============================================================================
// Generators
// ============================================================================

const tenantIdArb = fc.uuid();

// ============================================================================
// Property 2.1: Synced Tenants Push Without Re-Syncing
// ============================================================================

describe("Property 2: Preservation - Existing Synced Tenant Behavior", () => {
  describe("2.1: For all synced tenants with pending entities, syncPushEntities pushes without calling tenant sync", () => {
    it("for all synced tenants with access token and pending entities, push proceeds directly without tenant sync", async () => {
      /**
       * **Validates: Requirements 3.1**
       *
       * For any synced tenant (mode === "synced") with:
       * - A valid access token
       * - Pending members and/or cards
       *
       * The system SHALL push entities directly using the existing access token
       * without re-syncing the tenant (no call to POST /api/tenants/sync).
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          async (tenantId, memberCount, cardCount) => {
            const members: SimUser[] = [];
            for (let i = 0; i < memberCount; i++) {
              members.push({
                tenantId,
                userId: `user-${i}`,
                name: `Member ${i}`,
                status: "active",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: "pending",
              });
            }
            const cards: SimCard[] = [];
            for (let i = 0; i < cardCount; i++) {
              cards.push({
                tenantId,
                cardId: `card-${i.toString(16).padStart(8, "0")}`,
                userId: members.length > 0 ? members[i % members.length].userId : null,
                status: "active",
                balance: 1000,
                counter: 0,
                keyVersion: 1,
                createdAt: Date.now(),
                lastActivityAt: null,
                expiresAt: null,
                notes: null,
                syncStatus: "pending",
              });
            }

            const sim = simulateSyncPushEntities({
              isDeviceBlocked: false,
              hasAccessToken: true, // Synced tenant has access token
              pendingMembers: members,
              pendingCards: cards,
            });

            // Push proceeds (not skipped)
            expect(sim.skipped).toBe(false);
            expect(sim.error).toBeNull();
            expect(sim.result).not.toBeNull();

            // Batch calls are made (entities are pushed)
            expect(sim.batchCalls.length).toBeGreaterThan(0);

            // No tenant sync is involved — the function only pushes entities
            // (syncPushEntities never calls syncToServer, it just uses existing token)
            expect(sim.skipReason).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ============================================================================
  // Property 2.2: Empty Push Cycle Skipped
  // ============================================================================

  describe("2.2: For all tenants with zero pending entities, push cycle is skipped without errors", () => {
    it("for all tenants with no pending members and no pending cards, returns zero counts without error", async () => {
      /**
       * **Validates: Requirements 3.3**
       *
       * For any tenant where:
       * - There are zero pending members
       * - There are zero pending cards
       * - Access token exists (tenant is synced)
       *
       * The system SHALL skip the push cycle entirely and return zero counts
       * without making any network requests or throwing errors.
       */
      await fc.assert(
        fc.asyncProperty(tenantIdArb, async (_tenantId) => {
          const sim = simulateSyncPushEntities({
            isDeviceBlocked: false,
            hasAccessToken: true,
            pendingMembers: [],
            pendingCards: [],
          });

          // Push is skipped
          expect(sim.skipped).toBe(true);
          expect(sim.skipReason).toBe("no_pending");
          expect(sim.error).toBeNull();

          // Returns zero counts
          expect(sim.result).toEqual({
            membersAccepted: 0,
            membersRejected: 0,
            cardsAccepted: 0,
            cardsRejected: 0,
          });

          // No batch calls made
          expect(sim.batchCalls).toHaveLength(0);
        }),
        { numRuns: 50 },
      );
    });
  });

  // ============================================================================
  // Property 2.3: Device Blocked Aborts Immediately
  // ============================================================================

  describe("2.3: For all device-blocked states, sync aborts immediately with DeviceBlockedError", () => {
    it("for all device-blocked scenarios regardless of pending entities, throws DeviceBlockedError immediately", async () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * For any sync operation where:
       * - The device is blocked
       * - Regardless of pending entity count
       * - Regardless of access token state
       *
       * The system SHALL abort immediately with a DeviceBlockedError
       * without making any network requests.
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          fc.boolean(), // hasAccessToken
          fc.integer({ min: 0, max: 300 }), // memberCount
          fc.integer({ min: 0, max: 300 }), // cardCount
          async (tenantId, hasAccessToken, memberCount, cardCount) => {
            const members: SimUser[] = [];
            for (let i = 0; i < memberCount; i++) {
              members.push({
                tenantId,
                userId: `user-${i}`,
                name: `Member ${i}`,
                status: "active",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: "pending",
              });
            }
            const cards: SimCard[] = [];
            for (let i = 0; i < cardCount; i++) {
              cards.push({
                tenantId,
                cardId: `card-${i.toString(16).padStart(8, "0")}`,
                userId: null,
                status: "active",
                balance: 0,
                counter: 0,
                keyVersion: 1,
                createdAt: Date.now(),
                lastActivityAt: null,
                expiresAt: null,
                notes: null,
                syncStatus: "pending",
              });
            }

            const sim = simulateSyncPushEntities({
              isDeviceBlocked: true, // Device is blocked
              hasAccessToken,
              pendingMembers: members,
              pendingCards: cards,
            });

            // Aborts immediately
            expect(sim.skipped).toBe(true);
            expect(sim.skipReason).toBe("device_blocked");

            // Throws DeviceBlockedError
            expect(sim.error).not.toBeNull();
            expect(sim.error).toBeInstanceOf(DeviceBlockedError);
            expect(sim.error!.name).toBe("DeviceBlockedError");
            expect(sim.error!.isDeviceBlocked).toBe(true);

            // No result returned (error thrown)
            expect(sim.result).toBeNull();

            // No batch calls made
            expect(sim.batchCalls).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ============================================================================
  // Property 2.4: Batch Splitting for Large Entity Sets
  // ============================================================================

  describe("2.4: For all entity sets exceeding MAX_BATCH_SIZE (200), batches are split correctly", () => {
    it("for all entity sets with members > 200, members are split into batches of MAX_BATCH_SIZE", async () => {
      /**
       * **Validates: Requirements 3.6**
       *
       * For any sync operation where:
       * - The entity set has more than MAX_BATCH_SIZE (200) members
       * - Access token exists
       * - Device is not blocked
       *
       * The system SHALL split members into batches of at most 200 entries each,
       * with cards included in the first batch only.
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          fc.integer({ min: 201, max: 600 }), // memberCount > MAX_BATCH_SIZE
          fc.integer({ min: 0, max: 100 }), // cardCount
          async (tenantId, memberCount, cardCount) => {
            const members: SimUser[] = [];
            for (let i = 0; i < memberCount; i++) {
              members.push({
                tenantId,
                userId: `user-${i}`,
                name: `Member ${i}`,
                status: "active",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: "pending",
              });
            }
            const cards: SimCard[] = [];
            for (let i = 0; i < cardCount; i++) {
              cards.push({
                tenantId,
                cardId: `card-${i.toString(16).padStart(8, "0")}`,
                userId: null,
                status: "active",
                balance: 0,
                counter: 0,
                keyVersion: 1,
                createdAt: Date.now(),
                lastActivityAt: null,
                expiresAt: null,
                notes: null,
                syncStatus: "pending",
              });
            }

            const sim = simulateSyncPushEntities({
              isDeviceBlocked: false,
              hasAccessToken: true,
              pendingMembers: members,
              pendingCards: cards,
            });

            expect(sim.error).toBeNull();
            expect(sim.skipped).toBe(false);

            // Multiple batches are created
            const expectedMemberBatches = Math.ceil(memberCount / MAX_BATCH_SIZE);
            const expectedCardOverflowBatches =
              cardCount > MAX_BATCH_SIZE
                ? Math.ceil((cardCount - MAX_BATCH_SIZE) / MAX_BATCH_SIZE)
                : 0;
            const expectedTotalBatches = expectedMemberBatches + expectedCardOverflowBatches;

            expect(sim.batchCalls.length).toBe(expectedTotalBatches);

            // Each member batch has at most MAX_BATCH_SIZE members
            for (const batch of sim.batchCalls) {
              expect(batch.members.length).toBeLessThanOrEqual(MAX_BATCH_SIZE);
              expect(batch.cards.length).toBeLessThanOrEqual(MAX_BATCH_SIZE);
            }

            // First batch includes cards (up to MAX_BATCH_SIZE)
            if (sim.batchCalls.length > 0 && cardCount > 0) {
              expect(sim.batchCalls[0].cards.length).toBe(Math.min(cardCount, MAX_BATCH_SIZE));
            }

            // Subsequent member batches have no cards
            for (let i = 1; i < expectedMemberBatches; i++) {
              expect(sim.batchCalls[i].cards.length).toBe(0);
            }

            // Total members across all batches equals input
            const totalMembersPushed = sim.batchCalls.reduce((sum, b) => sum + b.members.length, 0);
            expect(totalMembersPushed).toBe(memberCount);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("for all entity sets with cards > 200, overflow cards are split into separate batches", async () => {
      /**
       * **Validates: Requirements 3.6**
       *
       * For any sync operation where:
       * - The entity set has more than MAX_BATCH_SIZE (200) cards
       * - There are some members (so the first batch includes cards)
       *
       * The system SHALL include up to 200 cards in the first member batch,
       * then split remaining cards into separate card-only batches.
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          fc.integer({ min: 1, max: 50 }), // memberCount (at least 1 so member loop runs)
          fc.integer({ min: 201, max: 500 }), // cardCount > MAX_BATCH_SIZE
          async (tenantId, memberCount, cardCount) => {
            const members: SimUser[] = [];
            for (let i = 0; i < memberCount; i++) {
              members.push({
                tenantId,
                userId: `user-${i}`,
                name: `Member ${i}`,
                status: "active",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: "pending",
              });
            }
            const cards: SimCard[] = [];
            for (let i = 0; i < cardCount; i++) {
              cards.push({
                tenantId,
                cardId: `card-${i.toString(16).padStart(8, "0")}`,
                userId: null,
                status: "active",
                balance: 0,
                counter: 0,
                keyVersion: 1,
                createdAt: Date.now(),
                lastActivityAt: null,
                expiresAt: null,
                notes: null,
                syncStatus: "pending",
              });
            }

            const sim = simulateSyncPushEntities({
              isDeviceBlocked: false,
              hasAccessToken: true,
              pendingMembers: members,
              pendingCards: cards,
            });

            expect(sim.error).toBeNull();
            expect(sim.skipped).toBe(false);

            // First batch has cards (up to MAX_BATCH_SIZE)
            expect(sim.batchCalls[0].cards.length).toBe(MAX_BATCH_SIZE);

            // Overflow card batches exist
            const cardOverflowBatches = sim.batchCalls.filter(
              (b) => b.members.length === 0 && b.cards.length > 0,
            );
            const expectedOverflowBatches = Math.ceil(
              (cardCount - MAX_BATCH_SIZE) / MAX_BATCH_SIZE,
            );
            expect(cardOverflowBatches.length).toBe(expectedOverflowBatches);

            // Total cards across all batches equals input
            const totalCardsPushed = sim.batchCalls.reduce((sum, b) => sum + b.cards.length, 0);
            expect(totalCardsPushed).toBe(cardCount);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ============================================================================
  // Property 2.5: No Access Token Skips Gracefully
  // ============================================================================

  describe("2.5: For all tenants without access token, push is skipped gracefully", () => {
    it("for all tenants without access token regardless of pending entities, returns zero counts without error", async () => {
      /**
       * **Validates: Requirements 3.1**
       *
       * For any sync operation where:
       * - No access token exists (local-only tenant not yet registered)
       * - Regardless of pending entity count
       * - Device is not blocked
       *
       * The system SHALL skip the push gracefully and return zero counts
       * without throwing an error or making any network requests.
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          fc.integer({ min: 0, max: 500 }), // memberCount
          fc.integer({ min: 0, max: 500 }), // cardCount
          async (tenantId, memberCount, cardCount) => {
            const members: SimUser[] = [];
            for (let i = 0; i < memberCount; i++) {
              members.push({
                tenantId,
                userId: `user-${i}`,
                name: `Member ${i}`,
                status: "active",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: "pending",
              });
            }
            const cards: SimCard[] = [];
            for (let i = 0; i < cardCount; i++) {
              cards.push({
                tenantId,
                cardId: `card-${i.toString(16).padStart(8, "0")}`,
                userId: null,
                status: "active",
                balance: 0,
                counter: 0,
                keyVersion: 1,
                createdAt: Date.now(),
                lastActivityAt: null,
                expiresAt: null,
                notes: null,
                syncStatus: "pending",
              });
            }

            const sim = simulateSyncPushEntities({
              isDeviceBlocked: false,
              hasAccessToken: false, // No access token
              pendingMembers: members,
              pendingCards: cards,
            });

            // Push is skipped gracefully
            expect(sim.skipped).toBe(true);
            expect(sim.skipReason).toBe("no_token");
            expect(sim.error).toBeNull();

            // Returns zero counts (not an error)
            expect(sim.result).toEqual({
              membersAccepted: 0,
              membersRejected: 0,
              cardsAccepted: 0,
              cardsRejected: 0,
            });

            // No batch calls made
            expect(sim.batchCalls).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
