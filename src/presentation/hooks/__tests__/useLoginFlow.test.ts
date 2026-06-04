// @vitest-environment jsdom
/**
 * Tests for src/hooks/useLoginFlow.ts
 *
 * Covers:
 * - Initial mode detection (device-setup launch context, auto-boot, login)
 * - Mode transitions: enterDeviceSetup, exitDeviceSetup, enterServerBrowse, enterSetup, enterLogin
 * - Scout browse: enterScoutBrowse, handleScoutSelectTenant
 * - Device role: handlePickDeviceRole, advanceToPickRole
 * - redirectToRole navigation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockQueryClient = { getQueryData: vi.fn(), setQueryData: vi.fn() };

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mockQueryClient,
}));

const mockTenantContextStoreGetAll = vi.fn();
const mockTenantContextStorePut = vi.fn();
const mockLocalTenantConfigStoreGetAll = vi.fn();
const mockLocalTenantConfigStoreGet = vi.fn();
const mockLocalTenantConfigStorePut = vi.fn();

vi.mock("#/infrastructure/persistence/dexie/indexeddb", () => ({
  tenantContextStore: {
    getAll: () => mockTenantContextStoreGetAll(),
    put: (...args: unknown[]) => mockTenantContextStorePut(...args),
  },
  localTenantConfigStore: {
    getAll: () => mockLocalTenantConfigStoreGetAll(),
    get: (...args: unknown[]) => mockLocalTenantConfigStoreGet(...args),
    put: (...args: unknown[]) => mockLocalTenantConfigStorePut(...args),
  },
}));

const mockGetDeviceFingerprint = vi.fn();
vi.mock("#/infrastructure/device/getOrCreateDeviceId", () => ({
  getDeviceFingerprint: () => mockGetDeviceFingerprint(),
}));

const mockSetCurrentDeviceId = vi.fn();
const mockRestoreAuthState = vi.fn();
vi.mock("#/infrastructure/api/apiClient", () => ({
  setCurrentDeviceId: (...args: unknown[]) => mockSetCurrentDeviceId(...args),
  restoreAuthState: (...args: unknown[]) => mockRestoreAuthState(...args),
  API_BASE_URL: "http://localhost:8787",
}));

const mockIssueAndCacheLocalSessionGrant = vi.fn();
vi.mock("#/infrastructure/persistence/dexie/sessionGrantRepository", () => ({
  issueAndCacheLocalSessionGrant: (...args: unknown[]) =>
    mockIssueAndCacheLocalSessionGrant(...args),
}));

const mockConsumeDeviceSetupLaunchContext = vi.fn();
vi.mock("#/presentation/lib/utils", () => ({
  consumeDeviceSetupLaunchContext: () => mockConsumeDeviceSetupLaunchContext(),
}));

const mockHydrateQueryCache = vi.fn();
vi.mock("#/presentation/hooks/useHydrateCache", () => ({
  hydrateQueryCache: (...args: unknown[]) => mockHydrateQueryCache(...args),
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockConsumeDeviceSetupLaunchContext.mockReturnValue(null);
  mockTenantContextStoreGetAll.mockResolvedValue([]);
  mockLocalTenantConfigStoreGetAll.mockResolvedValue([]);
  mockLocalTenantConfigStoreGet.mockResolvedValue(undefined);
  mockLocalTenantConfigStorePut.mockResolvedValue(undefined);
  mockGetDeviceFingerprint.mockResolvedValue("fp-hash-123");
  mockTenantContextStorePut.mockResolvedValue(undefined);
  mockSetCurrentDeviceId.mockReturnValue(undefined);
  mockRestoreAuthState.mockResolvedValue(undefined);
  mockIssueAndCacheLocalSessionGrant.mockResolvedValue(undefined);
  mockHydrateQueryCache.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Initial mode detection ────────────────────────────────────────────────────

describe("useLoginFlow - initial mode detection", () => {
  it("starts in detecting mode before effect runs", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    // Immediately after render, before effect resolves
    expect(result.current.mode).toBe("detecting");
  });

  it("transitions to login mode when no launch context and no stored sessions", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.mode).toBe("login");
  });

  it("transitions to device-setup when launch context is present", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    mockConsumeDeviceSetupLaunchContext.mockReturnValue({
      returnTo: "/admin",
      returnLabel: "Kembali ke Admin",
    });

    const { result } = renderHook(() => useLoginFlow());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.mode).toBe("device-setup");
    expect(result.current.deviceSetupLaunchContext).toEqual({
      returnTo: "/admin",
      returnLabel: "Kembali ke Admin",
    });
  });

  it("auto-boots and navigates when an active session exists", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    mockTenantContextStoreGetAll.mockResolvedValue([
      {
        tenantId: "t-1",
        role: "admin",
        deviceId: "d-1",
        updatedAt: Date.now(),
      },
    ]);

    renderHook(() => useLoginFlow());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/tenant/t-1/admin", replace: true }),
    );
  });

  it("prefers no-auth role (gate/terminal/scout) over admin when auto-booting", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t-1", role: "admin", deviceId: "d-1", updatedAt: 1000 },
      { tenantId: "t-2", role: "gate", deviceId: "d-2", updatedAt: 500 },
    ]);

    renderHook(() => useLoginFlow());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/tenant/t-2/gate" }));
  });

  it("navigates to /superadmin for superadmin role", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t-1", role: "superadmin", deviceId: "d-1", updatedAt: Date.now() },
    ]);

    renderHook(() => useLoginFlow());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/superadmin" }));
  });
});

// ── Mode transitions ──────────────────────────────────────────────────────────

describe("useLoginFlow - mode transitions", () => {
  async function getHookInLoginMode() {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.mode).toBe("login");
    return result;
  }

  it("enterDeviceSetup sets mode to device-setup and resets credentials", async () => {
    const result = await getHookInLoginMode();

    act(() => {
      result.current.setUsername("user");
      result.current.setPassword("pass");
    });

    act(() => {
      result.current.enterDeviceSetup();
    });

    expect(result.current.mode).toBe("device-setup");
    expect(result.current.username).toBe("");
    expect(result.current.password).toBe("");
    expect(result.current.setupStep).toBe("auth");
  });

  it("enterServerBrowse sets mode to server-browse", async () => {
    const result = await getHookInLoginMode();

    act(() => {
      result.current.enterServerBrowse();
    });

    expect(result.current.mode).toBe("server-browse");
  });

  it("enterSetup sets mode to setup", async () => {
    const result = await getHookInLoginMode();

    act(() => {
      result.current.enterSetup();
    });

    expect(result.current.mode).toBe("setup");
  });

  it("enterLogin sets mode to login", async () => {
    const result = await getHookInLoginMode();

    act(() => {
      result.current.enterServerBrowse();
    });
    expect(result.current.mode).toBe("server-browse");

    act(() => {
      result.current.enterLogin();
    });
    expect(result.current.mode).toBe("login");
  });

  it("exitDeviceSetup returns to login mode and resets state", async () => {
    const result = await getHookInLoginMode();

    act(() => {
      result.current.enterDeviceSetup();
    });
    act(() => {
      result.current.setUsername("user");
      result.current.setPassword("pass");
    });

    act(() => {
      result.current.exitDeviceSetup();
    });

    expect(result.current.mode).toBe("login");
    expect(result.current.username).toBe("");
    expect(result.current.password).toBe("");
    expect(result.current.setupStep).toBe("auth");
  });

  it("exitDeviceSetup navigates to returnTo when launch context is set", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    mockConsumeDeviceSetupLaunchContext.mockReturnValue({
      returnTo: "/tenant/t-1/admin",
      returnLabel: "Admin",
    });

    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.mode).toBe("device-setup");

    act(() => {
      result.current.exitDeviceSetup();
    });

    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/tenant/t-1/admin" }));
  });
});

// ── Scout browse ──────────────────────────────────────────────────────────────

describe("useLoginFlow - enterScoutBrowse", () => {
  it("sets mode to scout-browse and loads local tenants", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const localTenants = [
      { tenantId: "t-1", slug: "koperasi-a", name: "Koperasi A" },
      { tenantId: "t-2", slug: "koperasi-b", name: "Koperasi B" },
    ];
    mockLocalTenantConfigStoreGetAll.mockResolvedValue(localTenants);

    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.enterScoutBrowse();
    });

    expect(result.current.mode).toBe("scout-browse");
    expect(result.current.localTenants).toEqual(localTenants);
  });

  it("sets localTenants to empty array when loading fails", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    mockLocalTenantConfigStoreGetAll.mockRejectedValue(new Error("DB error"));

    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.enterScoutBrowse();
    });

    expect(result.current.localTenants).toEqual([]);
  });
});

describe("useLoginFlow - handleScoutSelectTenant", () => {
  it("stores scout context and navigates to scout route", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.handleScoutSelectTenant("t-1", "koperasi-maju", "Koperasi Maju");
    });

    expect(mockTenantContextStorePut).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-1",
        role: "scout",
        accountId: "scout-anonymous",
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/tenant/t-1/scout" }));
  });
});

// ── Device role ───────────────────────────────────────────────────────────────

describe("useLoginFlow - advanceToPickRole and handlePickDeviceRole", () => {
  it("advanceToPickRole sets pendingContext and setupStep to pick-role", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const context = {
      tenantId: "t-1",
      tenantSlug: "koperasi-maju",
      tenantName: "Koperasi Maju",
      accountId: "account-1",
    };

    act(() => {
      result.current.advanceToPickRole(context);
    });

    expect(result.current.setupStep).toBe("pick-role");
    expect(result.current.pendingContext).toEqual(context);
  });

  it("handlePickDeviceRole stores context with selected role and navigates", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    act(() => {
      result.current.advanceToPickRole({
        tenantId: "t-1",
        tenantSlug: "koperasi-maju",
        tenantName: "Koperasi Maju",
        accountId: "account-1",
      });
    });

    await act(async () => {
      await result.current.handlePickDeviceRole("gate");
    });

    expect(mockTenantContextStorePut).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-1",
        role: "gate",
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/tenant/t-1/gate" }));
  });

  it("handlePickDeviceRole does nothing when pendingContext is null", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // pendingContext is null by default
    await act(async () => {
      await result.current.handlePickDeviceRole("terminal");
    });

    expect(mockTenantContextStorePut).not.toHaveBeenCalled();
  });
});

// ── redirectToRole ────────────────────────────────────────────────────────────

describe("useLoginFlow - redirectToRole", () => {
  const roleRoutes: Array<[string, string]> = [
    ["admin", "/tenant/t-1/admin"],
    ["station", "/tenant/t-1/station"],
    ["terminal", "/tenant/t-1/terminal"],
    ["gate", "/tenant/t-1/gate"],
    ["scout", "/tenant/t-1/scout"],
    ["superadmin", "/superadmin"],
  ];

  it.each(roleRoutes)("navigates to correct route for role=%s", async (role, expectedRoute) => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    act(() => {
      result.current.redirectToRole("t-1", role);
    });

    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: expectedRoute }));
  });

  it("navigates to / for unknown role", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    act(() => {
      result.current.redirectToRole("t-1", "unknown-role");
    });

    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/" }));
  });
});

// ── setUsername / setPassword ─────────────────────────────────────────────────

describe("useLoginFlow - setUsername / setPassword", () => {
  async function getHookInLoginMode() {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    return result;
  }

  it("setUsername updates username", async () => {
    const result = await getHookInLoginMode();
    act(() => {
      result.current.setUsername("budi");
    });
    expect(result.current.username).toBe("budi");
  });

  it("setPassword updates password", async () => {
    const result = await getHookInLoginMode();
    act(() => {
      result.current.setPassword("secret");
    });
    expect(result.current.password).toBe("secret");
  });
});

// ── auto-boot details ─────────────────────────────────────────────────────────

describe("useLoginFlow - auto-boot details", () => {
  it("calls restoreAuthState with deviceId when present", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t-1", role: "admin", deviceId: "d-abc", updatedAt: Date.now() },
    ]);

    renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(mockRestoreAuthState).toHaveBeenCalledWith("d-abc");
  });

  it("skips restoreAuthState when deviceId is absent", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t-1", role: "admin", updatedAt: Date.now() },
    ]);

    renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(mockRestoreAuthState).not.toHaveBeenCalled();
  });

  it("picks most-recent context when no no-auth role exists", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t-old", role: "admin", deviceId: "d-1", updatedAt: 1000 },
      { tenantId: "t-new", role: "station", deviceId: "d-2", updatedAt: 9000 },
    ]);

    renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/tenant/t-new/station" }),
    );
  });
});

// ── handleScoutSelectTenant details ──────────────────────────────────────────

describe("useLoginFlow - handleScoutSelectTenant details", () => {
  it("calls setCurrentDeviceId with fingerprint", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.handleScoutSelectTenant("t-1", "koperasi-a", "Koperasi A");
    });

    expect(mockSetCurrentDeviceId).toHaveBeenCalledWith("fp-hash-123");
  });

  it("calls issueAndCacheLocalSessionGrant for scout role", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.handleScoutSelectTenant("t-1", "koperasi-a", "Koperasi A");
    });

    expect(mockIssueAndCacheLocalSessionGrant).toHaveBeenCalledWith(
      "t-1",
      "scout-anonymous",
      "fp-hash-123",
      "scout",
    );
  });

  it("stores correct tenantSlug and tenantName in context", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      await result.current.handleScoutSelectTenant("t-99", "slug-xyz", "Nama Koperasi");
    });

    expect(mockTenantContextStorePut).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantSlug: "slug-xyz",
        tenantName: "Nama Koperasi",
        terminalId: 0,
      }),
    );
  });
});

// ── handleScoutEnterSlug ──────────────────────────────────────────────────────

describe("useLoginFlow - handleScoutEnterSlug", () => {
  async function getHookWithLocalTenants(
    localTenants: { tenantId: string; slug: string; name: string }[] = [],
  ) {
    const { useLoginFlow } = await import("../useLoginFlow");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue(localTenants);
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    // Load local tenants into state
    await act(async () => {
      await result.current.enterScoutBrowse();
    });
    return result;
  }

  it("resolves from local tenants when slug matches", async () => {
    const result = await getHookWithLocalTenants([
      { tenantId: "t-local", slug: "koperasi-lokal", name: "Koperasi Lokal" },
    ]);

    await act(async () => {
      await result.current.handleScoutEnterSlug("koperasi-lokal", false);
    });

    expect(mockTenantContextStorePut).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t-local" }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/tenant/t-local/scout" }),
    );
  });

  it("does not set slugNotFoundError when local match found", async () => {
    const result = await getHookWithLocalTenants([
      { tenantId: "t-local", slug: "koperasi-lokal", name: "Koperasi Lokal" },
    ]);

    await act(async () => {
      await result.current.handleScoutEnterSlug("koperasi-lokal", false);
    });

    expect(result.current.slugNotFoundError).toBeNull();
  });

  it("resolves from server when online and server returns a match", async () => {
    const result = await getHookWithLocalTenants([]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tenants: [{ tenantId: "t-server", slug: "koperasi-server", name: "Koperasi Server" }],
      }),
    });

    await act(async () => {
      await result.current.handleScoutEnterSlug("koperasi-server", true);
    });

    expect(mockTenantContextStorePut).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t-server" }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/tenant/t-server/scout" }),
    );
  });

  it("fetches with correct URL including encoded slug", async () => {
    const result = await getHookWithLocalTenants([]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tenants: [] }),
    });

    await act(async () => {
      await result.current.handleScoutEnterSlug("koperasi-maju", true);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tenants/search?q=koperasi-maju"),
    );
  });

  it("sets slugNotFoundError when online but server returns no match", async () => {
    const result = await getHookWithLocalTenants([]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tenants: [] }),
    });

    await act(async () => {
      await result.current.handleScoutEnterSlug("tidak-ada", true);
    });

    expect(result.current.slugNotFoundError).toBe("tidak-ada");
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: expect.stringContaining("/scout") }),
    );
  });

  it("sets slugNotFoundError when online but fetch response is not ok", async () => {
    const result = await getHookWithLocalTenants([]);

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    await act(async () => {
      await result.current.handleScoutEnterSlug("koperasi-x", true);
    });

    expect(result.current.slugNotFoundError).toBe("koperasi-x");
  });

  it("sets slugNotFoundError when online but fetch throws (network error)", async () => {
    const result = await getHookWithLocalTenants([]);

    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await act(async () => {
      await result.current.handleScoutEnterSlug("koperasi-y", true);
    });

    expect(result.current.slugNotFoundError).toBe("koperasi-y");
  });

  it("sets slugNotFoundError when offline and no local match", async () => {
    const result = await getHookWithLocalTenants([
      { tenantId: "t-1", slug: "koperasi-a", name: "Koperasi A" },
    ]);

    await act(async () => {
      await result.current.handleScoutEnterSlug("koperasi-tidak-ada", false);
    });

    expect(result.current.slugNotFoundError).toBe("koperasi-tidak-ada");
    expect(mockTenantContextStorePut).not.toHaveBeenCalled();
  });

  it("does not call fetch when offline", async () => {
    const result = await getHookWithLocalTenants([]);
    global.fetch = vi.fn();

    await act(async () => {
      await result.current.handleScoutEnterSlug("koperasi-z", false);
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("prefers local match over server even when online", async () => {
    const result = await getHookWithLocalTenants([
      { tenantId: "t-local", slug: "koperasi-sama", name: "Koperasi Lokal" },
    ]);
    global.fetch = vi.fn();

    await act(async () => {
      await result.current.handleScoutEnterSlug("koperasi-sama", true);
    });

    // fetch should not be called — local match short-circuits
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockTenantContextStorePut).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t-local" }),
    );
  });
});

// ── handlePickDeviceRole details ──────────────────────────────────────────────

describe("useLoginFlow - handlePickDeviceRole details", () => {
  it("calls issueAndCacheLocalSessionGrant with selected role", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    act(() => {
      result.current.advanceToPickRole({
        tenantId: "t-1",
        tenantSlug: "koperasi-a",
        tenantName: "Koperasi A",
        accountId: "acc-1",
      });
    });

    await act(async () => {
      await result.current.handlePickDeviceRole("terminal");
    });

    expect(mockIssueAndCacheLocalSessionGrant).toHaveBeenCalledWith(
      "t-1",
      "acc-1",
      "fp-hash-123",
      "terminal",
    );
  });

  it("calls setCurrentDeviceId with fingerprint", async () => {
    const { useLoginFlow } = await import("../useLoginFlow");
    const { result } = renderHook(() => useLoginFlow());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    act(() => {
      result.current.advanceToPickRole({
        tenantId: "t-1",
        tenantSlug: "koperasi-a",
        tenantName: "Koperasi A",
        accountId: "acc-1",
      });
    });

    await act(async () => {
      await result.current.handlePickDeviceRole("scout");
    });

    expect(mockSetCurrentDeviceId).toHaveBeenCalledWith("fp-hash-123");
  });
});
