import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  shouldServerWin,
  resolveMemberConflicts,
  resolveCardConflicts,
  resolveStaleCounterConflicts,
  resolveConflicts,
  showConflictToast,
  CONFLICT_TOAST_DURATION_MS,
  type ServerMemberEntry,
  type ServerCardEntry,
} from "../syncConflictResolver";
import type { User, Card, TransactionLog } from "../../db/local-db";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("../syncPull", () => ({
  syncPull: vi.fn().mockResolvedValue({
    membersPulled: 0,
    cardsPulled: 0,
    transactionsPulled: 0,
    authRequired: false,
  }),
  SyncPullError: class SyncPullError extends Error {
    constructor(
      message: string,
      public readonly cause?: unknown,
    ) {
      super(message);
      this.name = "SyncPullError";
    }
  },
}));

// Mock Dexie/localDb
const mockUsersGet = vi.fn();
const mockUsersPut = vi.fn();
const mockCardsGet = vi.fn();
const mockCardsPut = vi.fn();
const mockTransactionLogWhere = vi.fn();
const mockTransactionLogDelete = vi.fn();

vi.mock("../../db/local-db", () => ({
  localDb: {
    users: {
      get: (...args: unknown[]) => mockUsersGet(...args),
      put: (...args: unknown[]) => mockUsersPut(...args),
    },
    cards: {
      get: (...args: unknown[]) => mockCardsGet(...args),
      put: (...args: unknown[]) => mockCardsPut(...args),
    },
    transactionLog: {
      where: (...args: unknown[]) => mockTransactionLogWhere(...args),
      delete: (...args: unknown[]) => mockTransactionLogDelete(...args),
    },
  },
}));

import { toast } from "sonner";
import { syncPull, SyncPullError } from "../syncPull";

// ── Helpers ────────────────────────────────────────────────────────────

function makeLocalUser(overrides: Partial<User> = {}): User {
  return {
    tenantId: "t-1",
    userId: "m001",
    name: "Local User",
    status: "active",
    createdAt: 1700000000,
    updatedAt: 1700001000,
    ...overrides,
  };
}

function makeServerMember(overrides: Partial<ServerMemberEntry> = {}): ServerMemberEntry {
  return {
    tenantId: "t-1",
    userId: "m001",
    name: "Server User",
    status: "active",
    createdAt: 1700000000,
    updatedAt: 1700002000,
    isAdminAction: false,
    ...overrides,
  };
}

function makeLocalCard(
  overrides: Partial<Card & { updatedAt?: number }> = {},
): Card & { updatedAt?: number } {
  return {
    tenantId: "t-1",
    cardId: "aabbccddee01",
    userId: null,
    status: "active",
    balance: 1000,
    counter: 5,
    keyVersion: 1,
    createdAt: 1700000000,
    lastActivityAt: null,
    expiresAt: null,
    notes: null,
    updatedAt: 1700001000,
    ...overrides,
  };
}

function makeServerCard(overrides: Partial<ServerCardEntry> = {}): ServerCardEntry {
  return {
    tenantId: "t-1",
    cardId: "aabbccddee01",
    userId: null,
    status: "active",
    balance: 1200,
    counter: 7,
    keyVersion: 1,
    createdAt: 1700000000,
    lastActivityAt: null,
    expiresAt: null,
    notes: null,
    updatedAt: 1700002000,
    isAdminAction: false,
    ...overrides,
  };
}

