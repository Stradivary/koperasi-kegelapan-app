/**
 * Session Validator for the Payload Operation Layer
 *
 * This module provides session grant validation functionality for NFC payload operations.
 * It validates that a session grant is present, not expired, and matches the card's tenant.
 *
 * @module core/nfc/sessionValidator
 * @see Requirements 7.1, 7.2, 7.3, 7.4
 */

import type { SessionGrant } from "../payload/types";
import type { SessionValidationResult } from "./payloadTypes";

/**
 * Validates a session grant for payload operations.
 *
 * Performs the following checks in order:
 * 1. Null session check - returns "NO_SESSION" if sessionGrant is null
 * 2. Expiration check - returns "SESSION_EXPIRED" if session has expired
 * 3. Tenant mismatch check - returns "TENANT_MISMATCH" if card tenant doesn't match session tenant
 *
 * @param sessionGrant - The session grant to validate, or null if no session
 * @param tenantId - The tenant ID from the session context (not used for validation, kept for API consistency)
 * @param cardTenantId - Optional tenant ID from the card being processed
 * @returns SessionValidationResult indicating whether the session is valid
 *
 * @example
 * ```typescript
 * // Valid session
 * const result = validateSession(grant, "tenant-1");
 * // { valid: true }
 *
 * // No session
 * const result = validateSession(null, "tenant-1");
 * // { valid: false, error: "Sesi tidak aktif", errorCode: "NO_SESSION" }
 *
 * // Expired session
 * const expiredGrant = { ...grant, expiresAt: Date.now() - 1000 };
 * const result = validateSession(expiredGrant, "tenant-1");
 * // { valid: false, error: "Sesi telah berakhir", errorCode: "SESSION_EXPIRED" }
 *
 * // Tenant mismatch
 * const result = validateSession(grant, "tenant-1", "tenant-2");
 * // { valid: false, error: "Kartu tidak terdaftar di tenant ini", errorCode: "TENANT_MISMATCH" }
 * ```
 *
 * @see Requirement 7.1 - THE Payload_Operation_Layer SHALL require a valid Session_Grant for all payload operations
 * @see Requirement 7.2 - IF the Session_Grant is null, THEN THE Payload_Operation_Layer SHALL allow Generic_NFC_Layer operations but block payload operations
 * @see Requirement 7.3 - IF the Session_Grant is expired, THEN THE Payload_Operation_Layer SHALL display an error message indicating session expiry
 * @see Requirement 7.4 - THE Payload_Operation_Layer SHALL validate that the Session_Grant tenant matches the card tenant
 */
export function validateSession(
  sessionGrant: SessionGrant | null,
  tenantId: string,
  cardTenantId?: string,
): SessionValidationResult {
  // Check 1: Null session grant → "NO_SESSION"
  // Requirement 7.1, 7.2
  if (sessionGrant === null) {
    return {
      valid: false,
      error: "Sesi tidak aktif",
      errorCode: "NO_SESSION",
    };
  }

  // Check 2: Expired session → "SESSION_EXPIRED"
  // Requirement 7.3
  if (sessionGrant.expiresAt < Date.now()) {
    return {
      valid: false,
      error: "Sesi telah berakhir",
      errorCode: "SESSION_EXPIRED",
    };
  }

  // Check 3: Tenant mismatch → "TENANT_MISMATCH"
  // Requirement 7.4
  // Only check if cardTenantId is provided
  if (cardTenantId !== undefined && sessionGrant.tenantId !== cardTenantId) {
    return {
      valid: false,
      error: "Kartu tidak terdaftar di tenant ini",
      errorCode: "TENANT_MISMATCH",
    };
  }

  // All checks passed
  return {
    valid: true,
  };
}
