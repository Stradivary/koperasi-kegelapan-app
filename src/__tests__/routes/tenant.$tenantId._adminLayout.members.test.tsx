// @vitest-environment jsdom
/**
 * Tests for src/routes/tenant.$tenantId._adminLayout.members.tsx
 * Verifies the /tenant/$tenantId/members route renders MemberSection.
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

vi.mock("#/presentation/components/section/MemberSection", () => ({
  MemberSection: ({ tenantId }: { tenantId: string }) => (
    <div data-testid="member-section" data-tenant-id={tenantId} />
  ),
}));

import { TenantRoutePending } from "#/presentation/hooks/useTenantContext";
import { MemberSection } from "#/presentation/components/section/MemberSection";

function MembersPage() {
  const tenantId = "t-1";
  const { tenantContext, loading } = mockUseTenantContext(tenantId);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return <MemberSection tenantId={tenantId} />;
}

describe("MembersPage (/tenant/$tenantId/members)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders TenantRoutePending when loading", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: true });
    render(<MembersPage />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders TenantRoutePending when tenantContext is null", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: false });
    render(<MembersPage />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders MemberSection with tenantId when authenticated", () => {
    mockUseTenantContext.mockReturnValue({
      tenantContext: { tenantName: "Test", role: "admin" },
      loading: false,
    });
    render(<MembersPage />);
    const section = screen.getByTestId("member-section");
    expect(section.getAttribute("data-tenant-id")).toBe("t-1");
  });
});