function makePendingTransaction(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    id: 100,
    tenantId: "t-1",
    cardId: "aabbccddee01",
    userId: null,
    cardName: null,
    counter: 6,
    type: "debit",
    amount: 50,
    balanceAfter: 950,
    timestamp: 1700001500,
    hash: "abc123",
    terminalId: null,
    deviceId: null,
    syncStatus: "pending",
    syncedAt: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

function setupTransactionLogMock(entries: TransactionLog[]) {
  mockTransactionLogWhere.mockReturnValue({
    equals: vi.fn().mockReturnValue({
      filter: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(entries),
      }),
      toArray: vi.fn().mockResolvedValue(entries),
      count: vi.fn().mockResolvedValue(entries.length),
    }),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("shouldServerWin", () => {
  it("returns true when isAdminAction is true regardless of timestamps", () => {
    // Server timestamp is older, but admin action wins
    expect(shouldServerWin(1700002000, 1700001000, true)).toBe(true);
  });

  it("returns true when server updatedAt is later (last-write-wins)", () => {
    expect(shouldServerWin(1700001000, 1700002000, false)).toBe(true);
  });

  it("returns false when local updatedAt is later (last-write-wins)", () => {
    expect(shouldServerWin(1700002000, 1700001000, false)).toBe(false);
  });

  it("returns false when timestamps are equal (no overwrite needed)", () => {
    expect(shouldServerWin(1700001000, 1700001000, false)).toBe(false);
  });

  it("returns true for admin action even when timestamps are equal", () => {
    expect(shouldServerWin(1700001000, 1700001000, true)).toBe(true);
  });
});

describe("resolveMemberConflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersGet.mockResolvedValue(undefined);
    mockUsersPut.mockResolvedValue(undefined);
  });

  it("does nothing when no local version exists", async () => {
    mockUsersGet.mockResolvedValue(undefined);

    const result = await resolveMemberConflicts("t-1", [makeServerMember()]);

    expect(result.overwritten).toBe(0);
    expect(mockUsersPut).not.toHaveBeenCalled();
  });

  it("overwrites local member when server updatedAt is later", async () => {
    mockUsersGet.mockResolvedValue(makeLocalUser({ updatedAt: 1700001000 }));

    const serverMember = makeServerMember({ updatedAt: 1700002000 });
    const result = await resolveMemberConflicts("t-1", [serverMember]);

    expect(result.overwritten).toBe(1);
    expect(mockUsersPut).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-1",
        userId: "m001",
        name: "Server User",
        updatedAt: 1700002000,
      }),
    );
  });

  it("does not overwrite local member when local updatedAt is later", async () => {
    mockUsersGet.mockResolvedValue(makeLocalUser({ updatedAt: 1700003000 }));

    const serverMember = makeServerMember({ updatedAt: 1700002000 });
    const result = await resolveMemberConflicts("t-1", [serverMember]);

    expect(result.overwritten).toBe(0);
    expect(mockUsersPut).not.toHaveBeenCalled();
  });

  it("overwrites local member unconditionally for admin actions", async () => {
    // Local is newer, but admin action wins
    mockUsersGet.mockResolvedValue(makeLocalUser({ updatedAt: 1700003000 }));

    const serverMember = makeServerMember({ updatedAt: 1700002000, isAdminAction: true });
    const result = await resolveMemberConflicts("t-1", [serverMember]);

    expect(result.overwritten).toBe(1);
    expect(mockUsersPut).toHaveBeenCalled();
  });

  it("shows toast notification when local edit is overwritten", async () => {
    mockUsersGet.mockResolvedValue(makeLocalUser({ updatedAt: 1700001000 }));

    const serverMember = makeServerMember({ updatedAt: 1700002000, name: "Updated Name" });
    await resolveMemberConflicts("t-1", [serverMember]);

    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining("Updated Name"),
      expect.objectContaining({ duration: CONFLICT_TOAST_DURATION_MS }),
    );
  });
});

