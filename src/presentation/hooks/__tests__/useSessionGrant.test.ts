// @vitest-environment jsdom
/**
 * Tests for useSessionGrant.ts covering uncovered lines:
 * - Lines 177/201-244: handleOnlineRefresh paths (fetch success, fetch fail with/without cache)
 * - Lines 272/280: handleOfflineRefresh paths (with/without cache)
 * - Lines 307-309: offline grace period path in readGrantFromCache
 * - Lines 332-333: isValid check with offline + expired grant
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock dependencies
const mockApiFetch = vi.fn();
vi.mock("#/infrastructure/api/apiClient", () => ({
  API_BASE_URL: "https://test-api.example.com",
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockCacheGet = vi.fn();
const mockCachePut = vi.fn();

vi.mock("#/infrastructure/persistence/dexie/indexeddb", () => ({
  sessionGrantCacheStore: {
    get: (...args: unknown[]) => mockCacheGet(...args),
    put: (...args: unknown[]) => mockCachePut(...args),
  },
}));

const mockIssueAndCache = vi.fn();
vi.mock("#/infrastructure/persistence/dexie/sessionGrantRepository", () => ({
  issueAndCacheLocalSessionGrant: (...args: unknown[]) => mockIssueAndCache(...args),
}));

function makeGrant(overrides: Record<string, unknown> = {}) {
  return {
    keyVersion: 1,
    sessionKey: new Uint8Array(32),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    allowedOps: ["read", "debit"],
    signature: new Uint8Array(32),
    tenantId: "t-1",
    accountId: "a-1",
    deviceId: "d-1",
    ...overrides,
  };
}

function makeCachedGrant(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "t-1",
    accountId: "a-1",
    deviceId: "d-1",
    keyVersion: 1,
    sessionKeyB64: btoa(String.fromCodePoint(...new Uint8Array(32))),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    allowedOps: ["read", "debit"],
    signatureB64: btoa(String.fromCodePoint(...new Uint8Array(32))),
    cachedAt: Date.now(),
    ...overrides,
  };
}

describe("useSessionGrant - online fetch success (lines 201-210)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    mockCacheGet.mockResolvedValue(null);
    mockCachePut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches grant online and sets it", async () => {
    const { useSessionGrant } = await import("../useSessionGrant");

    const fetchedGrant = makeGrant();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        keyVersion: 1,
        sessionKey: btoa(String.fromCodePoint(...new Uint8Array(32))),
        expiresAt: fetchedGrant.expiresAt,
        allowedOps: ["read", "debit"],
        signature: btoa(String.fromCodePoint(...new Uint8Array(32))),
      }),
    });

    const { result } = renderHook(() => useSessionGrant("t-1", "a-1", "d-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.grant).not.toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe("useSessionGrant - online fetch fails, cached grant available (lines 215-220)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    mockCachePut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to cached grant when fetch fails", async () => {
    const { useSessionGrant } = await import("../useSessionGrant");

    mockCacheGet.mockResolvedValue(makeCachedGrant());
    mockApiFetch.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useSessionGrant("t-1", "a-1", "d-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.grant).not.toBeNull();
  });
});

describe("useSessionGrant - online fetch fails, no cache, local grant (lines 222-232)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    mockCacheGet.mockResolvedValue(null);
    mockCachePut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("issues local grant when fetch fails and no cache", async () => {
    const { useSessionGrant } = await import("../useSessionGrant");

    mockApiFetch.mockRejectedValue(new Error("Network error"));
    mockIssueAndCache.mockResolvedValue(makeGrant());

    const { result } = renderHook(() => useSessionGrant("t-1", "a-1", "d-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.grant).not.toBeNull();
  });

  it("sets error when fetch fails, no cache, and local grant also fails", async () => {
    const { useSessionGrant } = await import("../useSessionGrant");

    mockApiFetch.mockRejectedValue(new Error("Network error"));
    mockIssueAndCache.mockRejectedValue(new Error("Local grant failed"));

    const { result } = renderHook(() => useSessionGrant("t-1", "a-1", "d-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.error).not.toBeNull();
  });
});

describe("useSessionGrant - offline with cached grant (lines 272)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockCachePut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("uses cached grant when offline", async () => {
    const { useSessionGrant } = await import("../useSessionGrant");

    mockCacheGet.mockResolvedValue(makeCachedGrant());

    const { result } = renderHook(() => useSessionGrant("t-1", "a-1", "d-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.grant).not.toBeNull();
  });
});

describe("useSessionGrant - offline, no cache, local grant (lines 280-309)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockCacheGet.mockResolvedValue(null);
    mockCachePut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("issues local grant when offline and no cache", async () => {
    const { useSessionGrant } = await import("../useSessionGrant");

    mockIssueAndCache.mockResolvedValue(makeGrant());

    const { result } = renderHook(() => useSessionGrant("t-1", "a-1", "d-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.grant).not.toBeNull();
  });

  it("falls back to tryLocalGrant when issueAndCache fails offline", async () => {
    const { useSessionGrant } = await import("../useSessionGrant");

    mockIssueAndCache.mockRejectedValue(new Error("Local issue failed"));

    const { result } = renderHook(() => useSessionGrant("t-1", "a-1", "d-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // tryLocalGrant uses Web Crypto which is available in jsdom
    // It should either succeed or set an error
    expect(result.current.loading).toBe(false);
  });

  it("sets error when offline, no cache, and all local grant attempts fail", async () => {
    const { useSessionGrant } = await import("../useSessionGrant");

    mockIssueAndCache.mockRejectedValue(new Error("Local issue failed"));

    // Mock crypto.subtle to fail
    const origSubtle = globalThis.crypto.subtle;
    Object.defineProperty(globalThis.crypto, "subtle", {
      value: {
        importKey: vi.fn().mockRejectedValue(new Error("Crypto unavailable")),
        sign: vi.fn().mockRejectedValue(new Error("Crypto unavailable")),
      },
      configurable: true,
    });

    const { result } = renderHook(() => useSessionGrant("t-1", "a-1", "d-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(result.current.error).toBe("Offline dan tidak ada sesi tersimpan");

    Object.defineProperty(globalThis.crypto, "subtle", {
      value: origSubtle,
      configurable: true,
    });
  });
});

describe("useSessionGrant - offline grace period (lines 307-309)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCachePut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("returns expired grant within grace period when offline", async () => {
    const { useSessionGrant } = await import("../useSessionGrant");

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const nowSeconds = Math.floor(Date.now() / 1000);
    // Grant expired 30 minutes ago (within 1-hour grace period)
    const expiredGrant = makeCachedGrant({
      expiresAt: nowSeconds - 1800,
    });
    mockCacheGet.mockResolvedValue(expiredGrant);

    const { result } = renderHook(() => useSessionGrant("t-1", "a-1", "d-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Should use the expired grant (within grace period)
    expect(result.current.grant).not.toBeNull();
  });

  it("does not return expired grant beyond grace period when offline", async () => {
    const { useSessionGrant } = await import("../useSessionGrant");

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const nowSeconds = Math.floor(Date.now() / 1000);
    // Grant expired 2 hours ago (beyond 1-hour grace period)
    const expiredGrant = makeCachedGrant({
      expiresAt: nowSeconds - 7200,
    });
    mockCacheGet.mockResolvedValue(expiredGrant);
    mockIssueAndCache.mockResolvedValue(makeGrant());

    const { result: _resultBeyondGrace } = renderHook(() => useSessionGrant("t-1", "a-1", "d-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Expired beyond grace period - should have tried to get a new grant
    expect(mockIssueAndCache).toHaveBeenCalled();
  });
});

describe("useSessionGrant - isValid with offline expired grant (lines 332-333)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("returns grant as valid when offline and within grace period", async () => {
    const { useSessionGrant } = await import("../useSessionGrant");

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredGrant = makeCachedGrant({ expiresAt: nowSeconds - 1800 });
    mockCacheGet.mockResolvedValue(expiredGrant);
    mockCachePut.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSessionGrant("t-1", "a-1", "d-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // The isValid check should allow the expired grant within grace period
    expect(result.current.grant).not.toBeNull();
  });
});

describe("useSessionGrant - scout role uses server endpoint without auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    mockCacheGet.mockResolvedValue(null);
    mockCachePut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches session grant from server for scout role without auth token", async () => {
    const { useSessionGrant } = await import("../useSessionGrant");

    const scoutGrant = makeGrant({ accountId: "scout-anonymous", allowedOps: ["read"] });
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        keyVersion: 1,
        sessionKey: btoa(String.fromCodePoint(...new Uint8Array(32))),
        expiresAt: scoutGrant.expiresAt,
        allowedOps: ["read"],
        signature: btoa(String.fromCodePoint(...new Uint8Array(32))),
      }),
    });

    const { result } = renderHook(() => useSessionGrant("t-1", "scout-anonymous", "d-1", "scout"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Should call apiFetch with role=scout parameter
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("role=scout"),
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
      "t-1",
    );

    // Should have a valid grant from server
    expect(result.current.grant).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("falls back to local grant when server fetch fails for scout", async () => {
    const { useSessionGrant } = await import("../useSessionGrant");

    mockApiFetch.mockRejectedValue(new Error("Network error"));
    mockIssueAndCache.mockResolvedValue(makeGrant({ accountId: "scout-anonymous" }));

    const { result } = renderHook(() => useSessionGrant("t-1", "scout-anonymous", "d-1", "scout"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Should try to fetch first
    expect(mockApiFetch).toHaveBeenCalled();

    // Should fall back to local grant
    expect(mockIssueAndCache).toHaveBeenCalledWith("t-1", "scout-anonymous", "d-1", "scout");

    // Should have a valid grant
    expect(result.current.grant).not.toBeNull();
    expect(result.current.error).toBeNull();
  });
});
