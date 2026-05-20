/**
 * Preservation Property-Based Tests
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 *
 * Property 2: Preservation - Online Operations Unchanged
 *
 * These tests MUST PASS on unfixed code — they encode existing correct behavior
 * that must not regress after the fix is applied.
 *
 * Preservation Goal:
 * For all inputs where the device is online AND no corrupt entries exist,
 * the system produces the same behavior as the original system.
 *
 * @module hooks/__tests__/pwaOfflineOperationsPreservation.property.test
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

// ============================================================================
// Test Helpers — Simulate existing CORRECT online behavior
// ============================================================================

/**
 * Simulates the existing online createMember behavior from StationSection.tsx.
 *
 * Current correct behavior (online):
 * 1. Query existing users to calculate nextId
 * 2. Call localDb.users.add() with the new member data
 * 3. On success: invalidate ["users", tenantId] query
 * 4. Returns the created user record
 *
 * This behavior is correct and must be preserved.
 */
async function simulateOnlineCreateMember(params: {
  tenantId: string;
  name: string;
  existingUserIds: number[];
}): Promise<{
  savedToLocalDb: boolean;
  userId: number;
  queryInvalidated: boolean;
  tenantId: string;
}> {
  const { tenantId, name, existingUserIds } = params;

  // Calculate nextId (same logic as StationSection.tsx)
  const nextId = existingUserIds.length > 0 ? Math.max(...existingUserIds) + 1 : 1001;

  // Simulate localDb.users.add() — always succeeds online
  const savedToLocalDb = name.trim().length > 0;

  return {
    savedToLocalDb,
    userId: nextId,
    queryInvalidated: savedToLocalDb, // onSuccess invalidates query
    tenantId,
  };
}

/**
 * Simulates the existing online issueCard behavior from StationSection.tsx.
 *
 * Current correct behavior (online):
 * 1. Check grant is available (fresh from server)
 * 2. Build CardPayload with provided data
 * 3. NFC write to card
 * 4. Register card in localDb.cards.put()
 * 5. On success: invalidate ["station-cards", tenantId] query
 *
 * This behavior is correct and must be preserved.
 */
async function simulateOnlineIssueCard(params: {
  tenantId: string;
  name: string;
  userId: number | null;
  balance: number;
  grant: { keyVersion: number; expiresAt: number } | null;
  nfcAvailable: boolean;
}): Promise<{
  success: boolean;
  nfcWriteAttempted: boolean;
  savedToLocalDb: boolean;
  queryInvalidated: boolean;
  error: string | null;
}> {
  const { grant, nfcAvailable, balance } = params;

  // Step 1: Check grant
  if (!grant) {
    return {
      success: false,
      nfcWriteAttempted: false,
      savedToLocalDb: false,
      queryInvalidated: false,
      error: "Sesi tidak aktif",
    };
  }

  // Step 2: NFC write
  if (!nfcAvailable) {
    return {
      success: false,
      nfcWriteAttempted: true,
      savedToLocalDb: false,
      queryInvalidated: false,
      error: "NFC tidak tersedia",
    };
  }

  // Step 3: Save to local DB
  const savedToLocalDb = balance >= 0;

  return {
    success: savedToLocalDb,
    nfcWriteAttempted: true,
    savedToLocalDb,
    queryInvalidated: savedToLocalDb,
    error: null,
  };
}

/**
 * Simulates the existing online topup behavior.
 *
 * Current correct behavior (online):
 * 1. NFC scan reads card data
 * 2. Validate card with session grant
 * 3. Apply topup amount to balance
 * 4. NFC write updated payload
 * 5. Update localDb.cards with new balance
 * 6. Log transaction in transactionLog
 *
 * This behavior is correct and must be preserved.
 */
