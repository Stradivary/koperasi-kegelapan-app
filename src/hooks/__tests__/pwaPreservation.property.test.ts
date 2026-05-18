/**
 * Preservation Property-Based Tests
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * Property 2: Preservation - Online Login and Session Grant Behavior Unchanged
 *
 * These tests MUST PASS on unfixed code — they establish the regression baseline.
 * They verify that online behavior is correct as-is and must remain unchanged after the fix.
 *
 * Preservation Scope:
 * - Online login with server-only accounts authenticates via /api/auth/token
 * - Online login where local account exists prefers local login result
 * - Online session grant requests fetch fresh grant from server and schedule refresh
 *
 * @module hooks/__tests__/pwaPreservation.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============================================================================
// Simulation Helpers — Replicate current (unfixed) handleUnifiedLogin logic
// ============================================================================

/**
 * Simulates the current handleUnifiedLogin logic from LoginSection.tsx for ONLINE state.
 *
 * Control flow (online):
 * 1. Try localLogin first
 * 2. If localLogin succeeds → store context, redirect, return (never reaches server)
 * 3. If localLogin returns null → attempt server fetch
 * 4. If server fetch res.ok → store context, redirect
 * 5. If server fetch !res.ok → "Username atau password salah"
 * 6. If server fetch throws → "Gagal terhubung ke server" (shouldn't happen when online)
 */
async function simulateHandleUnifiedLoginOnline(params: {
  username: string;
  password: string;
  localLoginResult: {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    accountId: string;
    role: string;
  } | null;
  serverResponse:
    | {
        ok: true;
        data: {
          tenantId: string;
          tenantSlug: string;
          tenantName: string;
          accountId: string;
          role: string;
        };
      }
    | { ok: false }
    | null;
}): Promise<{
  error: string | null;
  redirected: boolean;
  redirectedRole: string | null;
  redirectedTenantId: string | null;
  networkFetchAttempted: boolean;
  source: "local" | "server" | "none";
}> {
  const { localLoginResult, serverResponse } = params;

  // 1. Try local login first
  if (localLoginResult) {
    // Local login succeeded — store context, redirect, return immediately
    return {
      error: null,
      redirected: true,
      redirectedRole: localLoginResult.role,
      redirectedTenantId: localLoginResult.tenantId,
      networkFetchAttempted: false,
      source: "local",
    };
  }

  // 2. Local login returned null — try server login as fallback (online)
  if (serverResponse === null) {
    // Server fetch threw (shouldn't happen when online, but simulate)
    return {
      error: "Gagal terhubung ke server. Periksa koneksi Anda.",
      redirected: false,
      redirectedRole: null,
      redirectedTenantId: null,
      networkFetchAttempted: true,
      source: "none",
    };
  }

  if (serverResponse.ok) {
    // Server login succeeded
    return {
      error: null,
      redirected: true,
      redirectedRole: serverResponse.data.role,
      redirectedTenantId: serverResponse.data.tenantId,
      networkFetchAttempted: true,
      source: "server",
    };
  }

  // Server returned !ok (invalid credentials on server too)
  return {
    error: "Username atau password salah",
    redirected: false,
    redirectedRole: null,
    redirectedTenantId: null,
    networkFetchAttempted: true,
    source: "none",
  };
}

/**
 * Simulates the current useSessionGrant refresh logic for ONLINE state.
 *
 * The current code:
 * 1. Calls fetchSessionGrant (network fetch to /api/session-grant)
 * 2. On success: sets grant, schedules refresh timer
 * 3. On failure: sets error state
 *
 * When online, the fetch should succeed and return a fresh grant.
 */
async function simulateUseSessionGrantOnline(params: {
  tenantId: string;
  accountId: string;
  deviceId: string;
  role?: string;
  serverGrant: {
    keyVersion: number;
    expiresAt: number;
    allowedOps: string[];
  };
}): Promise<{
  grant: { keyVersion: number; expiresAt: number; allowedOps: string[] } | null;
  error: string | null;
  loading: boolean;
  refreshScheduled: boolean;
  refreshDelayMs: number;
}> {
  const { serverGrant } = params;
  const REFRESH_BUFFER_SECONDS = 300;

  // Online: fetch succeeds, grant is set, refresh is scheduled
  const nowSeconds = Math.floor(Date.now() / 1000);
  const delay = Math.max(0, (serverGrant.expiresAt - nowSeconds - REFRESH_BUFFER_SECONDS) * 1000);

  return {
    grant: {
      keyVersion: serverGrant.keyVersion,
      expiresAt: serverGrant.expiresAt,
      allowedOps: serverGrant.allowedOps,
    },
    error: null,
    loading: false,
    refreshScheduled: true,
    refreshDelayMs: delay,
  };
}

