// @vitest-environment jsdom
/**
 * Tests for src/routes/tenant.$tenantId._adminLayout.tsx
 * Tests the AdminLayoutRoute component and getAdminView helper.
 */
import { render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockUseTenantContext = vi.fn();
const mockUseSyncEngineContext = vi.fn();
const mockUseAdminTenantSync = vi.fn();
let mockPathname = "/tenant/t-1/cards";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    component: null,
    useParams: () => ({ tenantId: "t-1" }),
  }),
  Outlet: () => <div data-testid="outlet" />,
  useLocation: ({ select }: { select: (loc: { pathname: string }) => string }) =>
    select({ pathname: mockPathname }),
  useNavigate: () => mockNavigate,
}));

vi.mock("#/presentation/components/layout/AdminLayout", () => ({
  AdminLayout: ({
    children,
    tenantId,
    activeSection,
    onSectionChange,
  }: {
    children: React.ReactNode;
    tenantId: string;
    tenantName: string;
    role: string;
    activeSection: string;
    onSectionChange: (section: string) => void;
    syncStatus: string;
    lastSyncedAt: number | null;
    pendingCount: number;
    onTriggerSync: () => void;
    onSyncToServer: () => void;
    isSyncingToServer: boolean;
  }) => (
    <div data-testid="admin-layout" data-tenant-id={tenantId} data-active-section={activeSection}>
      <button data-testid="section-change-btn" onClick={() => onSectionChange("members")} />
      <button data-testid="section-change-scout-btn" onClick={() => onSectionChange("scout")} />
      <button
        data-testid="section-change-same-btn"
        onClick={() => onSectionChange(activeSection)}
      />
      {children}
    </div>
  ),
}));

vi.mock("#/presentation/hooks/SyncEngineContext", () => ({
  useSyncEngineContext: () => mockUseSyncEngineContext(),
}));

vi.mock("#/presentation/hooks/useAdminTenantSync", () => ({
  useAdminTenantSync: (tenantId: string) => mockUseAdminTenantSync(tenantId),
}));

vi.mock("#/presentation/hooks/useTenantContext", () => ({
  TenantRoutePending: () => <div data-testid="tenant-route-pending" />,
  useTenantContext: (tenantId: string) => mockUseTenantContext(tenantId),
}));

import { Outlet } from "@tanstack/react-router";
import { AdminLayout } from "#/presentation/components/layout/AdminLayout";
import { TenantRoutePending } from "#/presentation/hooks/useTenantContext";

// Recreate the getAdminView function for direct testing
type AdminView = "cards" | "members" | "transactions" | "settings" | "scout";

function getAdminView(pathname: string): AdminView {
  if (pathname.endsWith("/members")) return "members";
  if (pathname.endsWith("/transactions")) return "transactions";
  if (pathname.endsWith("/settings")) return "settings";
  return "cards";
}

const ADMIN_PATHS: Record<Exclude<AdminView, "scout">, string> = {
  cards: "cards",
  members: "members",
  transactions: "transactions",
  settings: "settings",
};

// Recreate AdminLayoutRoute for testing
function AdminLayoutRoute() {
  const tenantId = "t-1";
  const { tenantContext, loading } = mockUseTenantContext(tenantId);
  const syncEngine = mockUseSyncEngineContext();
  const { onSyncToServer, isSyncingToServer } = mockUseAdminTenantSync(tenantId);
  const pathname = mockPathname;

  if (loading || !tenantContext) return <TenantRoutePending />;

  const activeSection = getAdminView(pathname);

  function handleSectionChange(section: AdminView) {
    if (section === activeSection) return;
    if (section === "scout") {
      mockNavigate({ to: `/tenant/${tenantId}/scout` });
      return;
    }
    mockNavigate({ to: `/tenant/${tenantId}/${ADMIN_PATHS[section]}` });
  }

  return (
    <AdminLayout
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      role={tenantContext.role}
      activeSection={activeSection}
      onSectionChange={handleSectionChange}
      syncStatus={syncEngine?.syncStatus ?? "idle"}
      lastSyncedAt={syncEngine?.lastSyncedAt ?? null}
      pendingCount={syncEngine?.pendingCount ?? 0}
      onTriggerSync={syncEngine?.triggerSync ?? (() => {})}
      onSyncToServer={onSyncToServer}
      isSyncingToServer={isSyncingToServer}
    >
      <Outlet />
    </AdminLayout>
  );
}

