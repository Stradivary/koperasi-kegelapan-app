/**
 * BlockEnforcer - Enforces card block status on all operations (online & offline).
 *
 * Checks both on-card status AND local IndexedDB record. Rejects if either is blocked.
 * Works both online and offline by reading from IndexedDB.
 *
 * @see Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import type { CardRecord } from "../interfaces/types";
import type { CardRepository } from "../interfaces/CardRepository";
import { CardStatus } from "../payload/types";

/** Result of a block check */
export interface BlockCheckResult {
  blocked: boolean;
  status?: CardStatus;
  message?: string;
  errorCode?: "CARD_BLOCKED" | "CARD_BLOCKED_ADMIN" | "CARD_BLOCKED_TAMPER";
}

/** Blocked card rejection message */
const BLOCKED_MESSAGE = "Akses Ditolak: Kartu Diblokir";

/** Map local DB status strings to CardStatus enum values */
const DB_STATUS_TO_ENUM: Record<string, CardStatus> = {
  blocked_tamper: CardStatus.BLOCKED_TAMPER,
  blocked_fraud: CardStatus.BLOCKED_FRAUD,
  blocked_expired: CardStatus.BLOCKED_EXPIRED,
  blocked_admin: CardStatus.BLOCKED_ADMIN,
};

/**
 * Maps a CardStatus enum value to the appropriate error code for UI differentiation.
 *
 * Mapping:
 * - BLOCKED_ADMIN → "CARD_BLOCKED_ADMIN"
 * - BLOCKED_TAMPER → "CARD_BLOCKED_TAMPER"
 * - BLOCKED_FRAUD → "CARD_BLOCKED"
 * - BLOCKED_EXPIRED → "CARD_BLOCKED"
 */
function mapStatusToErrorCode(
  status: CardStatus,
): "CARD_BLOCKED" | "CARD_BLOCKED_ADMIN" | "CARD_BLOCKED_TAMPER" {
  switch (status) {
    case CardStatus.BLOCKED_ADMIN:
      return "CARD_BLOCKED_ADMIN";
    case CardStatus.BLOCKED_TAMPER:
      return "CARD_BLOCKED_TAMPER";
    case CardStatus.BLOCKED_FRAUD:
    case CardStatus.BLOCKED_EXPIRED:
    default:
      return "CARD_BLOCKED";
  }
}

/**
 * Checks if a CardStatus value represents a blocked state.
 */
function isBlockedStatus(status: CardStatus): boolean {
  return (
    status === CardStatus.BLOCKED_TAMPER ||
    status === CardStatus.BLOCKED_FRAUD ||
    status === CardStatus.BLOCKED_EXPIRED ||
    status === CardStatus.BLOCKED_ADMIN
  );
}

/**
 * Checks if a local DB card record has a blocked status.
 */
function isDbCardBlocked(card: CardRecord): boolean {
  return card.status !== "active";
}

/**
 * Converts a local DB card status string to a CardStatus enum value.
 * Returns undefined if the status is "active" (not blocked).
 */
function dbStatusToCardStatus(dbStatus: CardRecord["status"]): CardStatus | undefined {
  return DB_STATUS_TO_ENUM[dbStatus];
}

/**
 * Creates a blocked result with the appropriate message and error code.
 */
function makeBlockedResult(status: CardStatus): BlockCheckResult {
  return {
    blocked: true,
    status,
    message: BLOCKED_MESSAGE,
    errorCode: mapStatusToErrorCode(status),
  };
}

/**
 * Synchronously checks block status from on-card status and/or local DB card record.
 *
 * This is the core logic that determines if a card is blocked based on:
 * 1. The on-card status (from NFC read) - authoritative if available
 * 2. The local DB record status - used as fallback or additional check
 *
 * Either source indicating blocked → operation rejected.
 *
 * @param onCardStatus - CardStatus from NFC card read (optional)
 * @param dbCard - Card record from local IndexedDB (optional)
 * @returns BlockCheckResult
 */
