/**
 * Additional tests for syncConflictResolver.ts covering line 186:
 * resolveMemberConflicts — no toast when localUpdatedAt === 0
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveMemberConflicts } from "../syncConflictResolver";

vi.mock("sonner", () => ({
  toast: { info: vi.fn() },
}));

vi.mock("../syncPull", () => ({
  syncPull: vi.fn().mockResolvedValue({}),
  SyncPullError: class SyncPullError extends Error {},
}));

const mockUsersGet = vi.fn();
const mockUsersPut = vi.fn();

vi.mock("../../db/local-db", () => ({
  localDb: {
    users: {
      get: (...args: unknown[]) => mockUsersGet(...args),
      put: (...args: unknown[]) => mockUsersPut(...args),
    },
    cards: { get: vi.fn(), put: vi.fn() },
    transactionLog: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
      delete: vi.fn(),
    },
  },
}));

import { toast } from "sonner";

describe("resolveMemberConflicts — toast suppression when localUpdatedAt is 0 (line 186)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersPut.mockResolvedValue(undefined);
  });

  it("does NOT show toast when localUpdatedAt is 0 (new member, no prior local edit)", async () => {
    // localUpdatedAt = 0 means the member was never locally modified
    mockUsersGet.mockResolvedValue({
      tenantId: "t-1",
      userId: "m001",
      name: "Local User",
      status: "active",
      createdAt: 1700000000,
      updatedAt: 0, // never locally modified
    });

    await resolveMemberConflicts("t-1", [
      {
        tenantId: "t-1",
        userId: "m001",
        name: "Server User",
        status: "active",
        createdAt: 1700000000,
        updatedAt: 1700002000,
        isAdminAction: false,
      },
    ]);

    // Server wins (updatedAt 1700002000 > 0), but no toast because localUpdatedAt === 0
    expect(mockUsersPut).toHaveBeenCalledTimes(1);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("shows toast when localUpdatedAt > 0 and differs from server", async () => {
    mockUsersGet.mockResolvedValue({
      tenantId: "t-1",
      userId: "m001",
      name: "Local User",
      status: "active",
      createdAt: 1700000000,
      updatedAt: 1700001000, // has a real local edit
    });

    await resolveMemberConflicts("t-1", [
      {
        tenantId: "t-1",
        userId: "m001",
        name: "Server User",
        status: "active",
        createdAt: 1700000000,
        updatedAt: 1700002000,
        isAdminAction: false,
      },
    ]);

    expect(toast.info).toHaveBeenCalledTimes(1);
  });
});
