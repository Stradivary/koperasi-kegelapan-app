/**
 * Unit tests for Session Validator
 *
 * Tests the validateSession function for all validation scenarios:
 * - Null session grant
 * - Expired session grant
 * - Tenant mismatch
 * - Valid session grant
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateSession } from "../sessionValidator";
import type { SessionGrant } from "../../payload/types";

/**
 * Creates a valid mock SessionGrant for testing
 */
function createMockSessionGrant(overrides: Partial<SessionGrant> = {}): SessionGrant {
  return {
    keyVersion: 1,
    sessionKey: new Uint8Array(32),
    expiresAt: Date.now() + 3600000, // 1 hour from now
    allowedOps: ["check-in", "check-out", "debit", "topup"],
    signature: new Uint8Array(64),
    tenantId: "tenant-123",
    accountId: "account-456",
    deviceId: "device-789",
    ...overrides,
  };
}

describe("validateSession", () => {
  beforeEach(() => {
    // Mock Date.now() for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("null session grant (Requirement 7.1, 7.2)", () => {
    it("should return NO_SESSION error when sessionGrant is null", () => {
      const result = validateSession(null, "tenant-123");

      expect(result).toEqual({
        valid: false,
        error: "Sesi tidak aktif",
        errorCode: "NO_SESSION",
      });
    });

    it("should return NO_SESSION regardless of tenantId parameter", () => {
      const result = validateSession(null, "any-tenant");

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("NO_SESSION");
    });

    it("should return NO_SESSION regardless of cardTenantId parameter", () => {
      const result = validateSession(null, "tenant-123", "card-tenant");

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("NO_SESSION");
    });
  });

  describe("expired session (Requirement 7.3)", () => {
    it("should return SESSION_EXPIRED when session has expired", () => {
      const expiredGrant = createMockSessionGrant({
        expiresAt: Date.now() - 1000, // 1 second ago
      });

      const result = validateSession(expiredGrant, "tenant-123");

      expect(result).toEqual({
        valid: false,
        error: "Sesi telah berakhir",
        errorCode: "SESSION_EXPIRED",
      });
    });

    it("should return SESSION_EXPIRED when session expired exactly at current time", () => {
      const expiredGrant = createMockSessionGrant({
        expiresAt: Date.now() - 1, // 1ms ago
      });

      const result = validateSession(expiredGrant, "tenant-123");

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("SESSION_EXPIRED");
    });

    it("should return SESSION_EXPIRED for long-expired sessions", () => {
      const expiredGrant = createMockSessionGrant({
        expiresAt: Date.now() - 86400000, // 24 hours ago
      });

      const result = validateSession(expiredGrant, "tenant-123");

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("SESSION_EXPIRED");
    });

    it("should check expiration before tenant mismatch", () => {
      // Both expired AND tenant mismatch - should return SESSION_EXPIRED
      const expiredGrant = createMockSessionGrant({
        expiresAt: Date.now() - 1000,
        tenantId: "different-tenant",
      });

      const result = validateSession(expiredGrant, "tenant-123", "card-tenant");

      expect(result.errorCode).toBe("SESSION_EXPIRED");
    });
  });

  describe("tenant mismatch (Requirement 7.4)", () => {
    it("should return TENANT_MISMATCH when card tenant differs from session tenant", () => {
      const grant = createMockSessionGrant({
        tenantId: "session-tenant",
      });

      const result = validateSession(grant, "context-tenant", "card-tenant");

      expect(result).toEqual({
        valid: false,
        error: "Kartu tidak terdaftar di tenant ini",
        errorCode: "TENANT_MISMATCH",
      });
    });

    it("should not check tenant mismatch when cardTenantId is undefined", () => {
      const grant = createMockSessionGrant({
        tenantId: "session-tenant",
      });

      const result = validateSession(grant, "context-tenant");

      expect(result.valid).toBe(true);
    });

    it("should pass when card tenant matches session tenant", () => {
      const grant = createMockSessionGrant({
        tenantId: "matching-tenant",
      });

      const result = validateSession(grant, "context-tenant", "matching-tenant");

      expect(result.valid).toBe(true);
    });

    it("should handle empty string tenant IDs", () => {
      const grant = createMockSessionGrant({
        tenantId: "",
      });

      const result = validateSession(grant, "context-tenant", "card-tenant");

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("TENANT_MISMATCH");
    });

    it("should match when both tenants are empty strings", () => {
      const grant = createMockSessionGrant({
        tenantId: "",
      });

      const result = validateSession(grant, "context-tenant", "");

      expect(result.valid).toBe(true);
    });
  });

  describe("valid session", () => {
    it("should return valid when all checks pass without cardTenantId", () => {
      const grant = createMockSessionGrant();

      const result = validateSession(grant, "tenant-123");

      expect(result).toEqual({
        valid: true,
      });
    });

    it("should return valid when all checks pass with matching cardTenantId", () => {
      const grant = createMockSessionGrant({
        tenantId: "tenant-123",
      });

      const result = validateSession(grant, "context-tenant", "tenant-123");

      expect(result).toEqual({
        valid: true,
      });
    });

    it("should return valid for session expiring in the future", () => {
      const grant = createMockSessionGrant({
        expiresAt: Date.now() + 1, // 1ms from now
      });

      const result = validateSession(grant, "tenant-123");

      expect(result.valid).toBe(true);
    });

    it("should return valid for session with long expiration", () => {
      const grant = createMockSessionGrant({
        expiresAt: Date.now() + 86400000 * 365, // 1 year from now
      });

      const result = validateSession(grant, "tenant-123");

      expect(result.valid).toBe(true);
    });
  });

  describe("validation order", () => {
    it("should check null first, then expiration, then tenant", () => {
      // Null check should come first
      expect(validateSession(null, "t", "c").errorCode).toBe("NO_SESSION");

      // Expiration should come before tenant mismatch
      const expiredMismatch = createMockSessionGrant({
        expiresAt: Date.now() - 1000,
        tenantId: "wrong",
      });
      expect(validateSession(expiredMismatch, "t", "c").errorCode).toBe("SESSION_EXPIRED");

      // Tenant mismatch when not expired
      const validMismatch = createMockSessionGrant({
        tenantId: "wrong",
      });
      expect(validateSession(validMismatch, "t", "c").errorCode).toBe("TENANT_MISMATCH");
    });
  });

  describe("error messages in Indonesian", () => {
    it("should return Indonesian error message for NO_SESSION", () => {
      const result = validateSession(null, "tenant");
      expect(result.error).toBe("Sesi tidak aktif");
    });

    it("should return Indonesian error message for SESSION_EXPIRED", () => {
      const expired = createMockSessionGrant({ expiresAt: Date.now() - 1000 });
      const result = validateSession(expired, "tenant");
      expect(result.error).toBe("Sesi telah berakhir");
    });

    it("should return Indonesian error message for TENANT_MISMATCH", () => {
      const grant = createMockSessionGrant({ tenantId: "a" });
      const result = validateSession(grant, "tenant", "b");
      expect(result.error).toBe("Kartu tidak terdaftar di tenant ini");
    });
  });
});
