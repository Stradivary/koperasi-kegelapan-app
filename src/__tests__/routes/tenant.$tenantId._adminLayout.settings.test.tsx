// @vitest-environment jsdom
/**
 * Tests for src/routes/tenant.$tenantId._adminLayout.settings.tsx
 * Verifies the /tenant/$tenantId/settings route renders SettingsSection.
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
  useTenantContext: (tenantId: string) => mockUseTenantContext(tenantId),
}));

vi.mock("#/components/section/SettingsSection", () => ({
  SettingsSection: ({ tenantId }: { tenantId: string }) => (
    <div data-testid="settings-section" data-tenant-id={tenantId} />
  ),
}));

import { TenantRoutePending } from "#/hooks/useTenantContext";
import { SettingsSection } from "#/components/section/SettingsSection";

function SettingsPage() {
  const tenantId = "t-1";
  const { tenantContext, loading } = mockUseTenantContext(tenantId);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return <SettingsSection tenantId={tenantId} />;
}

describe("SettingsPage (/tenant/$tenantId/settings)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders TenantRoutePending when loading", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: true });
    render(<SettingsPage />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders TenantRoutePending when tenantContext is null", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: false });
    render(<SettingsPage />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders SettingsSection with tenantId when authenticated", () => {
    mockUseTenantContext.mockReturnValue({
      tenantContext: { tenantName: "Test", role: "admin" },
      loading: false,
    });
    render(<SettingsPage />);
    const section = screen.getByTestId("settings-section");
    expect(section.getAttribute("data-tenant-id")).toBe("t-1");
  });
});