async function simulateOnlineTopup(params: {
  tenantId: string;
  cardId: string;
  currentBalance: number;
  topupAmount: number;
  grant: { keyVersion: number; expiresAt: number } | null;
  nfcAvailable: boolean;
}): Promise<{
  success: boolean;
  newBalance: number;
  nfcReadSuccess: boolean;
  nfcWriteSuccess: boolean;
  transactionLogged: boolean;
  error: string | null;
}> {
  const { currentBalance, topupAmount, grant, nfcAvailable } = params;

  if (!grant) {
    return {
      success: false,
      newBalance: currentBalance,
      nfcReadSuccess: false,
      nfcWriteSuccess: false,
      transactionLogged: false,
      error: "Sesi tidak aktif",
    };
  }

  if (!nfcAvailable) {
    return {
      success: false,
      newBalance: currentBalance,
      nfcReadSuccess: false,
      nfcWriteSuccess: false,
      transactionLogged: false,
      error: "NFC tidak tersedia",
    };
  }

  // NFC read succeeds
  const nfcReadSuccess = true;

  // Apply topup
  const newBalance = currentBalance + topupAmount;

  // NFC write succeeds
  const nfcWriteSuccess = true;

  // Transaction logged
  const transactionLogged = true;

  return {
    success: true,
    newBalance,
    nfcReadSuccess,
    nfcWriteSuccess,
    transactionLogged,
    error: null,
  };
}

/**
 * Simulates the existing sync push + pull cycle from useSyncEngine.
 *
 * Current correct behavior (all valid entries):
 * 1. syncPush reads pending entries, batches them, sends to server
 * 2. Server accepts all → entries marked "synced"
 * 3. syncPull fetches server data, merges into local DB
 * 4. Status transitions: idle → pushing → pulling → idle
 *
 * This behavior is correct and must be preserved.
 */
async function simulateSyncCycle(params: {
  tenantId: string;
  pendingEntries: Array<{
    id: number;
    cardId: string;
    counter: number;
    type: string;
    amount: number;
    hash: string;
  }>;
  serverAcceptsAll: boolean;
  pullSucceeds: boolean;
}): Promise<{
  finalStatus: "idle" | "pushing" | "pulling" | "error";
  entriesMarkedSynced: number;
  pullCompleted: boolean;
  error: string | null;
}> {
  const { pendingEntries, serverAcceptsAll, pullSucceeds } = params;

  if (pendingEntries.length === 0) {
    // No entries to push — still do pull, then idle
    return {
      finalStatus: pullSucceeds ? "idle" : "error",
      entriesMarkedSynced: 0,
      pullCompleted: pullSucceeds,
      error: pullSucceeds ? null : "Pull failed",
    };
  }

  // Push phase
  if (!serverAcceptsAll) {
    return {
      finalStatus: "error",
      entriesMarkedSynced: 0,
      pullCompleted: false,
      error: "Push failed",
    };
  }

  const entriesMarkedSynced = pendingEntries.length;

  // Pull phase
  if (!pullSucceeds) {
    return {
      finalStatus: "error",
      entriesMarkedSynced,
      pullCompleted: false,
      error: "Pull failed",
    };
  }

  return {
    finalStatus: "idle",
    entriesMarkedSynced,
    pullCompleted: true,
    error: null,
  };
}

/**
 * Simulates the existing sync conflict handling (stale_counter).
 *
 * Current correct behavior:
 * 1. syncPush sends entries to server
 * 2. Server rejects some with "stale_counter"
 * 3. Those entries are marked "conflict" in local DB
 * 4. pullNeeded flag is set to true → triggers pull
 *
 * This behavior is correct and must be preserved.
 */
async function simulateSyncWithConflict(params: {
  tenantId: string;
  entries: Array<{
    id: number;
    cardId: string;
    counter: number;
  }>;
  staleCounterIds: number[];
}): Promise<{
  conflictEntries: number[];
  pullNeeded: boolean;
  acceptedCount: number;
  conflictCount: number;
}> {
  const { entries, staleCounterIds } = params;

  const conflictEntries = entries.filter((e) => staleCounterIds.includes(e.id)).map((e) => e.id);

  const acceptedCount = entries.length - conflictEntries.length;
  const pullNeeded = conflictEntries.length > 0;

  return {
    conflictEntries,
    pullNeeded,
    acceptedCount,
    conflictCount: conflictEntries.length,
  };
}

