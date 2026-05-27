/**
 * Shared query helpers for station card and user data.
 * Used by both the React Query queryFn in CardSection and the
 * cache hydration layer in useHydrateCache.
 */

import { localDb } from "#/db/local-db";

export interface StationCardRow {
  cardId: string;
  userId: string | null;
  userName: string | null;
  status: string;
  syncStatus: "pending" | "synced";
  balance: number;
  counter: number;
  expiresAt: string | null;
}

export interface StationUserRow {
  userId: string;
  name: string;
  status: string;
  syncStatus: "pending" | "synced";
}

export async function getCardsWithUsers(tenantId: string): Promise<StationCardRow[]> {
  const [cardRows, userRows] = await Promise.all([
    localDb.cards.where("tenantId").equals(tenantId).toArray(),
    localDb.users.where("tenantId").equals(tenantId).toArray(),
  ]);
  const userMap = new Map<string, string>(userRows.map((u) => [u.userId, u.name]));
  return cardRows
    .filter((c) => c.status !== "deleted")
    .map((c) => ({
      cardId: c.cardId,
      userId: c.userId,
      userName: c.userId != null ? (userMap.get(c.userId) ?? null) : null,
      status: c.status,
      syncStatus: (c.syncStatus ?? "synced") as "pending" | "synced",
      balance: c.balance,
      counter: c.counter,
      expiresAt:
        c.expiresAt != null ? new Date(c.expiresAt * 1000).toISOString().split("T")[0] : null,
    }));
}

export async function getUserRows(tenantId: string): Promise<StationUserRow[]> {
  const users = await localDb.users.where("tenantId").equals(tenantId).toArray();
  return users
    .filter((u) => u.status !== "deleted")
    .map((u) => ({
      userId: u.userId,
      name: u.name,
      status: u.status,
      syncStatus: (u.syncStatus ?? "synced") as "pending" | "synced",
    }));
}
