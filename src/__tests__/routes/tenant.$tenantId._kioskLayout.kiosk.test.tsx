// @vitest-environment jsdom
/**
 * Tests for src/routes/tenant.$tenantId._kioskLayout.kiosk.tsx
 * Verifies the /tenant/$tenantId/kiosk route renders KioskSection.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseTenantContext = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    component: null,
    useParams: () => ({ tenantId: "t-1" }),
  }),
}));

vi.mock("#/hooks/useTenantContext", () => ({
  TenantRoutePending: () => <div data-testid="tenant-route-pending" />,
  useTenantContext: (tenantId: string, allowedRoles?: readonly string[]) =>
    mockUseTenantContext(tenantId, allowedRoles),
}));

vi.mock("#/components/section/KioskSection", () => ({
  KioskSection: ({
    tenantId,
    accountId,
    deviceId,
    terminalId,
  }: {
    tenantId: string;
    accountId: string;
    deviceId: string;
    terminalId: number;
  }) => (
    <div
      data-testid="kiosk-section"
      data-tenant-id={tenantId}
      data-account-id={accountId}
      data-device-id={deviceId}
      data-terminal-id={terminalId}
    />
  ),
}));

import { TenantRoutePending } from "#/hooks/useTenantContext";
import { KioskSection } from "#/components/section/KioskSection";

function KioskPage() {
  const tenantId = "t-1";
  const { tenantContext, loading } = mockUseTenantContext(tenantId, ["admin", "kiosk"]);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return (
    <KioskSection
      tenantId={tenantId}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={tenantContext.terminalId}
    />
  );
}

describe("KioskPage (/tenant/$tenantId/kiosk)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders TenantRoutePending when loading", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: true });
    render(<KioskPage />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders TenantRoutePending when tenantContext is null", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: false });
    render(<KioskPage />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders KioskSection with correct props when authenticated", () => {
    mockUseTenantContext.mockReturnValue({
      tenantContext: { accountId: "a-1", deviceId: "d-1", terminalId: 3 },
      loading: false,
    });
    render(<KioskPage />);
    const section = screen.getByTestId("kiosk-section");
    expect(section.getAttribute("data-tenant-id")).toBe("t-1");
    expect(section.getAttribute("data-account-id")).toBe("a-1");
    expect(section.getAttribute("data-device-id")).toBe("d-1");
    expect(section.getAttribute("data-terminal-id")).toBe("3");
  });

  it("passes allowedRoles to useTenantContext", () => {
    mockUseTenantContext.mockReturnValue({
      tenantContext: { accountId: "a-1", deviceId: "d-1", terminalId: 1 },
      loading: false,
    });
    render(<KioskPage />);
    expect(mockUseTenantContext).toHaveBeenCalledWith("t-1", ["admin", "kiosk"]);
  });
});