describe("resolveCardConflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCardsGet.mockResolvedValue(undefined);
    mockCardsPut.mockResolvedValue(undefined);
    mockTransactionLogDelete.mockResolvedValue(undefined);
    setupTransactionLogMock([]);
  });

  it("does nothing when no local version exists", async () => {
    mockCardsGet.mockResolvedValue(undefined);

    const result = await resolveCardConflicts("t-1", [makeServerCard()]);

    expect(result.overwritten).toBe(0);
    expect(result.outboxDiscarded).toBe(0);
    expect(mockCardsPut).not.toHaveBeenCalled();
  });

  it("overwrites local card and discards outbox when server wins with pending edits", async () => {
    mockCardsGet.mockResolvedValue(makeLocalCard({ updatedAt: 1700001000 }));

    const pendingTx = makePendingTransaction({ cardId: "aabbccddee01" });
    setupTransactionLogMock([pendingTx]);

    const serverCard = makeServerCard({ updatedAt: 1700002000 });
    const result = await resolveCardConflicts("t-1", [serverCard]);

    expect(result.overwritten).toBe(1);
    expect(result.outboxDiscarded).toBe(1);
    expect(mockCardsPut).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "aabbccddee01",
        balance: 1200,
        counter: 7,
      }),
    );
    expect(mockTransactionLogDelete).toHaveBeenCalledWith(100);
  });

  it("does not overwrite when local is newer and no admin action", async () => {
    mockCardsGet.mockResolvedValue(makeLocalCard({ updatedAt: 1700003000 }));

    const pendingTx = makePendingTransaction({ cardId: "aabbccddee01" });
    setupTransactionLogMock([pendingTx]);

    const serverCard = makeServerCard({ updatedAt: 1700002000, isAdminAction: false });
    const result = await resolveCardConflicts("t-1", [serverCard]);

    expect(result.overwritten).toBe(0);
    expect(result.outboxDiscarded).toBe(0);
    expect(mockCardsPut).not.toHaveBeenCalled();
  });

  it("overwrites local card unconditionally for admin actions", async () => {
    mockCardsGet.mockResolvedValue(makeLocalCard({ updatedAt: 1700003000 }));

    const pendingTx = makePendingTransaction({ cardId: "aabbccddee01" });
    setupTransactionLogMock([pendingTx]);

    const serverCard = makeServerCard({ updatedAt: 1700002000, isAdminAction: true });
    const result = await resolveCardConflicts("t-1", [serverCard]);

    expect(result.overwritten).toBe(1);
    expect(result.outboxDiscarded).toBe(1);
  });

  it("shows toast notification when card is overwritten", async () => {
    mockCardsGet.mockResolvedValue(makeLocalCard({ updatedAt: 1700001000 }));

    const pendingTx = makePendingTransaction({ cardId: "aabbccddee01" });
    setupTransactionLogMock([pendingTx]);

    const serverCard = makeServerCard({ updatedAt: 1700002000, cardId: "aabbccddee01" });
    await resolveCardConflicts("t-1", [serverCard]);

    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining("aabbccddee01"),
      expect.objectContaining({ duration: 5000 }),
    );
  });

  it("does not overwrite when no pending edits exist (handled by normal merge)", async () => {
    mockCardsGet.mockResolvedValue(makeLocalCard({ updatedAt: 1700001000 }));
    setupTransactionLogMock([]); // No pending entries

    const serverCard = makeServerCard({ updatedAt: 1700002000 });
    const result = await resolveCardConflicts("t-1", [serverCard]);

    // No pending edits means no conflict to resolve here
    expect(result.overwritten).toBe(0);
    expect(result.outboxDiscarded).toBe(0);
  });
});

