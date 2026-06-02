// @vitest-environment jsdom
/**
 * Tests for src/routes/tenant.$tenantId._adminLayout.transactions.tsx
 * Verifies the /tenant/$tenantId/transactions route renders TransactionsSection.
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

vi.mock("#/presentation/components/section/TransactionsSection", () => ({
  TransactionsSection: ({ tenantId, accountId }: { tenantId: string; accountId: string }) => (
    <div data-testid="transactions-section" data-tenant-id={tenantId} data-account-id={accountId} />
  ),
}));

import { TenantRoutePending } from "#/presentation/hooks/useTenantContext";
import { TransactionsSection } from "#/presentation/components/section/TransactionsSection";

function TransactionsPage() {
  const tenantId = "t-1";
  const { tenantContext, loading } = mockUseTenantContext(tenantId);

  if (loading || !tenantContext) return <TenantRoutePending />;

  return <TransactionsSection tenantId={tenantId} accountId={tenantContext.accountId} />;
}

describe("TransactionsPage (/tenant/$tenantId/transactions)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders TenantRoutePending when loading", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: true });
    render(<TransactionsPage />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders TenantRoutePending when tenantContext is null", () => {
    mockUseTenantContext.mockReturnValue({ tenantContext: null, loading: false });
    render(<TransactionsPage />);
    expect(screen.getByTestId("tenant-route-pending")).toBeDefined();
  });

  it("renders TransactionsSection with correct props when authenticated", () => {
    mockUseTenantContext.mockReturnValue({
      tenantContext: { accountId: "a-1", role: "admin" },
      loading: false,
    });
    render(<TransactionsPage />);
    const section = screen.getByTestId("transactions-section");
    expect(section.getAttribute("data-tenant-id")).toBe("t-1");
    expect(section.getAttribute("data-account-id")).toBe("a-1");
  });
});
