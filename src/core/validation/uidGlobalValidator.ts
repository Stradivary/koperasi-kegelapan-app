import { localDb } from "../../db/local-db";
import { API_BASE_URL, apiFetch } from "../../lib/api";

// ── Types ──────────────────────────────────────────────────────────────

export interface UIDValidationResult {
  valid: boolean;
  reason?:
    | "UID_ALREADY_REGISTERED"
    | "UID_REGISTERED_OTHER_TENANT"
    | "NETWORK_ERROR"
    | "INVALID_UID_FORMAT";
  existingTenantId?: string;
  existingCardId?: string;
}

// ── UID Normalization ──────────────────────────────────────────────────

/**
 * Normalize a NFC serial number to lowercase hex without separators.
 * Strips colons, dashes, and any non-hex characters.
 */
export function normalizeUID(serialNumber: string): string {
  return serialNumber.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();
}

// ── Validation Functions ───────────────────────────────────────────────

/**
 * Validate UID format after normalization.
 * Rejects if normalized length is less than 8 or greater than 14 hex chars.
 */
function validateFormat(normalizedUID: string): UIDValidationResult | null {
  if (normalizedUID.length < 8 || normalizedUID.length > 14) {
    return { valid: false, reason: "INVALID_UID_FORMAT" };
  }
  return null;
}

/**
 * Validate UID against local IndexedDB only (offline fallback).
 * Returns invalid result if UID is found locally, or { valid: true } if not found.
 */
export async function validateUIDLocal(
  serialNumber: string,
  currentTenantId: string,
): Promise<UIDValidationResult> {
  const normalizedUID = normalizeUID(serialNumber);

  // Format validation
  const formatError = validateFormat(normalizedUID);
  if (formatError) return formatError;

  // Check local DB — query by cardId across all cached tenants
  const localResult = await checkLocalDB(normalizedUID, currentTenantId);
  if (localResult) return localResult;

  return { valid: true };
}

/**
 * Validate UID globally — checks local IndexedDB first, then cloud API.
 * Implements fail-closed behavior: rejects on network error.
 * Falls back to local-only validation when offline.
 */
export async function validateUID(
  serialNumber: string,
  currentTenantId: string,
): Promise<UIDValidationResult> {
  const normalizedUID = normalizeUID(serialNumber);

  // Format validation
  const formatError = validateFormat(normalizedUID);
  if (formatError) return formatError;

  // Step 1: Check local DB first (skip cloud if found locally)
  const localResult = await checkLocalDB(normalizedUID, currentTenantId);
  if (localResult) return localResult;

  // Step 2: Check cloud API (global cross-tenant check)
  if (navigator.onLine) {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/cards/check-uid?uid=${normalizedUID}`);
      const data = await response.json();

      if (data.exists) {
        return {
          valid: false,
          reason: "UID_REGISTERED_OTHER_TENANT",
          existingTenantId: data.tenantId,
        };
      }
    } catch {
      // Fail-closed: reject binding if we can't verify
      return { valid: false, reason: "NETWORK_ERROR" };
    }
  } else {
    // Offline: local-only check passed, allow
    return { valid: true };
  }

  return { valid: true };
}

// ── Internal Helpers ───────────────────────────────────────────────────

/**
 * Check local IndexedDB for a card matching the given UID across all cached tenants.
 * Returns a UIDValidationResult if found, or null if not found.
 */
async function checkLocalDB(
  normalizedUID: string,
  currentTenantId: string,
): Promise<UIDValidationResult | null> {
  const localCards = await localDb.cards
    .filter((card) => card.cardId === normalizedUID && card.status !== "deleted")
    .toArray();

  if (localCards.length > 0) {
    const existingCard = localCards[0];
    if (existingCard.tenantId === currentTenantId) {
      return {
        valid: false,
        reason: "UID_ALREADY_REGISTERED",
        existingCardId: normalizedUID,
      };
    } else {
      return {
        valid: false,
        reason: "UID_REGISTERED_OTHER_TENANT",
        existingTenantId: existingCard.tenantId,
      };
    }
  }

  return null;
}
