// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetCardsWithUsers = vi.fn();
vi.mock("#/presentation/hooks/useStationData", () => ({
  getCardsWithUsers: (...args: unknown[]) => mockGetCardsWithUsers(...args),
}));

const mockUsersWhere = vi.fn();
const mockUsersEquals = vi.fn();
const mockUsersToArray = vi.fn();

vi.mock("#/presentation/hooks/useLocalDb", () => ({
  localDb: {
    users: {
      where: (...args: unknown[]) => {
        mockUsersWhere(...args);
        return { equals: mockUsersEquals };
      },
    },
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUsersEquals.mockReturnValue({ toArray: mockUsersToArray });
  mockUsersToArray.mockResolvedValue([]);
  mockGetCardsWithUsers.mockResolvedValue([]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useCardData", () => {
  it("fetches cards with the given tenantId", async () => {
    const { useCardData } = await import("../useCardData");
    const cards = [{ cardId: "c-1", name: "Test Card" }];
    mockGetCardsWithUsers.mockResolvedValue(cards);

    const { result } = renderHook(() => useCardData("tenant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.cards.isSuccess).toBe(true));
    expect(mockGetCardsWithUsers).toHaveBeenCalledWith("tenant-1");
    expect(result.current.cards.data).toEqual(cards);
  });

  it("fetches members filtered by tenantId and excludes deleted", async () => {
    const { useCardData } = await import("../useCardData");
    const allUsers = [
      { id: "u-1", name: "Active", status: "active", tenantId: "tenant-1" },
      { id: "u-2", name: "Deleted", status: "deleted", tenantId: "tenant-1" },
    ];
    mockUsersToArray.mockResolvedValue(allUsers);

    const { result } = renderHook(() => useCardData("tenant-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.members.isSuccess).toBe(true));
    expect(mockUsersWhere).toHaveBeenCalledWith("tenantId");
    expect(result.current.members.data).toEqual([allUsers[0]]);
  });

  it("returns empty arrays when no data", async () => {
    const { useCardData } = await import("../useCardData");

    const { result } = renderHook(() => useCardData("tenant-empty"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.cards.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.members.isSuccess).toBe(true));
    expect(result.current.cards.data).toEqual([]);
    expect(result.current.members.data).toEqual([]);
  });
});
