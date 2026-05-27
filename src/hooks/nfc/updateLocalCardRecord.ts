import type { CardPayload } from "#/core/payload/types";
import { CardStatus } from "#/core/payload/types";
import { localDb } from "#/db/local-db";

/**
 * Maps on-card CardStatus enum to local DB status string.
 */
function cardStatusToDbStatus(
  status: number,
): "active" | "blocked_tamper" | "blocked_fraud" | "blocked_expired" | "blocked_admin" {
  switch (status) {
    case CardStatus.BLOCKED_TAMPER:
      return "blocked_tamper";
    case CardStatus.BLOCKED_FRAUD:
      return "blocked_fraud";
    case CardStatus.BLOCKED_EXPIRED:
      return "blocked_expired";
    case CardStatus.BLOCKED_ADMIN:
      return "blocked_admin";
    default:
      return "active";
  }
}

/**
 * Update the local IndexedDB card record with the latest state from the physical card.
 *
 * This should be called:
 * - After every successful card write (checkin, checkout, debit, topup, etc.)
 * - After every scout/read operation
 *
 * This ensures the local DB always reflects the latest known card state,
 * enabling accurate blocked-status checks and data recovery from card history
 * without depending on server sync.
 *
 * Non-fatal: if IndexedDB is unavailable, failures are silently ignored.
 */
export async function updateLocalCardRecord(tenantId: string, payload: CardPayload): Promise<void> {
  try {
    const cardIdHex = Array.from(payload.header.cardId)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const now = Math.floor(Date.now() / 1000);
    const dbStatus = cardStatusToDbStatus(payload.identity.status);
    const userId = payload.identity.userId || null;

    const existing = await localDb.cards.get([tenantId, cardIdHex]);

    if (existing) {
      await localDb.cards.update([tenantId, cardIdHex], {
        balance: payload.wallet.balance,
        counter: Number(payload.wallet.counter),
        status: dbStatus,
        lastActivityAt: now,
        ...(userId && { userId }),
      });
    } else {
      await localDb.cards.put({
        tenantId,
        cardId: cardIdHex,
        userId,
        status: dbStatus,
        balance: payload.wallet.balance,
        counter: Number(payload.wallet.counter),
        keyVersion: 1,
        createdAt: payload.identity.createdAt || now,
        lastActivityAt: now,
        expiresAt: null,
        notes: null,
        syncStatus: "pending",
      });
    }
  } catch {
    // Non-fatal — local DB update is best-effort
  }
}

/**
 * Update the local IndexedDB user record name from the card payload.
 *
 * This ensures the user's name stays in sync with what's on the physical card.
 * Non-fatal: failures are silently ignored.
 */
export async function updateLocalUserFromCard(
  tenantId: string,
  payload: CardPayload,
): Promise<void> {
  try {
    const userId = payload.identity.userId;
    if (!userId) return;

    const existing = await localDb.users.get([tenantId, userId]);
    if (existing) {
      const updates: Record<string, unknown> = {
        updatedAt: Math.floor(Date.now() / 1000),
      };
      if (payload.identity.name && payload.identity.name !== existing.name) {
        updates.name = payload.identity.name;
      }
      await localDb.users.update([tenantId, userId], updates);
    }
  } catch {
    // Non-fatal — local DB update is best-effort
  }
}
