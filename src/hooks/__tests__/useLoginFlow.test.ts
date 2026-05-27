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

vi.mock("#/lib/indexeddb", () => ({
  tenantContextStore: {
    getAll: () => mockTenantContextStoreGetAll(),
    put: (...args: unknown[]) => mockTenantContextStorePut(...args),
  },
  localTenantConfigStore: {
    getAll: () => mockLocalTenantConfigStoreGetAll(),
  },
}));

const mockGetDeviceFingerprint = vi.fn();
vi.mock("#/lib/getOrCreateDeviceId", () => ({
  getDeviceFingerprint: () => mockGetDeviceFingerprint(),
}));

const mockSetCurrentDeviceId = vi.fn();
const mockRestoreAuthState = vi.fn();
vi.mock("#/lib/api", () => ({
  setCurrentDeviceId: (...args: unknown[]) => mockSetCurrentDeviceId(...args),
  restoreAuthState: (...args: unknown[]) => mockRestoreAuthState(...args),
}));

const mockIssueAndCacheLocalSessionGrant = vi.fn();
vi.mock("#/lib/localSessionGrant", () => ({
  issueAndCacheLocalSessionGrant: (...args: unknown[]) =>
    mockIssueAndCacheLocalSessionGrant(...args),
}));

const mockConsumeDeviceSetupLaunchContext = vi.fn();
vi.mock("#/lib/utils", () => ({
  consumeDeviceSetupLaunchContext: () => mockConsumeDeviceSetupLaunchContext(),
}));

const mockHydrateQueryCache = vi.fn();
vi.mock("#/hooks/useHydrateCache", () => ({
  hydrateQueryCache: (...args: unknown[]) => mockHydrateQueryCache(...args),
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockConsumeDeviceSetupLaunchContext.mockReturnValue(null);
  mockTenantContextStoreGetAll.mockResolvedValue([]);
  mockLocalTenantConfigStoreGetAll.mockResolvedValue([]);
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

describe("useLoginFlow — initial mode detection", () => {
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

describe("useLoginFlow — mode transitions", () => {
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

describe("useLoginFlow — enterScoutBrowse", () => {
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

describe("useLoginFlow — handleScoutSelectTenant", () => {
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

describe("useLoginFlow — advanceToPickRole and handlePickDeviceRole", () => {
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

describe("useLoginFlow — redirectToRole", () => {
  const roleRoutes: Array<[string, string]> = [
    ["admin", "/tenant/t-1/admin"],
    ["station", "/tenant/t-1/station"],
    ["terminal", "/tenant/t-1/terminal"],
    ["gate", "/tenant/t-1/gate"],
    ["kiosk", "/tenant/t-1/kiosk"],
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