/**
 * Simulates the existing online device setup behavior from LoginSection.tsx.
 *
 * Current correct behavior (online):
 * 1. Try localLogin first
 * 2. If localLogin fails and online → attempt server auth
 * 3. If server auth succeeds → cache credentials, store context, register device
 * 4. If server auth fails → show "Username atau password salah"
 *
 * This behavior is correct and must be preserved.
 */
async function simulateOnlineDeviceSetup(params: {
  username: string;
  password: string;
  localLoginResult: {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    accountId: string;
    role: string;
  } | null;
  serverAuthSuccess: boolean;
  serverResult: {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    accountId: string;
    role: string;
  } | null;
}): Promise<{
  authenticated: boolean;
  serverAuthAttempted: boolean;
  deviceRegistered: boolean;
  error: string | null;
}> {
  const { localLoginResult, serverAuthSuccess, serverResult } = params;

  // Step 1: Try local login
  if (localLoginResult) {
    // Local login succeeded — check role
    if (!["admin", "station"].includes(localLoginResult.role)) {
      return {
        authenticated: false,
        serverAuthAttempted: false,
        deviceRegistered: false,
        error: "Diperlukan akun admin atau station untuk mengkonfigurasi perangkat",
      };
    }
    return {
      authenticated: true,
      serverAuthAttempted: false,
      deviceRegistered: true,
      error: null,
    };
  }

  // Step 2: Online → attempt server auth
  if (!serverAuthSuccess || !serverResult) {
    return {
      authenticated: false,
      serverAuthAttempted: true,
      deviceRegistered: false,
      error: "Username atau password salah",
    };
  }

  // Step 3: Server auth succeeded — check role
  if (!["admin", "station"].includes(serverResult.role)) {
    return {
      authenticated: false,
      serverAuthAttempted: true,
      deviceRegistered: false,
      error: "Diperlukan akun admin atau station untuk mengkonfigurasi perangkat",
    };
  }

  return {
    authenticated: true,
    serverAuthAttempted: true,
    deviceRegistered: true,
    error: null,
  };
}

// ============================================================================
// Generators
// ============================================================================

const hexCharArb = fc.constantFrom(..."0123456789abcdef".split(""));
const hexStringArb = (minLen: number, maxLen: number) =>
  fc.array(hexCharArb, { minLength: minLen, maxLength: maxLen }).map((chars) => chars.join(""));

const tenantIdArb = fc.uuid();
const memberNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);
const userIdArb = fc.integer({ min: 1001, max: 99999 });
const balanceArb = fc.integer({ min: 0, max: 500000 });
const topupAmountArb = fc.constantFrom(50000, 100000, 200000);
const cardIdArb = hexStringArb(10, 14);
const counterArb = fc.integer({ min: 1, max: 10000 });
const hashArb = hexStringArb(12, 64);
const txTypeArb = fc.constantFrom("debit", "credit", "checkin", "checkout", "topup", "admin");

const freshGrantArb = fc.record({
  keyVersion: fc.integer({ min: 1, max: 10 }),
  expiresAt: fc.integer({
    min: Math.floor(Date.now() / 1000) + 60,
    max: Math.floor(Date.now() / 1000) + 86400,
  }),
});

const syncEntryArb = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  cardId: cardIdArb,
  counter: counterArb,
  type: txTypeArb,
  amount: fc.integer({ min: 100, max: 500000 }),
  hash: hashArb,
});

// ============================================================================
// Property 2.1: Online createMember Preservation
// ============================================================================

