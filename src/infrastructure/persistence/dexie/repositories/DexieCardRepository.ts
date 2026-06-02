import type { CardRepository } from "#/core/interfaces/CardRepository";
import type { CardRecord } from "#/core/interfaces/types";
import type { Card } from "#/infrastructure/persistence/dexie/localDb";
import { localDb } from "#/infrastructure/persistence/dexie/localDb";

export class DexieCardRepository implements CardRepository {
  async getByTenantAndCardId(tenantId: string, cardId: string): Promise<CardRecord | undefined> {
    const card = await localDb.cards.get([tenantId, cardId]);
    return card ? this.toCardRecord(card) : undefined;
  }

  async filterByCardIdExcludingDeleted(cardId: string): Promise<CardRecord[]> {
    const cards = await localDb.cards
      .filter((card) => card.cardId === cardId && card.status !== "deleted")
      .toArray();
    return cards.map((c) => this.toCardRecord(c));
  }

  async updateStatus(
    tenantId: string,
    cardId: string,
    status: CardRecord["status"],
  ): Promise<void> {
    await localDb.cards.update([tenantId, cardId], { status });
  }

  async put(card: CardRecord): Promise<void> {
    await localDb.cards.put({
      ...card,
      syncStatus: "pending",
    });
  }

  private toCardRecord(card: Card): CardRecord {
    return {
      tenantId: card.tenantId,
      cardId: card.cardId,
      userId: card.userId,
      status: card.status,
      balance: card.balance,
      counter: card.counter,
      keyVersion: card.keyVersion,
      createdAt: card.createdAt,
      lastActivityAt: card.lastActivityAt,
      expiresAt: card.expiresAt,
      notes: card.notes,
    };
  }
}
