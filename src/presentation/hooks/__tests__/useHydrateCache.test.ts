// @vitest-environment jsdom
/**
 * Tests for src/hooks/useHydrateCache.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockSetQueryData = vi.fn();
const mockUseQueryClient = vi.fn();
const mockUseLocation = vi.fn();

const mockUsersWhere = vi.fn().mockReturnThis();
const mockUsersEquals = vi.fn().mockReturnThis();
const mockUsersToArray = vi.fn().mockResolvedValue([]);
const mockCardsWhere = vi.fn().mockReturnThis();
const mockCardsEquals = vi.fn().mockReturnThis();
const mockCardsToArray = vi.fn().mockResolvedValue([]);

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mockUseQueryClient(),
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => mockUseLocation(),
}));

vi.mock("#/infrastructure/persistence/dexie/localDb", () => ({
  localDb: {
    users: {
      where: (...args: unknown[]) => {
        mockUsersWhere(...args);
        return {
          equals: (...a: unknown[]) => {
            mockUsersEquals(...a);
            return { toArray: () => mockUsersToArray() };
          },
        };
      },
    },
    cards: {
      where: (...args: unknown[]) => {
        mockCardsWhere(...args);
        return {
          equals: (...a: unknown[]) => {
            mockCardsEquals(...a);
            return { toArray: () => mockCardsToArray() };
          },
        };
      },
    },
  },
}));

describe("hydrateQueryCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersToArray.mockResolvedValue([]);
    mockCardsToArray.mockResolvedValue([]);
  });

  it("sets station-cards and users query data", async () => {
    const { hydrateQueryCache } = await import("../useHydrateCache");
    const qc = { setQueryData: mockSetQueryData };

    await hydrateQueryCache(qc, "t-1");

    expect(mockSetQueryData).toHaveBeenCalledWith(["station-cards", "t-1"], expect.any(Array));
    expect(mockSetQueryData).toHaveBeenCalledWith(["users", "t-1"], expect.any(Array));
  });

  it("filters out deleted cards from station-cards", async () => {
    const { hydrateQueryCache } = await import("../useHydrateCache");
    mockCardsToArray.mockResolvedValue([
      {
        cardId: "c-1",
        status: "active",
        userId: null,
        balance: 1000,
        counter: 1,
        expiresAt: null,
        syncStatus: "synced",
      },
      {
        cardId: "c-2",
        status: "deleted",
        userId: null,
        balance: 0,
        counter: 0,
        expiresAt: null,
        syncStatus: "synced",
      },
    ]);

    const qc = { setQueryData: mockSetQueryData };
    await hydrateQueryCache(qc, "t-1");

    const stationCardsCall = mockSetQueryData.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[0]) && c[0][0] === "station-cards",
    );
    const stationCards = stationCardsCall?.[1] as { cardId: string }[];
    expect(stationCards).toHaveLength(1);
    expect(stationCards[0].cardId).toBe("c-1");
  });

  it("filters out deleted users from users list", async () => {
    const { hydrateQueryCache } = await import("../useHydrateCache");
    mockUsersToArray.mockResolvedValue([
      {
        userId: "u-1",
        name: "Alice",
        status: "active",
        tenantId: "t-1",
        createdAt: 1000,
        updatedAt: 2000,
        syncStatus: "synced",
      },
      {
        userId: "u-2",
        name: "Bob",
        status: "deleted",
        tenantId: "t-1",
        createdAt: 1000,
        updatedAt: 2000,
        syncStatus: "synced",
      },
    ]);

    const qc = { setQueryData: mockSetQueryData };
    await hydrateQueryCache(qc, "t-1");

    const usersCall = mockSetQueryData.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[0]) && c[0][0] === "users",
    );
    const users = usersCall?.[1] as { userId: string }[];
    expect(users).toHaveLength(1);
    expect(users[0].userId).toBe("u-1");
  });

  it("maps userId to userName in station-cards", async () => {
    const { hydrateQueryCache } = await import("../useHydrateCache");
    mockUsersToArray.mockResolvedValue([
      {
        userId: "u-1",
        name: "Alice",
        status: "active",
        tenantId: "t-1",
        createdAt: 1000,
        updatedAt: 2000,
        syncStatus: "synced",
      },
    ]);
    mockCardsToArray.mockResolvedValue([
      {
        cardId: "c-1",
        status: "active",
        userId: "u-1",
        balance: 1000,
        counter: 1,
        expiresAt: null,
        syncStatus: "synced",
      },
    ]);

    const qc = { setQueryData: mockSetQueryData };
    await hydrateQueryCache(qc, "t-1");

    const stationCardsCall = mockSetQueryData.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[0]) && c[0][0] === "station-cards",
    );
    const stationCards = stationCardsCall?.[1] as { userName: string | null }[];
    expect(stationCards[0].userName).toBe("Alice");
  });
});

describe("useHydrateCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersToArray.mockResolvedValue([]);
    mockCardsToArray.mockResolvedValue([]);
    mockUseQueryClient.mockReturnValue({ setQueryData: mockSetQueryData });
    mockUseLocation.mockReturnValue({ pathname: "/tenant/t-1/admin" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when tenantId is null", async () => {
    const { useHydrateCache } = await import("../useHydrateCache");
    renderHook(() => useHydrateCache(null));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockSetQueryData).not.toHaveBeenCalled();
  });

  it("hydrates cache on mount when tenantId is provided", async () => {
    const { useHydrateCache } = await import("../useHydrateCache");
    renderHook(() => useHydrateCache("t-1"));

    await waitFor(() => {
      expect(mockSetQueryData).toHaveBeenCalled();
    });
  });

  it("re-hydrates when location.pathname changes", async () => {
    const { useHydrateCache } = await import("../useHydrateCache");
    mockUseLocation.mockReturnValue({ pathname: "/tenant/t-1/admin" });

    const { rerender } = renderHook(() => useHydrateCache("t-1"));

    await waitFor(() => {
      expect(mockSetQueryData).toHaveBeenCalled();
    });

    const callCount = mockSetQueryData.mock.calls.length;

    // Simulate navigation
    mockUseLocation.mockReturnValue({ pathname: "/tenant/t-1/cards" });
    rerender();

    await waitFor(() => {
      expect(mockSetQueryData.mock.calls.length).toBeGreaterThan(callCount);
    });
  });

  it("re-hydrates when lastSyncedAt changes", async () => {
    const { useHydrateCache } = await import("../useHydrateCache");

    const { rerender } = renderHook(
      ({ lastSyncedAt }: { lastSyncedAt?: number }) => useHydrateCache("t-1", lastSyncedAt),
      { initialProps: { lastSyncedAt: undefined as number | undefined } },
    );

    await waitFor(() => {
      expect(mockSetQueryData).toHaveBeenCalled();
    });

    const callCount = mockSetQueryData.mock.calls.length;

    rerender({ lastSyncedAt: Date.now() });

    await waitFor(() => {
      expect(mockSetQueryData.mock.calls.length).toBeGreaterThan(callCount);
    });
  });
});