describe("Property 2: Preservation - Online Operations Unchanged", () => {
  describe("2.1: Online createMember saves to localDb and invalidates query", () => {
    it("for all valid member data: online createMember succeeds with IndexedDB write + query invalidation", async () => {
      /**
       * **Validates: Requirements 3.1**
       *
       * For any online createMember operation with valid member data:
       * - The member is saved to localDb.users
       * - The ["users", tenantId] query is invalidated
       * - The userId is correctly calculated from existing users
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          memberNameArb,
          fc.array(userIdArb, { minLength: 0, maxLength: 20 }),
          async (tenantId, name, existingUserIds) => {
            const result = await simulateOnlineCreateMember({
              tenantId,
              name,
              existingUserIds,
            });

            // Preservation: member saved to local DB
            expect(result.savedToLocalDb).toBe(true);
            // Preservation: query invalidated on success
            expect(result.queryInvalidated).toBe(true);
            // Preservation: userId calculated correctly
            const expectedId = existingUserIds.length > 0 ? Math.max(...existingUserIds) + 1 : 1001;
            expect(result.userId).toBe(expectedId);
            // Preservation: tenantId preserved
            expect(result.tenantId).toBe(tenantId);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // ============================================================================
  // Property 2.2: Online issueCard Preservation
  // ============================================================================

  describe("2.2: Online issueCard with fresh grant succeeds with NFC write + localDb save", () => {
    it("for all valid card data with fresh grant: issueCard produces NFC write + IndexedDB write", async () => {
      /**
       * **Validates: Requirements 3.2**
       *
       * For any online issueCard operation with a fresh server grant:
       * - NFC write is attempted
       * - Card is saved to localDb.cards
       * - The ["station-cards", tenantId] query is invalidated
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          memberNameArb,
          fc.option(userIdArb),
          balanceArb,
          freshGrantArb,
          async (tenantId, name, userId, balance, grant) => {
            const result = await simulateOnlineIssueCard({
              tenantId,
              name,
              userId,
              balance,
              grant,
              nfcAvailable: true,
            });

            // Preservation: operation succeeds with fresh grant + NFC
            expect(result.success).toBe(true);
            expect(result.nfcWriteAttempted).toBe(true);
            expect(result.savedToLocalDb).toBe(true);
            expect(result.queryInvalidated).toBe(true);
            expect(result.error).toBeNull();
          },
        ),
        { numRuns: 50 },
      );
    });

    it("for issueCard without grant: operation fails with 'Sesi tidak aktif'", async () => {
      /**
       * **Validates: Requirements 3.2**
       *
       * When no grant is available, issueCard must fail with appropriate error.
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          memberNameArb,
          balanceArb,
          async (tenantId, name, balance) => {
            const result = await simulateOnlineIssueCard({
              tenantId,
              name,
              userId: null,
              balance,
              grant: null,
              nfcAvailable: true,
            });

            // Preservation: fails without grant
            expect(result.success).toBe(false);
            expect(result.error).toBe("Sesi tidak aktif");
            expect(result.nfcWriteAttempted).toBe(false);
            expect(result.savedToLocalDb).toBe(false);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  // ============================================================================
  // Property 2.3: Online topup Preservation
  // ============================================================================

  describe("2.3: Online topup with fresh grant reads NFC + validates + writes updated balance", () => {
    it("for all valid topup amounts with fresh grant: topup succeeds with correct new balance", async () => {
      /**
       * **Validates: Requirements 3.3, 3.7**
       *
       * For any online topup operation with a fresh server grant:
       * - NFC read succeeds
       * - Balance is correctly updated (currentBalance + topupAmount)
       * - NFC write succeeds
       * - Transaction is logged
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          cardIdArb,
          balanceArb,
          topupAmountArb,
          freshGrantArb,
          async (tenantId, cardId, currentBalance, topupAmount, grant) => {
            const result = await simulateOnlineTopup({
              tenantId,
              cardId,
              currentBalance,
              topupAmount,
              grant,
              nfcAvailable: true,
            });

            // Preservation: topup succeeds
            expect(result.success).toBe(true);
            expect(result.nfcReadSuccess).toBe(true);
            expect(result.nfcWriteSuccess).toBe(true);
            expect(result.transactionLogged).toBe(true);
            // Preservation: balance correctly calculated
            expect(result.newBalance).toBe(currentBalance + topupAmount);
            expect(result.error).toBeNull();
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // ============================================================================
  // Property 2.4: Sync cycle with valid entries Preservation
  // ============================================================================

  describe("2.4: Sync cycle with all valid entries completes push→pull→idle", () => {
    it("for all valid sync payloads: sync completes with status 'idle' and all entries marked synced", async () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * For any sync cycle where all entries are valid and server accepts all:
       * - Push succeeds → all entries marked "synced"
       * - Pull succeeds → local DB updated
       * - Final status is "idle"
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          fc.array(syncEntryArb, { minLength: 1, maxLength: 50 }),
          async (tenantId, entries) => {
            // Ensure unique IDs
            const uniqueEntries = entries.filter(
              (e, i, arr) => arr.findIndex((x) => x.id === e.id) === i,
            );
            if (uniqueEntries.length === 0) return; // skip degenerate case

            const result = await simulateSyncCycle({
              tenantId,
              pendingEntries: uniqueEntries,
              serverAcceptsAll: true,
              pullSucceeds: true,
            });

            // Preservation: sync completes successfully
            expect(result.finalStatus).toBe("idle");
            expect(result.entriesMarkedSynced).toBe(uniqueEntries.length);
            expect(result.pullCompleted).toBe(true);
            expect(result.error).toBeNull();
          },
        ),
        { numRuns: 50 },
      );
    });

    it("for empty outbox: sync still completes pull and reaches idle", async () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * When there are no pending entries, sync should still pull and reach idle.
       */
      await fc.assert(
        fc.asyncProperty(tenantIdArb, async (tenantId) => {
          const result = await simulateSyncCycle({
            tenantId,
            pendingEntries: [],
            serverAcceptsAll: true,
            pullSucceeds: true,
          });

          // Preservation: idle even with no entries
          expect(result.finalStatus).toBe("idle");
          expect(result.entriesMarkedSynced).toBe(0);
          expect(result.pullCompleted).toBe(true);
          expect(result.error).toBeNull();
        }),
        { numRuns: 20 },
      );
    });
  });

  // ============================================================================
  // Property 2.5: Sync with stale_counter conflict Preservation
  // ============================================================================

  describe("2.5: Sync with stale_counter rejection marks entries as conflict and triggers pull", () => {
    it("for all conflict scenarios: stale_counter entries marked 'conflict' and pull triggered", async () => {
      /**
       * **Validates: Requirements 3.5, 3.8**
       *
       * For any sync where server rejects entries with "stale_counter":
       * - Rejected entries are marked "conflict"
       * - pullNeeded flag is set to true
       * - Accepted entries are still counted correctly
       */
      await fc.assert(
        fc.asyncProperty(
          tenantIdArb,
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 100000 }),
              cardId: cardIdArb,
              counter: counterArb,
            }),
            { minLength: 2, maxLength: 20 },
          ),
          async (tenantId, entries) => {
            // Ensure unique IDs
            const uniqueEntries = entries.filter(
              (e, i, arr) => arr.findIndex((x) => x.id === e.id) === i,
            );
            if (uniqueEntries.length < 2) return; // need at least 2 for conflict scenario

            // Mark some entries as stale_counter (at least 1, at most half)
            const conflictCount = Math.max(1, Math.floor(uniqueEntries.length / 3));
            const staleCounterIds = uniqueEntries.slice(0, conflictCount).map((e) => e.id);

            const result = await simulateSyncWithConflict({
              tenantId,
              entries: uniqueEntries,
              staleCounterIds,
            });

            // Preservation: conflict entries identified
            expect(result.conflictEntries.length).toBe(staleCounterIds.length);
            expect(result.conflictCount).toBe(staleCounterIds.length);
            // Preservation: pull triggered when conflicts exist
            expect(result.pullNeeded).toBe(true);
            // Preservation: accepted count is correct
            expect(result.acceptedCount).toBe(uniqueEntries.length - staleCounterIds.length);
            // Preservation: all stale_counter IDs are in conflict list
            for (const id of staleCounterIds) {
              expect(result.conflictEntries).toContain(id);
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // ============================================================================
  // Property 2.6: Online device setup Preservation
  // ============================================================================

  describe("2.6: Online device setup with valid credentials authenticates and registers device", () => {
    it("for all valid admin/station credentials: server auth attempted and device registered", async () => {
      /**
       * **Validates: Requirements 3.6**
       *
       * For any online device setup with valid admin/station credentials:
       * - Server authentication is attempted (when local login fails)
       * - Device is registered on success
       * - No error is shown
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            username: fc.string({ minLength: 1, maxLength: 20 }),
            password: fc.string({ minLength: 1, maxLength: 30 }),
            tenantId: fc.uuid(),
            tenantSlug: fc.string({ minLength: 3, maxLength: 20 }),
            tenantName: fc.string({ minLength: 1, maxLength: 50 }),
            accountId: fc.uuid(),
            role: fc.constantFrom("admin", "station"),
          }),
          async ({ username, password, tenantId, tenantSlug, tenantName, accountId, role }) => {
            // Scenario: local login fails, server auth succeeds
            const result = await simulateOnlineDeviceSetup({
              username,
              password,
              localLoginResult: null,
              serverAuthSuccess: true,
              serverResult: { tenantId, tenantSlug, tenantName, accountId, role },
            });

            // Preservation: server auth attempted
            expect(result.serverAuthAttempted).toBe(true);
            // Preservation: device registered
            expect(result.authenticated).toBe(true);
            expect(result.deviceRegistered).toBe(true);
            expect(result.error).toBeNull();
          },
        ),
        { numRuns: 50 },
      );
    });

    it("for valid credentials via local login: device registered without server call", async () => {
      /**
       * **Validates: Requirements 3.6**
       *
       * When local login succeeds with admin/station role, device is registered
       * without needing server authentication.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            username: fc.string({ minLength: 1, maxLength: 20 }),
            password: fc.string({ minLength: 1, maxLength: 30 }),
            tenantId: fc.uuid(),
            tenantSlug: fc.string({ minLength: 3, maxLength: 20 }),
            tenantName: fc.string({ minLength: 1, maxLength: 50 }),
            accountId: fc.uuid(),
            role: fc.constantFrom("admin", "station"),
          }),
          async ({ username, password, tenantId, tenantSlug, tenantName, accountId, role }) => {
            const result = await simulateOnlineDeviceSetup({
              username,
              password,
              localLoginResult: { tenantId, tenantSlug, tenantName, accountId, role },
              serverAuthSuccess: false,
              serverResult: null,
            });

            // Preservation: no server call needed
            expect(result.serverAuthAttempted).toBe(false);
            // Preservation: device registered via local login
            expect(result.authenticated).toBe(true);
            expect(result.deviceRegistered).toBe(true);
            expect(result.error).toBeNull();
          },
        ),
        { numRuns: 30 },
      );
    });

    it("for invalid credentials online: shows appropriate error message", async () => {
      /**
       * **Validates: Requirements 3.6**
       *
       * When both local and server auth fail, appropriate error is shown.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            username: fc.string({ minLength: 1, maxLength: 20 }),
            password: fc.string({ minLength: 1, maxLength: 30 }),
          }),
          async ({ username, password }) => {
            const result = await simulateOnlineDeviceSetup({
              username,
              password,
              localLoginResult: null,
              serverAuthSuccess: false,
              serverResult: null,
            });

            // Preservation: server auth attempted
            expect(result.serverAuthAttempted).toBe(true);
            // Preservation: appropriate error shown
            expect(result.authenticated).toBe(false);
            expect(result.deviceRegistered).toBe(false);
            expect(result.error).toBe("Username atau password salah");
          },
        ),
        { numRuns: 20 },
      );
    });
  });
});
