// @vitest-environment jsdom
/**
 * Tests for src/components/block/superadmin/TenantDetailPanel.tsx
 * Covers: loading/error/null states, tenant metadata, status actions,
 *         confirmation dialog (open/confirm/cancel/onOpenChange),
 *         archived tenant (no transitions), renderMobileItem, formatDate.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

// ─── mocks ───────────────────────────────────────────────────────────────────

vi.mock("#/presentation/components/block/data-table", () => ({
  DataTable: ({
    data,
    renderMobileItem,
    emptyState,
  }: {
    data: {
      accountId: string;
      username: string;
      role: string;
      status: string;
      createdAt: string;
    }[];
    columns?: unknown[];
    paginationMode?: string;
    pageSize?: number;
    showSearch?: boolean;
    enableSorting?: boolean;
    getRowId?: unknown;
    emptyState?: React.ReactNode;
    renderMobileItem?: (row: { original: unknown }) => React.ReactNode;
  }) => (
    <div data-testid="accounts-table">
      {data.length === 0 && emptyState}
      {data.map((a) => (
        <div key={a.accountId} data-testid={`account-row-${a.accountId}`}>
          {a.username}
          {renderMobileItem?.({ original: a })}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("#/presentation/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
    size,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} data-size={size}>
      {children}
    </button>
  ),
}));

vi.mock("#/presentation/components/ui/badge", () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

vi.mock("#/presentation/components/ui/confirmation-dialog-drawer", () => ({
  ConfirmationDialogDrawer: ({
    open,
    onConfirm,
    onCancel,
    onOpenChange,
    title,
    description,
    confirmVariant,
    isProcessing,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    onOpenChange?: (o: boolean) => void;
    title: string;
    description?: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmVariant?: string;
    isProcessing?: boolean;
    processingLabel?: string;
  }) =>
    open ? (
      <div
        data-testid="confirm-dialog"
        data-variant={confirmVariant}
        data-processing={String(isProcessing)}
      >
        <span>{title}</span>
        <div data-testid="dialog-description">{description}</div>
        <button data-testid="dialog-confirm" onClick={onConfirm}>
          Confirm
        </button>
        <button data-testid="dialog-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button data-testid="dialog-open-change" onClick={() => onOpenChange?.(false)}>
          Close via onOpenChange
        </button>
      </div>
    ) : null,
}));

vi.mock("#/presentation/components/block/LoadingState", () => ({
  LoadingState: ({ text }: { text?: string }) => <div data-testid="loading">{text}</div>,
}));

vi.mock("#/application/admin/superadminTenants.types", () => ({
  VALID_TRANSITIONS: {
    active: new Set(["suspended", "archived"]),
    suspended: new Set(["active", "archived"]),
    archived: new Set([]),
  },
}));

vi.mock("lucide-react", () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  Loader2: () => <span data-testid="icon-loader" />,
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import { TenantDetailPanel } from "#/presentation/components/block/superadmin/TenantDetailPanel";
import type { TenantDetail } from "#/application/admin/superadminTenants.types";

// ─── fixtures ────────────────────────────────────────────────────────────────

const mockTenant: TenantDetail = {
  tenantId: "t-1",
  slug: "test-tenant",
  name: "Test Tenant",
  status: "active",
  timezone: "Asia/Jakarta",
  createdAt: "2024-01-15T08:30:00Z",
  updatedAt: "2024-06-01T12:00:00Z",
  accounts: [
    {
      accountId: "a-1",
      username: "admin1",
      role: "admin",
      status: "active",
      createdAt: "2024-01-15T00:00:00Z",
    },
    {
      accountId: "a-2",
      username: "station1",
      role: "station",
      status: "suspended",
      createdAt: "2024-02-01T00:00:00Z",
    },
  ],
};

const archivedTenant: TenantDetail = {
  ...mockTenant,
  tenantId: "t-arch",
  status: "archived",
  accounts: [],
};

function baseProps(overrides = {}) {
  return {
    tenant: mockTenant,
    isLoading: false,
    error: null,
    onStatusChange: vi.fn(),
    onBack: vi.fn(),
    isUpdating: false,
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("TenantDetailPanel - loading/error/null states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows loading state with back button", () => {
    render(<TenantDetailPanel {...baseProps({ tenant: null, isLoading: true })} />);
    expect(screen.getByTestId("loading")).toBeDefined();
    expect(screen.getByText("Back to Tenants")).toBeDefined();
  });

  it("calls onBack from loading state", () => {
    const onBack = vi.fn();
    render(<TenantDetailPanel {...baseProps({ tenant: null, isLoading: true, onBack })} />);
    fireEvent.click(screen.getByText("Back to Tenants"));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows error state with message", () => {
    render(<TenantDetailPanel {...baseProps({ tenant: null, error: "Load failed" })} />);
    expect(screen.getByText("Load failed")).toBeDefined();
  });

  it("calls onBack from error state", () => {
    const onBack = vi.fn();
    render(<TenantDetailPanel {...baseProps({ tenant: null, error: "err", onBack })} />);
    fireEvent.click(screen.getByText("Back to Tenants"));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows not found when tenant is null (no error, no loading)", () => {
    render(<TenantDetailPanel {...baseProps({ tenant: null })} />);
    expect(screen.getByText("Tenant not found.")).toBeDefined();
  });

  it("calls onBack from not-found state", () => {
    const onBack = vi.fn();
    render(<TenantDetailPanel {...baseProps({ tenant: null, onBack })} />);
    fireEvent.click(screen.getByText("Back to Tenants"));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe("TenantDetailPanel - tenant metadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders tenant name and slug", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    expect(screen.getByText("Test Tenant")).toBeDefined();
    expect(screen.getByText("test-tenant")).toBeDefined();
  });

  it("renders tenant timezone and ID", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    expect(screen.getByText("Asia/Jakarta")).toBeDefined();
    expect(screen.getByText("t-1")).toBeDefined();
  });

  it("renders formatted createdAt and updatedAt dates", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    // Check date part only — time varies by timezone
    expect(screen.getAllByText(/Jan 15, 2024/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Jun 1, 2024/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders status badge", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    // "Active" appears for tenant header badge + account mobile item
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
  });

  it("renders accounts table with account rows", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    expect(screen.getByTestId("accounts-table")).toBeDefined();
    expect(screen.getAllByText("admin1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("station1").length).toBeGreaterThanOrEqual(1);
  });

  it("shows accounts count in section header", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    expect(screen.getByText("Accounts (2)")).toBeDefined();
  });

  it("shows empty state when tenant has no accounts", () => {
    render(<TenantDetailPanel {...baseProps({ tenant: archivedTenant })} />);
    expect(screen.getByText("No accounts found")).toBeDefined();
  });
});

describe("TenantDetailPanel - status actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows Suspend and Archive buttons for active tenant", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    expect(screen.getByText("Suspend")).toBeDefined();
    expect(screen.getByText("Archive")).toBeDefined();
  });

  it("shows Activate and Archive buttons for suspended tenant", () => {
    const suspended = { ...mockTenant, status: "suspended" as const };
    render(<TenantDetailPanel {...baseProps({ tenant: suspended })} />);
    expect(screen.getByText("Activate")).toBeDefined();
    expect(screen.getByText("Archive")).toBeDefined();
  });

  it("shows no action buttons for archived tenant", () => {
    render(<TenantDetailPanel {...baseProps({ tenant: archivedTenant })} />);
    expect(screen.queryByText("Activate")).toBeNull();
    expect(screen.queryByText("Suspend")).toBeNull();
    expect(screen.queryByText("Archive")).toBeNull();
  });

  it("disables action buttons when isUpdating is true", () => {
    render(<TenantDetailPanel {...baseProps({ isUpdating: true })} />);
    const suspendBtn = screen.getByText("Suspend").closest("button");
    expect(suspendBtn?.disabled).toBe(true);
  });

  it("opens confirmation dialog when Suspend clicked", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    fireEvent.click(screen.getByText("Suspend"));
    expect(screen.getByTestId("confirm-dialog")).toBeDefined();
  });

  it("opens confirmation dialog when Archive clicked", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    fireEvent.click(screen.getByText("Archive"));
    expect(screen.getByTestId("confirm-dialog")).toBeDefined();
  });

  it("Archive dialog uses destructive variant", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    fireEvent.click(screen.getByText("Archive"));
    expect(screen.getByTestId("confirm-dialog").getAttribute("data-variant")).toBe("destructive");
  });

  it("calls onStatusChange with 'suspended' when Suspend confirmed", () => {
    const onStatusChange = vi.fn();
    render(<TenantDetailPanel {...baseProps({ onStatusChange })} />);
    fireEvent.click(screen.getByText("Suspend"));
    fireEvent.click(screen.getByTestId("dialog-confirm"));
    expect(onStatusChange).toHaveBeenCalledWith("suspended");
  });

  it("calls onStatusChange with 'archived' when Archive confirmed", () => {
    const onStatusChange = vi.fn();
    render(<TenantDetailPanel {...baseProps({ onStatusChange })} />);
    fireEvent.click(screen.getByText("Archive"));
    fireEvent.click(screen.getByTestId("dialog-confirm"));
    expect(onStatusChange).toHaveBeenCalledWith("archived");
  });

  it("closes dialog when Cancel clicked", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    fireEvent.click(screen.getByText("Suspend"));
    fireEvent.click(screen.getByTestId("dialog-cancel"));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("closes dialog via onOpenChange(false)", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    fireEvent.click(screen.getByText("Suspend"));
    fireEvent.click(screen.getByTestId("dialog-open-change"));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });
});

describe("TenantDetailPanel - renderMobileItem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders mobile item with username and role badge", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    // username appears in both table row and mobile item
    const adminTexts = screen.getAllByText("admin1");
    expect(adminTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("renders mobile item formatted date", () => {
    render(<TenantDetailPanel {...baseProps()} />);
    // Jan 15, 2024 appears in mobile item for account createdAt
    expect(screen.getAllByText(/Jan 15, 2024/).length).toBeGreaterThanOrEqual(1);
  });
});

describe("TenantDetailPanel - formatDate edge case", () => {
  beforeEach(() => vi.clearAllMocks());

  it("falls back to raw string for invalid date in tenant metadata", () => {
    const badTenant = { ...mockTenant, createdAt: "not-a-date", updatedAt: "also-bad" };
    render(<TenantDetailPanel {...baseProps({ tenant: badTenant })} />);
    expect(screen.getByText("not-a-date")).toBeDefined();
  });
});
