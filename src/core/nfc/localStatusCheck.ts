import { localDb } from "../../db/local-db";

export interface LocalStatusResult {
  blocked: boolean;
  reason: string | null;
  /** True when the card serial was NOT found in local DB (possible missing sync data) */
  notInLocalDb: boolean;
}

/**
 * Check if a card or its linked member is blocked/suspended in the local DB.
 *
 * Uses the hardware serial number (from the NFC scan event) as the lookup key
 * for `localDb.cards`, and performs a member lookup using the card's linked userId
 * from the local DB (not from the NFC binary payload).
 *
 * @param tenantId - The current tenant identifier
 * @param serialNumber - The hardware NFC serial number (may contain colons/dashes, any case)
 * @returns Promise resolving to { blocked, reason, notInLocalDb } indicating whether the operation should be rejected
 */
export async function checkLocalBlockedStatus(
  tenantId: string,
  serialNumber: string,
): Promise<LocalStatusResult> {
  // Normalize serial number to lowercase hex (strip colons/dashes)
  const normalizedSerial = serialNumber.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();

  // Look up card by [tenantId, normalizedSerial]
  const cardRecord = await localDb.cards.get([tenantId, normalizedSerial]);

  // Card not found in local DB — not blocked, but flag as missing
  if (!cardRecord) {
    return { blocked: false, reason: null, notInLocalDb: true };
  }

  if (cardRecord.status !== "active") {
    return {
      blocked: true,
      reason: `Kartu diblokir: ${cardRecord.status.replaceAll("blocked_", "")}`,
      notInLocalDb: false,
    };
  }

  // Use the card's linked userId from local DB for member lookup
  const linkedUserId = cardRecord.userId ?? null;
  if (linkedUserId) {
    const userRecord = await localDb.users.get([tenantId, linkedUserId]);
    if (userRecord && userRecord.status !== "active") {
      return {
        blocked: true,
        reason: "Akun anggota ditangguhkan. Hubungi admin.",
        notInLocalDb: false,
      };
    }
  }

  return { blocked: false, reason: null, notInLocalDb: false };
}
