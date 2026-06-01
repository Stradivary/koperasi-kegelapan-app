// @vitest-environment jsdom
/**
 * Tests for src/hooks/useLoginAuth.ts
 *
 * Covers:
 * - handleUnifiedLogin: local-first login, server fallback, error cases
 * - handleDeviceSetupAuth: offline/online paths, role validation
 * - loading/error state management
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockLocalLoginWithReason = vi.fn();
const mockCacheServerCredentials = vi.fn();
const mockGetDeviceFingerprint = vi.fn();
const mockTenantContextStorePut = vi.fn();
const mockLocalTenantConfigStoreGet = vi.fn();
const mockLocalTenantConfigStorePut = vi.fn();
const mockLocalDbDeviceInfoPut = vi.fn();
const mockSetCurrentDeviceId = vi.fn();
const mockSetAccessToken = vi.fn();
const mockRestoreAuthState = vi.fn();
const mockGetAccessToken = vi.fn();
const mockIssueAndCacheLocalSessionGrant = vi.fn();

vi.mock("#/lib/localTenant", () => ({
  localLoginWithReason: (...args: unknown[]) => mockLocalLoginWithReason(...args),
  cacheServerCredentials: (...args: unknown[]) => mockCacheServerCredentials(...args),
}));

vi.mock("#/lib/getOrCreateDeviceId", () => ({
  getDeviceFingerprint: () => mockGetDeviceFingerprint(),
}));

vi.mock("#/lib/indexeddb", () => ({
  tenantContextStore: {
    put: (...args: unknown[]) => mockTenantContextStorePut(...args),
  },
  localTenantConfigStore: {
    get: (...args: unknown[]) => mockLocalTenantConfigStoreGet(...args),
    put: (...args: unknown[]) => mockLocalTenantConfigStorePut(...args),
  },
}));

vi.mock("#/db/local-db", () => ({
  localDb: {
    deviceInfo: {
      put: (...args: unknown[]) => mockLocalDbDeviceInfoPut(...args),
    },
  },
}));

vi.mock("#/lib/api", () => ({
  API_BASE_URL: "https://test-api.example.com",
  setCurrentDeviceId: (...args: unknown[]) => mockSetCurrentDeviceId(...args),
  setAccessToken: (...args: unknown[]) => mockSetAccessToken(...args),
  restoreAuthState: (...args: unknown[]) => mockRestoreAuthState(...args),
  getAccessToken: () => mockGetAccessToken(),
}));

vi.mock("#/lib/localSessionGrant", () => ({
  issueAndCacheLocalSessionGrant: (...args: unknown[]) =>
    mockIssueAndCacheLocalSessionGrant(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLocalLoginSuccess(role = "admin") {
  return {
    success: true as const,
    tenantId: "tenant-1",
    tenantSlug: "koperasi-maju",
    tenantName: "Koperasi Maju",
    accountId: "account-1",
    role,
  };
}

function makeServerResponse(role = "admin") {
  return {
    tenantId: "tenant-1",
    tenantSlug: "koperasi-maju",
    tenantName: "Koperasi Maju",
    accountId: "account-1",
    role,
    accessToken: "server-token-abc",
    deviceId: "device-1",
  };
}

function makeSubmitEvent() {
  return {
    preventDefault: vi.fn(),
  } as unknown as React.SubmitEvent<HTMLFormElement>;
}

function makeDefaultOptions(overrides: Record<string, unknown> = {}) {
  return {
    username: "admin",
    password: "password123",
    tenantSlug: "",
    selectedServerTenant: null,
    onLoginSuccess: vi.fn(),
    onDeviceSetupAuthSuccess: vi.fn(),
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDeviceFingerprint.mockResolvedValue("fingerprint-hash-123");
  mockTenantContextStorePut.mockResolvedValue(undefined);
  mockLocalTenantConfigStoreGet.mockResolvedValue(null);
  mockLocalTenantConfigStorePut.mockResolvedValue(undefined);
  mockLocalDbDeviceInfoPut.mockResolvedValue(undefined);
  mockSetCurrentDeviceId.mockReturnValue(undefined);
  mockSetAccessToken.mockReturnValue(undefined);
  mockRestoreAuthState.mockResolvedValue(undefined);
  mockGetAccessToken.mockReturnValue(null);
  mockIssueAndCacheLocalSessionGrant.mockResolvedValue(undefined);
  mockCacheServerCredentials.mockResolvedValue(undefined);

  // Default: local login fails (no local account)
  mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });

  // Default: online
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

// ── handleUnifiedLogin ────────────────────────────────────────────────────────

describe("useLoginAuth - handleUnifiedLogin: local login success", () => {
  it("calls onLoginSuccess with tenantId and role on local login success", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue(makeLocalLoginSuccess("admin"));

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(options.onLoginSuccess).toHaveBeenCalledWith("tenant-1", "admin");
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("stores tenant context on local login success", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue(makeLocalLoginSuccess("admin"));

    const { result } = renderHook(() => useLoginAuth(makeDefaultOptions()));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(mockTenantContextStorePut).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        role: "admin",
        canAccessStation: true,
      }),
    );
  });

  it("sets canAccessStation=false for non-admin/station roles", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue(makeLocalLoginSuccess("terminal"));

    const { result } = renderHook(() => useLoginAuth(makeDefaultOptions()));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(mockTenantContextStorePut).toHaveBeenCalledWith(
      expect.objectContaining({ canAccessStation: false }),
    );
  });

  it("sets error when local login returns wrong_tenant", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "wrong_tenant" });

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(result.current.error).toContain("tidak terdaftar di koperasi");
    expect(options.onLoginSuccess).not.toHaveBeenCalled();
  });

  it("silently fetches server token when local login succeeds and no token cached", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue(makeLocalLoginSuccess("admin"));
    mockGetAccessToken.mockReturnValue(null);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ accessToken: "fresh-token" }),
      }),
    );

    const { result } = renderHook(() => useLoginAuth(makeDefaultOptions()));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(mockSetAccessToken).toHaveBeenCalledWith("fresh-token");
  });

  it("does not fetch server token when one is already cached", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue(makeLocalLoginSuccess("admin"));
    mockGetAccessToken.mockReturnValue("existing-token");

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useLoginAuth(makeDefaultOptions()));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("useLoginAuth - handleUnifiedLogin: offline fallback", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  });

  it("sets offline error when local login fails and device is offline", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(result.current.error).toContain("offline");
    expect(options.onLoginSuccess).not.toHaveBeenCalled();
  });
});

describe("useLoginAuth - handleUnifiedLogin: server login fallback", () => {
  it("calls onLoginSuccess after successful server login", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    // Local login fails
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => makeServerResponse("admin"),
      }),
    );

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(options.onLoginSuccess).toHaveBeenCalledWith("tenant-1", "admin");
    expect(result.current.error).toBeNull();
  });

  it("stores tenant context and config after server login", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => makeServerResponse("admin"),
      }),
    );

    const { result } = renderHook(() => useLoginAuth(makeDefaultOptions()));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(mockTenantContextStorePut).toHaveBeenCalled();
    expect(mockLocalTenantConfigStorePut).toHaveBeenCalled();
    expect(mockSetAccessToken).toHaveBeenCalledWith("server-token-abc");
  });

  it("does not overwrite existing local tenant config", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });
    mockLocalTenantConfigStoreGet.mockResolvedValue({ tenantId: "tenant-1" }); // already exists

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => makeServerResponse("admin"),
      }),
    );

    const { result } = renderHook(() => useLoginAuth(makeDefaultOptions()));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(mockLocalTenantConfigStorePut).not.toHaveBeenCalled();
  });

  it("sets error when server returns 401 with inactive message", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "tenant is inactive" }),
      }),
    );

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(result.current.error).toContain("tidak lagi aktif");
    expect(options.onLoginSuccess).not.toHaveBeenCalled();
  });

  it("sets error when server returns 404", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "not found" }),
      }),
    );

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(result.current.error).toContain("tidak ditemukan");
  });

  it("sets generic error when server returns other non-ok status", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "forbidden" }),
      }),
    );

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(result.current.error).toContain("salah");
  });

  it("sets error when server response tenantSlug mismatches selected tenant", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...makeServerResponse(), tenantSlug: "other-koperasi" }),
      }),
    );

    const options = makeDefaultOptions({
      tenantSlug: "koperasi-maju",
    });
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(result.current.error).toContain("bukan milik koperasi");
  });

  it("sets connection error when fetch throws AbortError (timeout)", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    // Make getDeviceFingerprint throw an AbortError to trigger the outer catch
    // with a DOMException (AbortError) - this tests the "Tidak dapat terhubung" branch
    const abortErr = new DOMException("The operation was aborted.", "AbortError");
    mockGetDeviceFingerprint.mockRejectedValue(abortErr);

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(result.current.error).toContain("Tidak dapat terhubung");
    expect(result.current.loading).toBe(false);
  });

  it("sets generic connection error when fetch throws non-abort error outside tryServerLogin", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    // Make getDeviceFingerprint throw so the error propagates to the outer catch
    mockGetDeviceFingerprint.mockRejectedValue(new Error("Fingerprint unavailable"));

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(result.current.error).toContain("Gagal terhubung");
  });

  it("uses selectedServerTenant slug over tenantSlug input", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeServerResponse(),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const options = makeDefaultOptions({
      tenantSlug: "ignored-slug",
      selectedServerTenant: { slug: "koperasi-maju", tenantId: "t-1", name: "Koperasi Maju" },
    });
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.tenantSlug).toBe("koperasi-maju");
  });
});

describe("useLoginAuth - handleUnifiedLogin: loading state", () => {
  it("sets loading=true during login and false after", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");

    let resolveLogin!: (v: unknown) => void;
    mockLocalLoginWithReason.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );

    const { result } = renderHook(() => useLoginAuth(makeDefaultOptions()));

    // Start login without awaiting
    act(() => {
      void result.current.handleUnifiedLogin(makeSubmitEvent());
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveLogin({ success: false, reason: "not_found" });
      // Also resolve the fetch that follows
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({ error: "invalid" }),
        }),
      );
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.loading).toBe(false);
  });
});

// ── handleDeviceSetupAuth ─────────────────────────────────────────────────────

describe("useLoginAuth - handleDeviceSetupAuth: local credentials available", () => {
  it("calls onDeviceSetupAuthSuccess with context on local admin login", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue(makeLocalLoginSuccess("admin"));

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleDeviceSetupAuth(makeSubmitEvent());
    });

    expect(options.onDeviceSetupAuthSuccess).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      tenantSlug: "koperasi-maju",
      tenantName: "Koperasi Maju",
      accountId: "account-1",
    });
    expect(result.current.error).toBeNull();
  });

  it("calls onDeviceSetupAuthSuccess for station role", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue(makeLocalLoginSuccess("station"));

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleDeviceSetupAuth(makeSubmitEvent());
    });

    expect(options.onDeviceSetupAuthSuccess).toHaveBeenCalled();
  });

  it("sets error when local login succeeds but role is not admin or station", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue(makeLocalLoginSuccess("terminal"));

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleDeviceSetupAuth(makeSubmitEvent());
    });

    expect(result.current.error).toContain("admin atau station");
    expect(options.onDeviceSetupAuthSuccess).not.toHaveBeenCalled();
  });
});

describe("useLoginAuth - handleDeviceSetupAuth: offline, no local credentials", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  });

  it("sets offline activation error when offline and no local credentials", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleDeviceSetupAuth(makeSubmitEvent());
    });

    expect(result.current.error).toContain("internet");
    expect(options.onDeviceSetupAuthSuccess).not.toHaveBeenCalled();
  });

  it("proceeds with local credentials when offline", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue(makeLocalLoginSuccess("admin"));

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleDeviceSetupAuth(makeSubmitEvent());
    });

    expect(options.onDeviceSetupAuthSuccess).toHaveBeenCalled();
  });
});

describe("useLoginAuth - handleDeviceSetupAuth: server fallback", () => {
  it("fetches from server and caches credentials when local login fails online", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => makeServerResponse("admin"),
      }),
    );

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleDeviceSetupAuth(makeSubmitEvent());
    });

    expect(mockCacheServerCredentials).toHaveBeenCalled();
    // PendingDeviceContext does not include role - it's used only for device setup navigation
    expect(options.onDeviceSetupAuthSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", accountId: "account-1" }),
    );
  });

  it("sets error when server fetch fails and no local credentials", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleDeviceSetupAuth(makeSubmitEvent());
    });

    expect(result.current.error).toContain("salah");
    expect(options.onDeviceSetupAuthSuccess).not.toHaveBeenCalled();
  });

  it("sets error when server returns non-ok response", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockResolvedValue({ success: false, reason: "not_found" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "invalid" }),
      }),
    );

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleDeviceSetupAuth(makeSubmitEvent());
    });

    expect(result.current.error).toContain("salah");
  });
});

describe("useLoginAuth - handleDeviceSetupAuth: unexpected error", () => {
  it("sets generic error when an unexpected exception is thrown", async () => {
    const { useLoginAuth } = await import("../useLoginAuth");
    mockLocalLoginWithReason.mockRejectedValue(new Error("Unexpected DB error"));

    const options = makeDefaultOptions();
    const { result } = renderHook(() => useLoginAuth(options));

    await act(async () => {
      await result.current.handleDeviceSetupAuth(makeSubmitEvent());
    });

    expect(result.current.error).toContain("kesalahan");
    expect(result.current.loading).toBe(false);
  });
});