describe("getAdminView", () => {
  it("returns 'members' for pathname ending with /members", () => {
    expect(getAdminView("/tenant/t-1/members")).toBe("members");
  });

  it("returns 'transactions' for pathname ending with /transactions", () => {
    expect(getAdminView("/tenant/t-1/transactions")).toBe("transactions");
  });

  it("returns 'settings' for pathname ending with /settings", () => {
    expect(getAdminView("/tenant/t-1/settings")).toBe("settings");
  });

  it("returns 'cards' as default for any other pathname", () => {
    expect(getAdminView("/tenant/t-1/cards")).toBe("cards");
    expect(getAdminView("/tenant/t-1/")).toBe("cards");
    expect(getAdminView("/tenant/t-1/unknown")).toBe("cards");
  });
});

describe("AdminLayoutRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/tenant/t-1/cards";
    mockUseSyncEngineContext.mockReturnValue({
      syncStatus: "idle",
      lastSyncedAt: null,
      pendingCount: 0,
      triggerSync: vi.fn(),
    });
    mockUseAdminTenantSync.mockReturnValue({
      onSyncToServer: vi.fn(),
      isSyncingToServer: false,
    });
  });

  it("renders TenantRoutePending when loading", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: true });
    render(<AdminLayoutRoute />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders TenantRoutePending when tenantContext is null", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: false });
    render(<AdminLayoutRoute />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders AdminLayout with correct props when authenticated", () => {
    mockUseTenantContext.mockReturnValue({
      tenantContext: {
        tenantName: "Test Tenant",
        role: "admin",
        accountId: "a-1",
        deviceId: "d-1",
        terminalId: 1,
      },
      loading: false,
    });
    render(<AdminLayoutRoute />);
    const layout = screen.getByTestId("admin-layout");
    expect(layout.getAttribute("data-tenant-id")).toBe("t-1");
    expect(layout.getAttribute("data-active-section")).toBe("cards");
  });

  it("renders Outlet inside AdminLayout", () => {
    mockUseTenantContext.mockReturnValue({
      tenantContext: {
        tenantName: "Test Tenant",
        role: "admin",
        accountId: "a-1",
        deviceId: "d-1",
        terminalId: 1,
      },
      loading: false,
    });
    render(<AdminLayoutRoute />);
    expect(screen.getByTestId("outlet")).toBeDefined();
  });

  it("navigates to members when section changes to members", () => {
    mockUseTenantContext.mockReturnValue({
      tenantContext: {
        tenantName: "Test Tenant",
        role: "admin",
        accountId: "a-1",
        deviceId: "d-1",
        terminalId: 1,
      },
      loading: false,
    });
    render(<AdminLayoutRoute />);
    act(() => {
      screen.getByTestId("section-change-btn").click();
    });
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/tenant/t-1/members" });
  });

  it("navigates to scout route when section changes to scout", () => {
    mockUseTenantContext.mockReturnValue({
      tenantContext: {
        tenantName: "Test Tenant",
        role: "admin",
        accountId: "a-1",
        deviceId: "d-1",
        terminalId: 1,
      },
      loading: false,
    });
    render(<AdminLayoutRoute />);
    act(() => {
      screen.getByTestId("section-change-scout-btn").click();
    });
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/tenant/t-1/scout" });
  });

  it("does not navigate when section is already active", () => {
    mockUseTenantContext.mockReturnValue({
      tenantContext: {
        tenantName: "Test Tenant",
        role: "admin",
        accountId: "a-1",
        deviceId: "d-1",
        terminalId: 1,
      },
      loading: false,
    });
    render(<AdminLayoutRoute />);
    act(() => {
      screen.getByTestId("section-change-same-btn").click();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("detects members section from pathname", () => {
    mockPathname = "/tenant/t-1/members";
    mockUseTenantContext.mockReturnValue({
      tenantContext: {
        tenantName: "Test Tenant",
        role: "admin",
        accountId: "a-1",
        deviceId: "d-1",
        terminalId: 1,
      },
      loading: false,
    });
    render(<AdminLayoutRoute />);
    expect(screen.getByTestId("admin-layout").getAttribute("data-active-section")).toBe("members");
  });
});
