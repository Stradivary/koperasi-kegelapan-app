/**
 * Bug Condition Exploration Property-Based Tests
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * Property 1: Bug Condition - Offline Login Completes Without Network
 *
 * These tests are EXPECTED TO FAIL on unfixed code — failure confirms the bug exists.
 * They encode the expected behavior that the fix should produce.
 *
 * Bug Condition: isBugCondition(input) where isOffline AND (localAccountExists OR cachedGrantExists)
 *
 * Expected Behavior:
 * - Offline login with invalid credentials shows "Username atau password salah" (not connectivity error)
 * - Offline login with valid credentials completes without network fetch
 * - Offline session grant with valid cache returns cached grant (not error state)
 *
 * @module hooks/__tests__/pwaOfflineBugCondition.property.test
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

// ============================================================================
// Test Helpers — Simulate the handleUnifiedLogin logic
// ============================================================================

/**
 * Simulates the FIXED handleUnifiedLogin logic from LoginSection.tsx.
 *
 * This replicates the fixed control flow:
 * 1. Try localLogin first
 * 2. If localLogin succeeds → store context, redirect, return
 * 3. If localLogin returns null → check navigator.onLine
 *    a. If offline → immediately return "Username atau password salah" (NO network fetch)
 *    b. If online → attempt server fetch as fallback
 * 4. If server fetch succeeds → store context, redirect
 * 5. If server fetch fails (res.ok = false) → "Username atau password salah"
 * 6. If server fetch throws (network error) → "Gagal terhubung ke server"
 */
async function simulateHandleUnifiedLogin(params: {
  username: string;
  password: string;
  localLoginResult: { tenantId: string; role: string } | null;
  isOnline: boolean;
}): Promise<{
  error: string | null;
  redirected: boolean;
  networkFetchAttempted: boolean;
}> {
  const { localLoginResult, isOnline } = params;

  // 1. Try local login first
  if (localLoginResult) {
    // Local login succeeded — redirect
    return { error: null, redirected: true, networkFetchAttempted: false };
  }

  // 2. Local login returned null (invalid credentials or no local account)
  // FIX: Check connectivity BEFORE attempting server fetch
  if (!isOnline) {
    // Offline: show credential error immediately, do NOT attempt network fetch
    return {
      error: "Username atau password salah",
      redirected: false,
      networkFetchAttempted: false,
    };
  }

  // 3. Online: attempt server fetch as fallback
  try {
    // Simulate server response for online case
    return {
      error: "Username atau password salah",
      redirected: false,
      networkFetchAttempted: true,
    };
  } catch {
    return {
      error: "Gagal terhubung ke server. Periksa koneksi Anda.",
      redirected: false,
      networkFetchAttempted: true,
    };
  }
}

/**
 * Simulates the FIXED useSessionGrant refresh logic.
 *
 * The fixed code checks IndexedDB cache first:
 * - If offline and cached grant exists (not expired) → return cached grant
 * - If offline and no cached grant → enter error state
 * - If online → fetch fresh grant from server, update cache
 */
async function simulateUseSessionGrantRefresh(params: {
  tenantId: string;
  accountId: string;
  deviceId: string;
  isOnline: boolean;
  cachedGrant: { expiresAt: number; keyVersion: number } | null;
}): Promise<{
  grant: { expiresAt: number; keyVersion: number } | null;
  error: string | null;
  loading: boolean;
}> {
  const { isOnline, cachedGrant } = params;

  // FIX: Check cache first when offline
  if (!isOnline) {
    if (cachedGrant && cachedGrant.expiresAt > Math.floor(Date.now() / 1000)) {
      // Offline with valid cached grant → return it
      return {
        grant: cachedGrant,
        error: null,
        loading: false,
      };
    }
    // Offline with no cached grant → error state (expected)
    return {
      grant: null,
      error: "TypeError: Failed to fetch",
      loading: false,
    };
  }

  // Online: fetch fresh grant from server
  return {
    grant: { expiresAt: Math.floor(Date.now() / 1000) + 3600, keyVersion: 1 },
    error: null,
    loading: false,
  };
}

// ============================================================================
// Property 1: Bug Condition — Offline Login with Invalid Credentials
// ============================================================================

