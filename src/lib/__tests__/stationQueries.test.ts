/**
 * Tests for src/lib/stationQueries.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCardsToArray = vi.fn();
const mockUsersToArray = vi.fn();

vi.mock("#/infrastructure/persistence/dexie/localDb", () => ({
  localDb: {
    cards: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      toArray: (...args: unknown[]) => mockCardsToArray(...args),
    },
    users: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      toArray: (...args: unknown[]) => mockUsersToArray(...args),
    },
  },
}));

import { getCardsWithUsers, getUserRows } from "../stationQueries";

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "t-1",
    cardId: "aabbccdd",
    userId: null,
    status: "active",
    syncStatus: "synced",
    balance: 50_000,
    counter: 1,
    expiresAt: null,
    ...overrides,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "t-1",
    userId: "u-1",
    name: "Alice",
    status: "active",
    syncStatus: "synced",
    ...overrides,
  };
}

describe("getCardsWithUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCardsToArray.mockResolvedValue([]);
    mockUsersToArray.mockResolvedValue([]);
  });

  it("returns empty array when no cards", async () => {
    const result = await getCardsWithUsers("t-1");
    expect(result).toEqual([]);
  });

  it("filters out deleted cards", async () => {
    mockCardsToArray.mockResolvedValue([
      makeCard({ cardId: "aa", status: "active" }),
      makeCard({ cardId: "bb", status: "deleted" }),
    ]);
    const result = await getCardsWithUsers("t-1");
    expect(result).toHaveLength(1);
    expect(result[0].cardId).toBe("aa");
  });

  it("maps userId to userName when user exists", async () => {
    mockCardsToArray.mockResolvedValue([makeCard({ userId: "u-1" })]);
    mockUsersToArray.mockResolvedValue([makeUser({ userId: "u-1", name: "Alice" })]);
    const result = await getCardsWithUsers("t-1");
    expect(result[0].userName).toBe("Alice");
  });

  it("sets userName to null when userId is null", async () => {
    mockCardsToArray.mockResolvedValue([makeCard({ userId: null })]);
    const result = await getCardsWithUsers("t-1");
    expect(result[0].userName).toBeNull();
  });

  it("sets userName to null when userId has no matching user", async () => {
    mockCardsToArray.mockResolvedValue([makeCard({ userId: "u-unknown" })]);
    mockUsersToArray.mockResolvedValue([]);
    const result = await getCardsWithUsers("t-1");
    expect(result[0].userName).toBeNull();
  });

  it("converts expiresAt unix timestamp to ISO date string", async () => {
    // 2026-01-01 00:00:00 UTC = 1767225600
    mockCardsToArray.mockResolvedValue([makeCard({ expiresAt: 1767225600 })]);
    const result = await getCardsWithUsers("t-1");
    expect(result[0].expiresAt).toBe("2026-01-01");
  });

  it("sets expiresAt to null when card has no expiry", async () => {
    mockCardsToArray.mockResolvedValue([makeCard({ expiresAt: null })]);
    const result = await getCardsWithUsers("t-1");
    expect(result[0].expiresAt).toBeNull();
  });

  it("defaults syncStatus to 'synced' when undefined", async () => {
    mockCardsToArray.mockResolvedValue([makeCard({ syncStatus: undefined })]);
    const result = await getCardsWithUsers("t-1");
    expect(result[0].syncStatus).toBe("synced");
  });

  it("preserves 'pending' syncStatus", async () => {
    mockCardsToArray.mockResolvedValue([makeCard({ syncStatus: "pending" })]);
    const result = await getCardsWithUsers("t-1");
    expect(result[0].syncStatus).toBe("pending");
  });

  it("maps all card fields correctly", async () => {
    mockCardsToArray.mockResolvedValue([
      makeCard({ cardId: "cc", userId: "u-1", balance: 99_000, counter: 7 }),
    ]);
    mockUsersToArray.mockResolvedValue([makeUser({ userId: "u-1", name: "Bob" })]);
    const result = await getCardsWithUsers("t-1");
    expect(result[0]).toMatchObject({
      cardId: "cc",
      userId: "u-1",
      userName: "Bob",
      balance: 99_000,
      counter: 7,
    });
  });
});

describe("getUserRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersToArray.mockResolvedValue([]);
  });

  it("returns empty array when no users", async () => {
    const result = await getUserRows("t-1");
    expect(result).toEqual([]);
  });

  it("filters out deleted users", async () => {
    mockUsersToArray.mockResolvedValue([
      makeUser({ userId: "u-1", status: "active" }),
      makeUser({ userId: "u-2", status: "deleted" }),
    ]);
    const result = await getUserRows("t-1");
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("u-1");
  });

  it("defaults syncStatus to 'synced' when undefined", async () => {
    mockUsersToArray.mockResolvedValue([makeUser({ syncStatus: undefined })]);
    const result = await getUserRows("t-1");
    expect(result[0].syncStatus).toBe("synced");
  });

  it("preserves 'pending' syncStatus", async () => {
    mockUsersToArray.mockResolvedValue([makeUser({ syncStatus: "pending" })]);
    const result = await getUserRows("t-1");
    expect(result[0].syncStatus).toBe("pending");
  });

  it("maps all user fields correctly", async () => {
    mockUsersToArray.mockResolvedValue([
      makeUser({ userId: "u-5", name: "Charlie", status: "active", syncStatus: "synced" }),
    ]);
    const result = await getUserRows("t-1");
    expect(result[0]).toEqual({
      userId: "u-5",
      name: "Charlie",
      status: "active",
      syncStatus: "synced",
    });
  });
});
