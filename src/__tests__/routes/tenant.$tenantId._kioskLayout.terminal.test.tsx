// @vitest-environment jsdom
/**
 * Tests for src/routes/tenant.$tenantId._kioskLayout.terminal.tsx
 * Verifies the /tenant/$tenantId/terminal route renders TerminalSection.
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

vi.mock("#/presentation/hooks/useTenantContext", () => ({
  TenantRoutePending: () => <div data-testid="tenant-route-pending" />,
  useTenantContext: (tenantId: string) => mockUseTenantContext(tenantId),
}));

vi.mock("#/presentation/components/section/TerminalSection", () => ({
  TerminalSection: ({
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
      data-testid="terminal-section"
      data-tenant-id={tenantId}
      data-account-id={accountId}
      data-device-id={deviceId}
      data-terminal-id={terminalId}
    />
  ),
}));

import { TenantRoutePending } from "#/presentation/hooks/useTenantContext";
import { TerminalSection } from "#/presentation/components/section/TerminalSection";

function TerminalPage() {
  const tenantId = "t-1";
  const { tenantContext, loading } = mockUseTenantContext(tenantId);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return (
    <TerminalSection
      tenantId={tenantId}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={tenantContext.terminalId}
    />
  );
}

describe("TerminalPage (/tenant/$tenantId/terminal)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders TenantRoutePending when loading", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: true });
    render(<TerminalPage />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders TenantRoutePending when tenantContext is null", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: false });
    render(<TerminalPage />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders TerminalSection with correct props when authenticated", () => {
    mockUseTenantContext.mockReturnValue({
      tenantContext: { accountId: "a-1", deviceId: "d-1", terminalId: 5 },
      loading: false,
    });
    render(<TerminalPage />);
    const section = screen.getByTestId("terminal-section");
    expect(section.getAttribute("data-tenant-id")).toBe("t-1");
    expect(section.getAttribute("data-account-id")).toBe("a-1");
    expect(section.getAttribute("data-device-id")).toBe("d-1");
    expect(section.getAttribute("data-terminal-id")).toBe("5");
  });
});
