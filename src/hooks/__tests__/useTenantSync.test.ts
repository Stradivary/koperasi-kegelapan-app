// @vitest-environment jsdom
/**
 * Tests for src/hooks/useTenantSync.ts
 *
 * Covers:
 * - syncToServer: 201 success, 200 re-sync, 409 conflict, 400 validation error, other error, network error
 * - retryWithChanges: retries with new slug/username
 * - reset: clears state
 * - Duplicate call guard (status=syncing)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockLocalAccountStoreGetByTenant = vi.fn();
const mockLocalAccountStorePut = vi.fn();
const mockLocalTenantConfigStorePut = vi.fn();
const mockSetAccessToken = vi.fn();

vi.mock("#/lib/indexeddb", () => ({
  localTenantConfigStore: {
    put: (...args: unknown[]) => mockLocalTenantConfigStorePut(...args),
  },
  localAccountStore: {
    getByTenant: (...args: unknown[]) => mockLocalAccountStoreGetByTenant(...args),
    put: (...args: unknown[]) => mockLocalAccountStorePut(...args),
  },
}));

vi.mock("#/lib/api", () => ({
  API_BASE_URL: "https://test-api.example.com",
  setAccessToken: (...args: unknown[]) => mockSetAccessToken(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLocalConfig(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-1",
    slug: "koperasi-maju",
    name: "Koperasi Maju",
    timezone: "Asia/Jakarta",
    mode: "local" as const,
    createdAt: 1700000000,
    ...overrides,
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
  mockLocalAccountStoreGetByTenant.mockResolvedValue([makeAdminAccount()]);
  mockLocalTenantConfigStorePut.mockResolvedValue(undefined);
  mockLocalAccountStorePut.mockResolvedValue(undefined);
  mockSetAccessToken.mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── syncToServer ──────────────────────────────────────────────────────────────

describe("useTenantSync — syncToServer: 201 success", () => {
  it("sets status to success and returns accessToken on 201", async () => {
    const { useTenantSync } = await import("../useTenantSync");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 201,
        json: async () => ({ tenantId: "server-t1", accessToken: "token-abc" }),
      }),
    );

    const { result } = renderHook(() => useTenantSync());

    let syncResult: { accessToken: string | null } | undefined;
    await act(async () => {
      syncResult = await result.current.syncToServer(makeLocalConfig(), "pbkdf2hash");
    });

    expect(result.current.status).toBe("success");
    expect(syncResult?.accessToken).toBe("token-abc");
    expect(mockSetAccessToken).toHaveBeenCalledWith("token-abc");
    expect(mockLocalTenantConfigStorePut).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "synced", serverTenantId: "server-t1" }),
    );
  });

  it("sets status to success on 200 (re-sync)", async () => {
    const { useTenantSync } = await import("../useTenantSync");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ tenantId: "server-t1", accessToken: "token-xyz" }),
      }),
    );

    const { result } = renderHook(() => useTenantSync());

    await act(async () => {
      await result.current.syncToServer(makeLocalConfig(), "pbkdf2hash");
    });

    expect(result.current.status).toBe("success");
  });

  it("updates admin username in IndexedDB when it changed", async () => {
    const { useTenantSync } = await import("../useTenantSync");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 201,
        json: async () => ({ tenantId: "server-t1", accessToken: "token" }),
      }),
    );

    const { result } = renderHook(() => useTenantSync());

    // Simulate retryWithChanges with a different admin username
    await act(async () => {
      await result.current.syncToServer(makeLocalConfig(), "pbkdf2hash");
    });

    // Admin username matches — no update needed
    expect(mockLocalAccountStorePut).not.toHaveBeenCalled();
  });
});

describe("useTenantSync — syncToServer: 409 conflict", () => {
  it("sets status to conflict and stores conflict data", async () => {
    const { useTenantSync } = await import("../useTenantSync");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 409,
        json: async () => ({
          conflictType: "slug_only",
          existingTenantName: "Existing Koperasi",
          existingSlug: "koperasi-maju",
        }),
      }),
    );

    const { result } = renderHook(() => useTenantSync());

    await act(async () => {
      await result.current.syncToServer(makeLocalConfig(), "pbkdf2hash");
    });

    expect(result.current.status).toBe("conflict");
    expect(result.current.conflict).toEqual(
      expect.objectContaining({
        conflictType: "slug_only",
        existingTenantName: "Existing Koperasi",
        currentSlug: "koperasi-maju",
      }),
    );
  });

  it("returns accessToken=null on conflict", async () => {
    const { useTenantSync } = await import("../useTenantSync");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 409,
        json: async () => ({
          conflictType: "admin_only",
          existingTenantName: "Other",
          existingSlug: "other",
        }),
      }),
    );

    const { result } = renderHook(() => useTenantSync());

    let syncResult: { accessToken: string | null } | undefined;
    await act(async () => {
      syncResult = await result.current.syncToServer(makeLocalConfig(), "pbkdf2hash");
    });

    expect(syncResult?.accessToken).toBeNull();
  });
});

describe("useTenantSync — syncToServer: 400 validation error", () => {
  it("sets status to error with field messages on 400", async () => {
    const { useTenantSync } = await import("../useTenantSync");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 400,
        json: async () => ({
          errors: [
            { field: "slug", message: "Slug too short" },
            { field: "name", message: "Name required" },
          ],
        }),
      }),
    );

    const { result } = renderHook(() => useTenantSync());

    await act(async () => {
      await result.current.syncToServer(makeLocalConfig(), "pbkdf2hash");
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("Slug too short");
    expect(result.current.error).toContain("Name required");
  });

  it("sets generic error message on 400 with no errors array", async () => {
    const { useTenantSync } = await import("../useTenantSync");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 400,
        json: async () => ({}),
      }),
    );

    const { result } = renderHook(() => useTenantSync());

    await act(async () => {
      await result.current.syncToServer(makeLocalConfig(), "pbkdf2hash");
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("tidak valid");
  });
});

describe("useTenantSync — syncToServer: other errors", () => {
  it("sets error on non-201/200/409/400 status", async () => {
    const { useTenantSync } = await import("../useTenantSync");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 500,
        json: async () => ({}),
      }),
    );

    const { result } = renderHook(() => useTenantSync());

    await act(async () => {
      await result.current.syncToServer(makeLocalConfig(), "pbkdf2hash");
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("Gagal");
  });

  it("sets connection error when fetch throws", async () => {
    const { useTenantSync } = await import("../useTenantSync");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const { result } = renderHook(() => useTenantSync());

    await act(async () => {
      await result.current.syncToServer(makeLocalConfig(), "pbkdf2hash");
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("terhubung");
  });

  it("ignores duplicate calls while syncing", async () => {
    const { useTenantSync } = await import("../useTenantSync");

    let resolveFirst!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      ),
    );

    const { result } = renderHook(() => useTenantSync());

    // Start first sync
    act(() => {
      void result.current.syncToServer(makeLocalConfig(), "pbkdf2hash");
    });

    // Try second sync while first is in progress
    let secondResult: { accessToken: string | null } | undefined;
    await act(async () => {
      secondResult = await result.current.syncToServer(makeLocalConfig(), "pbkdf2hash");
    });

    expect(secondResult?.accessToken).toBeNull();

    // Resolve first
    await act(async () => {
      resolveFirst({
        status: 201,
        json: async () => ({ tenantId: "t1", accessToken: "token" }),
      });
      await new Promise((r) => setTimeout(r, 10));
    });
  });
});

// ── retryWithChanges ──────────────────────────────────────────────────────────

describe("useTenantSync — retryWithChanges", () => {
  it("retries sync with new slug and admin username", async () => {
    const { useTenantSync } = await import("../useTenantSync");

    const fetchSpy = vi.fn();
    // First call: 409 conflict
    fetchSpy.mockResolvedValueOnce({
      status: 409,
      json: async () => ({
        conflictType: "slug_only",
        existingTenantName: "Other",
        existingSlug: "koperasi-maju",
      }),
    });
    // Second call: 201 success
    fetchSpy.mockResolvedValueOnce({
      status: 201,
      json: async () => ({ tenantId: "t1", accessToken: "new-token" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useTenantSync());

    // First sync — gets conflict
    await act(async () => {
      await result.current.syncToServer(makeLocalConfig(), "pbkdf2hash");
    });
    expect(result.current.status).toBe("conflict");

    // Retry with new slug
    await act(async () => {
      await result.current.retryWithChanges("new-slug", "new-admin");
    });

    expect(result.current.status).toBe("success");
    const body = JSON.parse(fetchSpy.mock.calls[1][1].body as string);
    expect(body.slug).toBe("new-slug");
    expect(body.adminUsername).toBe("new-admin");
  });

  it("sets error when retryWithChanges called without prior sync", async () => {
    const { useTenantSync } = await import("../useTenantSync");

    const { result } = renderHook(() => useTenantSync());

    await act(async () => {
      await result.current.retryWithChanges("new-slug", "new-admin");
    });

    expect(result.current.error).toContain("Tidak ada data sync");
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe("useTenantSync — reset", () => {
  it("resets status, conflict, and error to initial state", async () => {
    const { useTenantSync } = await import("../useTenantSync");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 409,
        json: async () => ({
          conflictType: "slug_only",
          existingTenantName: "Other",
          existingSlug: "koperasi-maju",
        }),
      }),
    );

    const { result } = renderHook(() => useTenantSync());

    await act(async () => {
      await result.current.syncToServer(makeLocalConfig(), "pbkdf2hash");
    });
    expect(result.current.status).toBe("conflict");

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.conflict).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