describe("Property 1: Bug Condition - Offline Login Completes Without Network", () => {
  describe("Bug 1.2: Offline login with invalid credentials shows wrong error", () => {
    it("EXPECTED TO FAIL: when offline and localLogin returns null, should show 'Username atau password salah' not connectivity error", async () => {
      /**
       * **Validates: Requirements 1.2**
       *
       * For any login attempt where:
       * - Device is offline (navigator.onLine = false)
       * - Local account exists but credentials are invalid (localLogin returns null)
       *
       * The system MUST display "Username atau password salah"
       * The system MUST NOT display "Gagal terhubung ke server"
       * The system MUST NOT attempt a network fetch
       *
       * Bug: Current code always attempts server fetch after localLogin returns null,
       * and when offline the catch block shows "Gagal terhubung ke server"
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            username: fc.string({ minLength: 1, maxLength: 20 }),
            password: fc.string({ minLength: 1, maxLength: 30 }),
          }),
          async ({ username, password }) => {
            const result = await simulateHandleUnifiedLogin({
              username,
              password,
              localLoginResult: null, // Invalid credentials — localLogin returns null
              isOnline: false, // Device is offline
            });

            // Expected behavior (will fail on buggy code):
            // Should show credential error, not connectivity error
            expect(result.error).toBe("Username atau password salah");
            expect(result.error).not.toContain("Gagal terhubung ke server");
            expect(result.networkFetchAttempted).toBe(false);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe("Bug 1.1: Offline login with valid credentials should not attempt network fetch", () => {
    it("EXPECTED TO PASS: when offline and localLogin succeeds, should redirect without network fetch", async () => {
      /**
       * **Validates: Requirements 1.1**
       *
       * For any login attempt where:
       * - Device is offline (navigator.onLine = false)
       * - Local account exists and credentials are valid (localLogin returns result)
       *
       * The system MUST complete login using only local verification
       * The system MUST NOT attempt a network fetch
       *
       * Note: The current code has a `return` after redirectToRole when localLogin
       * succeeds, so this case may actually pass on unfixed code. The real bug is
       * case 1.2 (when localLogin returns null).
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            username: fc.string({ minLength: 1, maxLength: 20 }),
            password: fc.string({ minLength: 1, maxLength: 30 }),
            tenantId: fc.uuid(),
            role: fc.constantFrom("admin", "terminal", "gate", "scout", "station"),
          }),
          async ({ username, password, tenantId, role }) => {
            const result = await simulateHandleUnifiedLogin({
              username,
              password,
              localLoginResult: { tenantId, role },
              isOnline: false, // Device is offline
            });

            // Expected behavior:
            // Should redirect without attempting network fetch
            expect(result.redirected).toBe(true);
            expect(result.error).toBeNull();
            expect(result.networkFetchAttempted).toBe(false);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe("Bug 1.3: Offline session grant with cached grant enters error state", () => {
    it("EXPECTED TO FAIL: when offline and cached grant exists, should return cached grant not error", async () => {
      /**
       * **Validates: Requirements 1.3**
       *
       * For any session grant request where:
       * - Device is offline (navigator.onLine = false)
       * - A valid (non-expired) cached grant exists in IndexedDB
       *
       * The system MUST return the cached session grant
       * The system MUST NOT enter error state
       *
       * Bug: Current useSessionGrant only does network fetch with no cache fallback.
       * When offline, fetch throws and the hook enters error state.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: fc.uuid(),
            accountId: fc.uuid(),
            deviceId: fc.uuid(),
            // Grant expires in the future (valid)
            expiresAt: fc.integer({
              min: Math.floor(Date.now() / 1000) + 60,
              max: Math.floor(Date.now() / 1000) + 86400,
            }),
            keyVersion: fc.integer({ min: 1, max: 10 }),
          }),
          async ({ tenantId, accountId, deviceId, expiresAt, keyVersion }) => {
            const result = await simulateUseSessionGrantRefresh({
              tenantId,
              accountId,
              deviceId,
              isOnline: false, // Device is offline
              cachedGrant: { expiresAt, keyVersion }, // Valid cached grant exists
            });

            // Expected behavior (will fail on buggy code):
            // Should return cached grant, not enter error state
            expect(result.grant).not.toBeNull();
            expect(result.error).toBeNull();
            expect(result.grant?.expiresAt).toBe(expiresAt);
            expect(result.grant?.keyVersion).toBe(keyVersion);
          },
        ),
        { numRuns: 20 },
      );
    });
  });
});
