import { localDb } from "../../db/local-db";

/**
 * Check if a card or its linked member is blocked/suspended in the local DB.
 *
 * Uses the hardware serial number (from the NFC scan event) as the lookup key
 * for `localDb.cards`, and performs a member lookup only when userId > 0.
 *
 * @param tenantId - The current tenant identifier
 * @param serialNumber - The hardware NFC serial number (may contain colons/dashes, any case)
 * @param userId - The userId from the card's identity payload (0 = unlinked card)
 * @returns Promise resolving to { blocked, reason } indicating whether the operation should be rejected
 */
export async function checkLocalBlockedStatus(
  tenantId: string,
  serialNumber: string,
  userId: number,
): Promise<{ blocked: boolean; reason: string | null }> {
  // Normalize serial number to lowercase hex (strip colons/dashes)
  const normalizedSerial = serialNumber.replace(/[^a-fA-F0-9]/g, "").toLowerCase();

  // Look up card by [tenantId, normalizedSerial]
  const cardRecord = await localDb.cards.get([tenantId, normalizedSerial]);
  if (cardRecord && cardRecord.status !== "active") {
    return {
      blocked: true,
      reason: `Kartu diblokir: ${cardRecord.status.replace("blocked_", "")}`,
    };
  }

  // Explicit numeric comparison: userId > 0 (not truthiness)
  // userId=0 means unlinked card — skip member lookup
  if (userId > 0) {
    const userRecord = await localDb.users.get([tenantId, userId]);
    if (userRecord && userRecord.status !== "active") {
      return {
        blocked: true,
        reason: "Akun anggota ditangguhkan. Hubungi admin.",
      };
    }
  }

  return { blocked: false, reason: null };
}