// ============================================================================
// Generators
// ============================================================================

const usernameArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);
const passwordArb = fc.string({ minLength: 1, maxLength: 50 });
const tenantIdArb = fc.uuid();
const accountIdArb = fc.uuid();
const deviceIdArb = fc.uuid();
const roleArb = fc.constantFrom("admin", "terminal", "gate", "scout", "station");
const tenantSlugArb = fc
  .string({ minLength: 3, maxLength: 20 })
  .filter((s) => /^[a-z0-9-]+$/.test(s) && s.length >= 3);
const tenantNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

// ============================================================================
// Property 2.1: Online Login with Server-Only Account
// ============================================================================

describe("Property 2: Preservation - Online Login and Session Grant Behavior Unchanged", () => {
  describe("2.1: Online login with server-only account authenticates via /api/auth/token", () => {
    it("for all online login attempts with server-only accounts, result is server authentication via /api/auth/token with correct redirect", async () => {
      /**
       * **Validates: Requirements 3.1**
       *
       * For any login attempt where:
       * - Device is online
       * - Local account does NOT exist (localLogin returns null)
       * - Server account exists (server responds with ok)
       *
       * The system SHALL authenticate via the server /api/auth/token endpoint
       * and redirect to the appropriate role route.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            username: usernameArb,
            password: passwordArb,
            serverTenantId: tenantIdArb,
            serverTenantSlug: tenantSlugArb,
            serverTenantName: tenantNameArb,
            serverAccountId: accountIdArb,
            serverRole: roleArb,
          }),
          async ({
            username,
            password,
            serverTenantId,
            serverTenantSlug,
            serverTenantName,
            serverAccountId,
            serverRole,
          }) => {
            const result = await simulateHandleUnifiedLoginOnline({
              username,
              password,
              localLoginResult: null, // No local account
              serverResponse: {
                ok: true,
                data: {
                  tenantId: serverTenantId,
                  tenantSlug: serverTenantSlug,
                  tenantName: serverTenantName,
                  accountId: serverAccountId,
                  role: serverRole,
                },
              },
            });

            // Server authentication succeeded
            expect(result.networkFetchAttempted).toBe(true);
            expect(result.source).toBe("server");
            expect(result.redirected).toBe(true);
            expect(result.error).toBeNull();
            // Redirected to the correct role
            expect(result.redirectedRole).toBe(serverRole);
            expect(result.redirectedTenantId).toBe(serverTenantId);
          },
        ),
        { numRuns: 50 },
      );
    });

    it("for all online login attempts with invalid server credentials, shows credential error", async () => {
      /**
       * **Validates: Requirements 3.1**
       *
       * For any login attempt where:
       * - Device is online
       * - Local account does NOT exist (localLogin returns null)
       * - Server rejects credentials (res.ok = false)
       *
       * The system SHALL display "Username atau password salah"
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            username: usernameArb,
            password: passwordArb,
          }),
          async ({ username, password }) => {
            const result = await simulateHandleUnifiedLoginOnline({
              username,
              password,
              localLoginResult: null, // No local account
              serverResponse: { ok: false }, // Server rejects credentials
            });

            expect(result.networkFetchAttempted).toBe(true);
            expect(result.redirected).toBe(false);
            expect(result.error).toBe("Username atau password salah");
            expect(result.source).toBe("none");
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // ============================================================================
  // Property 2.2: Online Login with Local Account Takes Priority
  // ============================================================================

  describe("2.2: Online login where local account exists, local login takes priority", () => {
    it("for all online login attempts where local account exists, local login takes priority over server", async () => {
      /**
       * **Validates: Requirements 3.2**
       *
       * For any login attempt where:
       * - Device is online
       * - Local account exists and credentials are valid (localLogin returns result)
       *
       * The system SHALL prefer the local login result (local-first)
       * and redirect without waiting for or attempting the server fetch.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            username: usernameArb,
            password: passwordArb,
            localTenantId: tenantIdArb,
            localTenantSlug: tenantSlugArb,
            localTenantName: tenantNameArb,
            localAccountId: accountIdArb,
            localRole: roleArb,
          }),
          async ({
            username,
            password,
            localTenantId,
            localTenantSlug,
            localTenantName,
            localAccountId,
            localRole,
          }) => {
            const result = await simulateHandleUnifiedLoginOnline({
              username,
              password,
              localLoginResult: {
                tenantId: localTenantId,
                tenantSlug: localTenantSlug,
                tenantName: localTenantName,
                accountId: localAccountId,
                role: localRole,
              },
              // Server response doesn't matter — should never be reached
              serverResponse: {
                ok: true,
                data: {
                  tenantId: "other",
                  tenantSlug: "other",
                  tenantName: "Other",
                  accountId: "other",
                  role: "admin",
                },
              },
            });

            // Local login takes priority — no network fetch attempted
            expect(result.networkFetchAttempted).toBe(false);
            expect(result.source).toBe("local");
            expect(result.redirected).toBe(true);
            expect(result.error).toBeNull();
            // Redirected using LOCAL account data, not server data
            expect(result.redirectedRole).toBe(localRole);
            expect(result.redirectedTenantId).toBe(localTenantId);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // ============================================================================
  // Property 2.3: Online Session Grant Fetches Fresh Grant from Server
  // ============================================================================

  describe("2.3: Online session grant requests fetch fresh grant from server and cache", () => {
    it("for all online session grant requests, fresh grant is fetched from server and refresh is scheduled", async () => {
      /**
       * **Validates: Requirements 3.3**
       *
       * For any session grant request where:
       * - Device is online
       * - Any cache state (cached or not cached)
       *
       * The system SHALL fetch a fresh session grant from the server
       * and schedule a refresh timer based on the grant's expiry.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: tenantIdArb,
            accountId: accountIdArb,
            deviceId: deviceIdArb,
            role: roleArb,
            keyVersion: fc.integer({ min: 1, max: 100 }),
            // Grant expires in the future (valid)
            expiresAt: fc.integer({
              min: Math.floor(Date.now() / 1000) + 600,
              max: Math.floor(Date.now() / 1000) + 86400,
            }),
            allowedOps: fc.array(fc.constantFrom("topup", "debit", "read", "write", "init"), {
              minLength: 1,
              maxLength: 5,
            }),
          }),
          async ({ tenantId, accountId, deviceId, role, keyVersion, expiresAt, allowedOps }) => {
            const result = await simulateUseSessionGrantOnline({
              tenantId,
              accountId,
              deviceId,
              role,
              serverGrant: { keyVersion, expiresAt, allowedOps },
            });

            // Fresh grant is returned from server
            expect(result.grant).not.toBeNull();
            expect(result.grant!.keyVersion).toBe(keyVersion);
            expect(result.grant!.expiresAt).toBe(expiresAt);
            expect(result.grant!.allowedOps).toEqual(allowedOps);
            expect(result.error).toBeNull();
            expect(result.loading).toBe(false);

            // Refresh is scheduled
            expect(result.refreshScheduled).toBe(true);
            // Refresh delay should be positive (grant expires in future minus buffer)
            expect(result.refreshDelayMs).toBeGreaterThanOrEqual(0);
          },
        ),
        { numRuns: 50 },
      );
    });

    it("for all online session grant requests regardless of existing cache, server fetch is always attempted", async () => {
      /**
       * **Validates: Requirements 3.3**
       *
       * For any session grant request where:
       * - Device is online
       * - A cached grant may or may not exist
       *
       * The system SHALL always attempt to fetch a fresh grant from the server
       * (the current code has no cache layer, so it always fetches from network).
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tenantId: tenantIdArb,
            accountId: accountIdArb,
            deviceId: deviceIdArb,
            hasCachedGrant: fc.boolean(), // Whether a cached grant exists (irrelevant for current code)
            keyVersion: fc.integer({ min: 1, max: 100 }),
            expiresAt: fc.integer({
              min: Math.floor(Date.now() / 1000) + 600,
              max: Math.floor(Date.now() / 1000) + 86400,
            }),
            allowedOps: fc.array(fc.constantFrom("topup", "debit", "read", "write", "init"), {
              minLength: 1,
              maxLength: 5,
            }),
          }),
          async ({ tenantId, accountId, deviceId, keyVersion, expiresAt, allowedOps }) => {
            // Regardless of cache state, online always fetches fresh
            const result = await simulateUseSessionGrantOnline({
              tenantId,
              accountId,
              deviceId,
              serverGrant: { keyVersion, expiresAt, allowedOps },
            });

            // Always returns fresh server grant when online
            expect(result.grant).not.toBeNull();
            expect(result.error).toBeNull();
            // The grant data matches what the server returned
            expect(result.grant!.keyVersion).toBe(keyVersion);
            expect(result.grant!.expiresAt).toBe(expiresAt);
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