describe("resolveStaleCounterConflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransactionLogMock([]);
  });

  it("does nothing when no conflict entries exist", async () => {
    setupTransactionLogMock([]);

    const result = await resolveStaleCounterConflicts("t-1");

    expect(result.pullAttempted).toBe(false);
    expect(result.pullSucceeded).toBe(true);
    expect(syncPull).not.toHaveBeenCalled();
  });

  it("triggers a pull when conflict entries exist", async () => {
    const conflictEntry = makePendingTransaction({ syncStatus: "conflict" });
    setupTransactionLogMock([conflictEntry]);

    const result = await resolveStaleCounterConflicts("t-1");

    expect(result.pullAttempted).toBe(true);
    expect(result.pullSucceeded).toBe(true);
    expect(syncPull).toHaveBeenCalledWith("t-1");
  });

  it("retains conflict status on network failure during pull", async () => {
    const conflictEntry = makePendingTransaction({ syncStatus: "conflict" });
    setupTransactionLogMock([conflictEntry]);

    vi.mocked(syncPull).mockRejectedValueOnce(new SyncPullError("Network failure"));

    const result = await resolveStaleCounterConflicts("t-1");

    expect(result.pullAttempted).toBe(true);
    expect(result.pullSucceeded).toBe(false);
  });

  it("retains conflict status on TypeError (network error)", async () => {
    const conflictEntry = makePendingTransaction({ syncStatus: "conflict" });
    setupTransactionLogMock([conflictEntry]);

    vi.mocked(syncPull).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await resolveStaleCounterConflicts("t-1");

    expect(result.pullAttempted).toBe(true);
    expect(result.pullSucceeded).toBe(false);
  });

  it("re-throws non-network errors", async () => {
    const conflictEntry = makePendingTransaction({ syncStatus: "conflict" });
    setupTransactionLogMock([conflictEntry]);

    vi.mocked(syncPull).mockRejectedValueOnce(new Error("Auth error"));

    await expect(resolveStaleCounterConflicts("t-1")).rejects.toThrow("Auth error");
  });
});

describe("resolveConflicts (main entry point)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersGet.mockResolvedValue(undefined);
    mockUsersPut.mockResolvedValue(undefined);
    mockCardsGet.mockResolvedValue(undefined);
    mockCardsPut.mockResolvedValue(undefined);
    mockTransactionLogDelete.mockResolvedValue(undefined);
    setupTransactionLogMock([]);
  });

  it("returns zero counts when no conflicts exist", async () => {
    const result = await resolveConflicts("t-1", [], []);

    expect(result.membersOverwritten).toBe(0);
    expect(result.cardsOverwritten).toBe(0);
    expect(result.outboxEntriesDiscarded).toBe(0);
    expect(result.pullAttempted).toBe(false);
    expect(result.pullSucceeded).toBe(true);
  });

  it("resolves member and card conflicts together", async () => {
    // Setup member conflict
    mockUsersGet.mockResolvedValue(makeLocalUser({ updatedAt: 1700001000 }));

    // Setup card conflict with pending entries
    mockCardsGet.mockResolvedValue(makeLocalCard({ updatedAt: 1700001000 }));
    const pendingTx = makePendingTransaction({ cardId: "aabbccddee01" });
    setupTransactionLogMock([pendingTx]);

    const result = await resolveConflicts(
      "t-1",
      [makeServerMember({ updatedAt: 1700002000 })],
      [makeServerCard({ updatedAt: 1700002000 })],
    );

    expect(result.membersOverwritten).toBe(1);
    expect(result.cardsOverwritten).toBe(1);
    expect(result.outboxEntriesDiscarded).toBe(1);
  });

  it("handles empty server data gracefully", async () => {
    const result = await resolveConflicts("t-1");

    expect(result.membersOverwritten).toBe(0);
    expect(result.cardsOverwritten).toBe(0);
    expect(result.outboxEntriesDiscarded).toBe(0);
  });
});

describe("showConflictToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows toast with member label for member conflicts", () => {
    showConflictToast("member", "John Doe");

    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining("Anggota"),
      expect.objectContaining({ duration: 5000 }),
    );
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining("John Doe"),
      expect.any(Object),
    );
  });

  it("shows toast with card label for card conflicts", () => {
    showConflictToast("card", "aabbccddee01");

    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining("Kartu"),
      expect.objectContaining({ duration: 5000 }),
    );
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining("aabbccddee01"),
      expect.any(Object),
    );
  });

  it("uses 5-second duration for toast notifications", () => {
    showConflictToast("member", "Test");

    expect(toast.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ duration: 5000 }),
    );
  });
});
