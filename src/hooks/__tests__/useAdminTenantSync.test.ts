// @vitest-environment jsdom
/**
 * Tests for src/hooks/useAdminTenantSync.ts
 *
 * Covers:
 * - onSyncToServer is undefined for already-synced tenants
 * - onSyncToServer is defined for local-only tenants
 * - Full orchestrated sync sequence (syncing-tenant → pushing-members → pushing-cards → pushing-transactions → complete)
 * - Sync halts and surfaces error when any step fails
 * - No admin account found error
 * - syncStep and isSyncingToServer state tracking
 * - retryWithChanges and resetSync delegation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockLocalTenantConfigStoreGet = vi.fn();
const mockLocalAccountStoreGetByTenant = vi.fn();

vi.mock("#/lib/indexeddb", () => ({
  localTenantConfigStore: {
    get: (...args: unknown[]) => mockLocalTenantConfigStoreGet(...args),
  },
  localAccountStore: {
    getByTenant: (...args: unknown[]) => mockLocalAccountStoreGetByTenant(...args),
  },
}));

const mockSyncToServer = vi.fn();
const mockRetryWithChanges = vi.fn();
const mockReset = vi.fn();

vi.mock("../useTenantSync", () => ({
  useTenantSync: () => ({
    status: "idle",
    conflict: null,
    syncToServer: mockSyncToServer,
    retryWithChanges: mockRetryWithChanges,
    reset: mockReset,
  }),
}));

const mockSyncPushMembers = vi.fn();
const mockSyncPushCards = vi.fn();
vi.mock("#/lib/syncPushEntities", () => ({
  syncPushMembers: (...args: unknown[]) => mockSyncPushMembers(...args),
  syncPushCards: (...args: unknown[]) => mockSyncPushCards(...args),
}));

const mockSyncPush = vi.fn();
vi.mock("#/lib/syncPush", () => ({
  syncPush: (...args: unknown[]) => mockSyncPush(...args),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockQueryClientInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockQueryClientInvalidateQueries,
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLocalConfig(mode: "local" | "synced" = "local") {
  return {
    tenantId: "tenant-1",
    slug: "koperasi-maju",
    name: "Koperasi Maju",
    timezone: "Asia/Jakarta",
    mode,
    createdAt: 1700000000,
  };
}

function makeAdminAccount() {
  return {
    accountId: "acc-1",
    tenantId: "tenant-1",
    username: "admin",
    passwordHash: "pbkdf2hash",
    role: "admin",
    status: "active",
    createdAt: 1700000000,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockLocalTenantConfigStoreGet.mockResolvedValue(makeLocalConfig("local"));
  mockLocalAccountStoreGetByTenant.mockResolvedValue([makeAdminAccount()]);
  mockSyncToServer.mockResolvedValue({ accessToken: "token-abc" });
  mockSyncPushMembers.mockResolvedValue(undefined);
  mockSyncPushCards.mockResolvedValue(undefined);
  mockSyncPush.mockResolvedValue(undefined);
  mockRetryWithChanges.mockResolvedValue(undefined);
  mockReset.mockReturnValue(undefined);
  mockQueryClientInvalidateQueries.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── onSyncToServer availability ───────────────────────────────────────────────

describe("useAdminTenantSync - onSyncToServer availability", () => {
  it("onSyncToServer is undefined when tenant is already synced", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");
    mockLocalTenantConfigStoreGet.mockResolvedValue(makeLocalConfig("synced"));

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.onSyncToServer).toBeUndefined();
  });

  it("onSyncToServer is defined when tenant is local-only", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");
    mockLocalTenantConfigStoreGet.mockResolvedValue(makeLocalConfig("local"));

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.onSyncToServer).toBeDefined();
  });

  it("onSyncToServer is undefined when config is null (not loaded yet)", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");
    mockLocalTenantConfigStoreGet.mockResolvedValue(null);

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.onSyncToServer).toBeUndefined();
  });
});

// ── Full orchestrated sync ────────────────────────────────────────────────────

describe("useAdminTenantSync - full orchestrated sync", () => {
  it("runs all 4 steps in order and sets syncStep to complete", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.onSyncToServer!();
    });

    expect(mockSyncToServer).toHaveBeenCalledOnce();
    expect(mockSyncPushMembers).toHaveBeenCalledWith("tenant-1");
    expect(mockSyncPushCards).toHaveBeenCalledWith("tenant-1");
    expect(mockSyncPush).toHaveBeenCalledWith("tenant-1");
    expect(result.current.syncStep).toBe("complete");
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it("invalidates queries after successful sync", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.onSyncToServer!();
    });

    expect(mockQueryClientInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["users", "tenant-1"] }),
    );
    expect(mockQueryClientInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["station-cards", "tenant-1"] }),
    );
    expect(mockQueryClientInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["transactions", "tenant-1"] }),
    );
  });

  it("halts sync when syncToServer returns no accessToken", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");
    mockSyncToServer.mockResolvedValue({ accessToken: null });

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.onSyncToServer!();
    });

    expect(mockSyncPushMembers).not.toHaveBeenCalled();
    expect(result.current.syncStep).toBeNull();
  });

  it("sets syncError and shows toast when syncPushMembers fails", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");
    mockSyncPushMembers.mockRejectedValue(new Error("Members push failed"));

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.onSyncToServer!();
    });

    expect(result.current.syncError).toContain("Members push failed");
    expect(mockToastError).toHaveBeenCalled();
    expect(mockSyncPushCards).not.toHaveBeenCalled();
  });

  it("sets syncError when syncPushCards fails", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");
    mockSyncPushCards.mockRejectedValue(new Error("Cards push failed"));

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.onSyncToServer!();
    });

    expect(result.current.syncError).toContain("Cards push failed");
    expect(mockSyncPush).not.toHaveBeenCalled();
  });

  it("sets syncError when syncPush (transactions) fails", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");
    mockSyncPush.mockRejectedValue(new Error("Transactions push failed"));

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.onSyncToServer!();
    });

    expect(result.current.syncError).toContain("Transactions push failed");
  });
});

// ── No admin account ──────────────────────────────────────────────────────────

describe("useAdminTenantSync - no admin account", () => {
  it("sets syncError when no admin account found", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");
    mockLocalAccountStoreGetByTenant.mockResolvedValue([
      { ...makeAdminAccount(), role: "station" }, // no admin
    ]);

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.onSyncToServer!();
    });

    expect(result.current.syncError).toContain("No admin account");
    expect(mockSyncToServer).not.toHaveBeenCalled();
  });
});

// ── isSyncingToServer ─────────────────────────────────────────────────────────

describe("useAdminTenantSync - isSyncingToServer", () => {
  it("is false initially", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.isSyncingToServer).toBe(false);
  });

  it("is false after successful sync completes", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.onSyncToServer!();
    });

    expect(result.current.isSyncingToServer).toBe(false);
  });
});

// ── retryWithChanges and resetSync ────────────────────────────────────────────

describe("useAdminTenantSync - retryWithChanges and resetSync", () => {
  it("delegates retryWithChanges to useTenantSync", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.retryWithChanges("new-slug", "new-admin");
    });

    expect(mockRetryWithChanges).toHaveBeenCalledWith("new-slug", "new-admin");
  });

  it("delegates resetSync to useTenantSync.reset", async () => {
    const { useAdminTenantSync } = await import("../useAdminTenantSync");

    const { result } = renderHook(() => useAdminTenantSync("tenant-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    act(() => {
      result.current.resetSync();
    });

    expect(mockReset).toHaveBeenCalledOnce();
  });
});
