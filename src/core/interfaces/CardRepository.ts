import type { CardRecord } from "./types";

export interface CardRepository {
  /**
   * Get a single card by compound key [tenantId, cardId].
   * Returns undefined if not found.
   */
  getByTenantAndCardId(tenantId: string, cardId: string): Promise<CardRecord | undefined>;

  /**
   * Find all non-deleted cards matching a cardId across all tenants.
   * Used by UID global validation to detect cross-tenant duplicates.
   */
  filterByCardIdExcludingDeleted(cardId: string): Promise<CardRecord[]>;

  /**
   * Update a card's status by compound key.
   */
  updateStatus(tenantId: string, cardId: string, status: CardRecord["status"]): Promise<void>;

  /**
   * Insert or replace a card record.
   */
  put(card: CardRecord): Promise<void>;
}
