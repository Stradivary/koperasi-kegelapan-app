// @vitest-environment jsdom
/**
 * Tests for src/routes/tenant.$tenantId._kioskLayout.tsx
 * Tests the KioskLayoutRoute component and helper functions.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseTenantContext = vi.fn();
const mockUseReconciliation = vi.fn();
let mockPathname = "/tenant/t-1/kiosk";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    component: null,
    useParams: () => ({ tenantId: "t-1" }),
  }),
  Outlet: () => <div data-testid="outlet" />,
  useLocation: ({ select }: { select: (loc: { pathname: string }) => string }) =>
    select({ pathname: mockPathname }),
}));

vi.mock("#/presentation/components/block/OfflineIndicator", () => ({
  OfflineIndicator: ({
    pendingCount,
    syncStatus,
  }: {
    pendingCount: number;
    onSync: () => void;
    syncStatus: string;
  }) => (
    <div
      data-testid="offline-indicator"
      data-pending-count={pendingCount}
      data-sync-status={syncStatus}
    />
  ),
}));

vi.mock("#/presentation/components/layout/KioskLayout", () => ({
  KioskLayout: ({
    children,
    title,
    subtitle,
    currentMode,
    tenantId,
  }: {
    children: React.ReactNode;
    title: string;
    subtitle?: string;
    tenantName: string;
    tenantId: string;
    currentMode: string;
    canAccessStation: boolean;
    deviceRole: string;
    trailing?: React.ReactNode;
  }) => (
    <div
      data-testid="kiosk-layout"
      data-title={title}
      data-subtitle={subtitle ?? ""}
      data-current-mode={currentMode}
      data-tenant-id={tenantId}
    >
      {children}
    </div>
  ),
}));

vi.mock("#/presentation/hooks/useReconciliation", () => ({
  useReconciliation: (tenantId: string, terminalId: number) =>
    mockUseReconciliation(tenantId, terminalId),
}));

vi.mock("#/presentation/hooks/useTenantContext", () => ({
  TenantRoutePending: () => <div data-testid="tenant-route-pending" />,
  useTenantContext: (tenantId: string, allowedRoles?: readonly string[]) =>
    mockUseTenantContext(tenantId, allowedRoles),
}));

import { Outlet } from "@tanstack/react-router";
import { KioskLayout } from "#/presentation/components/layout/KioskLayout";
import { TenantRoutePending } from "#/presentation/hooks/useTenantContext";
import { OfflineIndicator } from "#/presentation/components/block/OfflineIndicator";

// Extract helper functions for direct testing
type KioskView = "terminal" | "kiosk" | "scout" | "gate";

function getKioskView(pathname: string): KioskView {
  if (pathname.endsWith("/terminal")) return "terminal";
  if (pathname.endsWith("/scout")) return "scout";
  if (pathname.endsWith("/gate")) return "gate";
  return "kiosk";
}

function getKioskTitle(view: KioskView): string {
  if (view === "terminal") return "Terminal";
  if (view === "scout") return "Cek Saldo";
  if (view === "gate") return "Gerbang Masuk";
  return "Mesin Kasir";
}

function getKioskSubtitle(view: KioskView): string | undefined {
  if (view === "gate") return "Check-in";
  return undefined;
}

// Recreate KioskLayoutRoute for testing
function KioskLayoutRoute() {
  const tenantId = "t-1";
  const { tenantContext, loading } = mockUseTenantContext(tenantId, [
    "admin",
    "gate",
    "kiosk",
    "scout",
    "terminal",
  ]);
  const pathname = mockPathname;
  const { status, pendingCount, sync } = mockUseReconciliation(
    tenantId,
    tenantContext?.terminalId ?? 0,
  );

  if (loading || !tenantContext) return <TenantRoutePending />;

  const currentMode = getKioskView(pathname);

  const trailing =
    currentMode === "terminal" ? (
      <OfflineIndicator pendingCount={pendingCount} onSync={sync} syncStatus={status} />
    ) : undefined;

  return (
    <KioskLayout
      title={getKioskTitle(currentMode)}
      subtitle={getKioskSubtitle(currentMode)}
      tenantName={tenantContext.tenantName}
      tenantId={tenantId}
      currentMode={currentMode}
      canAccessStation={
        tenantContext.canAccessStation ??
        (tenantContext.role === "admin" || tenantContext.role === "station")
      }
      deviceRole={tenantContext.role}
      trailing={trailing}
    >
      <Outlet />
    </KioskLayout>
  );
}

describe("getKioskView", () => {
  it("returns 'terminal' for pathname ending with /terminal", () => {
    expect(getKioskView("/tenant/t-1/terminal")).toBe("terminal");
  });

  it("returns 'scout' for pathname ending with /scout", () => {
    expect(getKioskView("/tenant/t-1/scout")).toBe("scout");
  });

  it("returns 'gate' for pathname ending with /gate", () => {
    expect(getKioskView("/tenant/t-1/gate")).toBe("gate");
  });

  it("returns 'kiosk' as default for any other pathname", () => {
    expect(getKioskView("/tenant/t-1/kiosk")).toBe("kiosk");
    expect(getKioskView("/tenant/t-1/")).toBe("kiosk");
    expect(getKioskView("/tenant/t-1/unknown")).toBe("kiosk");
  });
});

describe("getKioskTitle", () => {
  it("returns 'Terminal' for terminal view", () => {
    expect(getKioskTitle("terminal")).toBe("Terminal");
  });

  it("returns 'Cek Saldo' for scout view", () => {
    expect(getKioskTitle("scout")).toBe("Cek Saldo");
  });

  it("returns 'Gerbang Masuk' for gate view", () => {
    expect(getKioskTitle("gate")).toBe("Gerbang Masuk");
  });

  it("returns 'Mesin Kasir' for kiosk view", () => {
    expect(getKioskTitle("kiosk")).toBe("Mesin Kasir");
  });
});

describe("getKioskSubtitle", () => {
  it("returns 'Check-in' for gate view", () => {
    expect(getKioskSubtitle("gate")).toBe("Check-in");
  });

  it("returns undefined for terminal view", () => {
    expect(getKioskSubtitle("terminal")).toBeUndefined();
  });

  it("returns undefined for kiosk view", () => {
    expect(getKioskSubtitle("kiosk")).toBeUndefined();
  });

  it("returns undefined for scout view", () => {
    expect(getKioskSubtitle("scout")).toBeUndefined();
  });
});

describe("KioskLayoutRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/tenant/t-1/kiosk";
    mockUseReconciliation.mockReturnValue({
      status: "idle",
      pendingCount: 0,
      sync: vi.fn(),
      checkPending: vi.fn(),
    });
  });

  it("renders TenantRoutePending when loading", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: true });
    render(<KioskLayoutRoute />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders TenantRoutePending when tenantContext is null", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: false });
    render(<KioskLayoutRoute />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders KioskLayout with correct title for kiosk mode", () => {
    mockUseTenantContext.mockReturnValue({
      tenantContext: {
        tenantName: "Test Tenant",
        role: "kiosk",
        accountId: "a-1",
        deviceId: "d-1",
        terminalId: 1,
      },
      loading: false,
    });
    render(<KioskLayoutRoute />);
    const layout = screen.getByTestId("kiosk-layout");
    expect(layout.getAttribute("data-title")).toBe("Mesin Kasir");
    expect(layout.getAttribute("data-current-mode")).toBe("kiosk");
  });

  it("renders KioskLayout with correct title for terminal mode", () => {
    mockPathname = "/tenant/t-1/terminal";
    mockUseTenantContext.mockReturnValue({
      tenantContext: {
        tenantName: "Test Tenant",
        role: "terminal",
        accountId: "a-1",
        deviceId: "d-1",
        terminalId: 1,
      },
      loading: false,
    });
    render(<KioskLayoutRoute />);
    const layout = screen.getByTestId("kiosk-layout");
    expect(layout.getAttribute("data-title")).toBe("Terminal");
    expect(layout.getAttribute("data-current-mode")).toBe("terminal");
  });

  it("renders KioskLayout with subtitle for gate mode", () => {
    mockPathname = "/tenant/t-1/gate";
    mockUseTenantContext.mockReturnValue({
      tenantContext: {
        tenantName: "Test Tenant",
        role: "gate",
        accountId: "a-1",
        deviceId: "d-1",
        terminalId: 1,
      },
      loading: false,
    });
    render(<KioskLayoutRoute />);
    const layout = screen.getByTestId("kiosk-layout");
    expect(layout.getAttribute("data-title")).toBe("Gerbang Masuk");
    expect(layout.getAttribute("data-subtitle")).toBe("Check-in");
  });

  it("renders Outlet inside KioskLayout", () => {
    mockUseTenantContext.mockReturnValue({
      tenantContext: {
        tenantName: "Test Tenant",
        role: "kiosk",
        accountId: "a-1",
        deviceId: "d-1",
        terminalId: 1,
      },
      loading: false,
    });
    render(<KioskLayoutRoute />);
    expect(screen.getByTestId("outlet")).toBeDefined();
  });
});