export function checkBlockedSync(
  onCardStatus?: CardStatus,
  dbCard?: CardRecord | null,
): BlockCheckResult {
  // Check on-card status first (authoritative per Requirement 6.4)
  if (onCardStatus !== undefined && isBlockedStatus(onCardStatus)) {
    return makeBlockedResult(onCardStatus);
  }

  // Check local DB record (Requirement 6.5)
  if (dbCard && isDbCardBlocked(dbCard)) {
    const cardStatus = dbStatusToCardStatus(dbCard.status);
    if (cardStatus !== undefined) {
      return makeBlockedResult(cardStatus);
    }
  }

  return { blocked: false };
}

/**
 * Checks card block status from on-card status and local IndexedDB.
 *
 * Preconditions:
 * - `tenantId` and `cardId` are non-empty strings
 * - `onCardStatus` is a valid CardStatus enum value or undefined
 *
 * Postconditions:
 * - Returns `{ blocked: true, message: "Akses Ditolak: Kartu Diblokir" }` if:
 *   - `onCardStatus` is any BLOCKED_* value, OR
 *   - Local DB card record has blocked status
 * - Returns `{ blocked: false }` if card is ACTIVE in both on-card and local DB
 * - `errorCode` maps to specific block type for UI differentiation
 *
 * @param tenantId - Tenant identifier
 * @param cardId - Card identifier (hex string)
 * @param onCardStatus - Optional CardStatus from NFC card read
 * @returns Promise<BlockCheckResult>
 */
export async function checkBlocked(
  tenantId: string,
  cardId: string,
  deps: { cardRepo: CardRepository },
  onCardStatus?: CardStatus,
): Promise<BlockCheckResult> {
  // If on-card status is already blocked, reject immediately without DB lookup
  if (onCardStatus !== undefined && isBlockedStatus(onCardStatus)) {
    return makeBlockedResult(onCardStatus);
  }

  // Read from repository (works offline via IndexedDB-backed implementation)
  const dbCard = await deps.cardRepo.getByTenantAndCardId(tenantId, cardId);

  return checkBlockedSync(onCardStatus, dbCard ?? null);
}

/**
 * Enforces block check on check-in attempt.
 *
 * Reads the card record from local IndexedDB and rejects if blocked.
 * Works both online and offline.
 *
 * @param tenantId - Tenant identifier
 * @param cardId - Card identifier (hex string)
 * @returns Promise<BlockCheckResult>
 *
 * @see Requirement 6.1 - Reject check-in on blocked cards within 200ms
 * @see Requirement 6.7 - Works regardless of online/offline status
 */
export async function enforceOnCheckin(
  tenantId: string,
  cardId: string,
  deps: { cardRepo: CardRepository },
): Promise<BlockCheckResult> {
  return checkBlocked(tenantId, cardId, deps);
}

/**
 * Enforces block check on check-out attempt.
 *
 * Reads the card record from local IndexedDB and rejects if blocked.
 * Works both online and offline.
 *
 * @param tenantId - Tenant identifier
 * @param cardId - Card identifier (hex string)
 * @returns Promise<BlockCheckResult>
 *
 * @see Requirement 6.2 - Reject check-out on blocked cards within 200ms
 * @see Requirement 6.7 - Works regardless of online/offline status
 */
export async function enforceOnCheckout(
  tenantId: string,
  cardId: string,
  deps: { cardRepo: CardRepository },
): Promise<BlockCheckResult> {
  return checkBlocked(tenantId, cardId, deps);
}

/**
 * Applies an admin block to a card in the local IndexedDB.
 *
 * If the card exists, updates its status to "blocked_admin".
 * If the card does not exist, creates a new record with blocked status.
 *
 * @param tenantId - Tenant identifier
 * @param cardId - Card identifier (hex string)
 */
export async function applyAdminBlock(
  tenantId: string,
  cardId: string,
  deps: { cardRepo: CardRepository },
): Promise<void> {
  const existingCard = await deps.cardRepo.getByTenantAndCardId(tenantId, cardId);

  if (existingCard) {
    await deps.cardRepo.updateStatus(tenantId, cardId, "blocked_admin");
  } else {
    await deps.cardRepo.put({
      tenantId,
      cardId,
      userId: null,
      status: "blocked_admin",
      balance: 0,
      counter: 0,
      keyVersion: 1,
      createdAt: Math.floor(Date.now() / 1000),
      lastActivityAt: Math.floor(Date.now() / 1000),
      expiresAt: null,
      notes: null,
    });
  }
}
