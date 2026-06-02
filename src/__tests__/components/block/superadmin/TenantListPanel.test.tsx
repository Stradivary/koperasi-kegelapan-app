// @vitest-environment jsdom
/**
 * Tests for src/components/block/superadmin/TenantListPanel.tsx
 * Covers: rendering, header, loading/error/empty states, column cells,
 *         row click, pagination (function updater + direct object),
 *         renderMobileItem, formatDate, STATUS_STYLES for all statuses.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

// ─── mocks ───────────────────────────────────────────────────────────────────

vi.mock("#/presentation/components/block/data-table", () => ({
  DataTable: ({
    data,
    isLoading,
    error,
    header,
    onRowClick,
    emptyState,
    emptySearchState,
    columns,
    onPaginationChange,
    serverPagination,
    renderMobileItem,
  }: {
    data: {
      tenantId: string;
      name: string;
      slug: string;
      status: string;
      timezone: string;
      accountCount: number;
      createdAt: string;
    }[];
    isLoading?: boolean;
    error?: string | null;
    header?: React.ReactNode;
    onRowClick?: (row: { tenantId: string }) => void;
    emptyState?: React.ReactNode;
    emptySearchState?: React.ReactNode;
    columns?: {
      id?: string;
      accessorKey?: string;
      cell?: (info: { getValue: () => unknown; row: { original: unknown } }) => React.ReactNode;
      header?: unknown;
    }[];
    onPaginationChange?: (u: unknown) => void;
    serverPagination?: { pageIndex: number; pageSize: number };
    renderMobileItem?: (row: { original: unknown }) => React.ReactNode;
    [key: string]: unknown;
  }) => (
    <div data-testid="data-table">
      {header}
      {isLoading && <div data-testid="loading">Loading...</div>}
      {error && <div data-testid="error">{error}</div>}
      {data.length === 0 && emptyState}
      <div data-testid="empty-search-state">{emptySearchState}</div>
      {data.map((row) => (
        <div
          key={row.tenantId}
          data-testid={`row-${row.tenantId}`}
          onClick={() => onRowClick?.(row)}
        >
          {/* Render column cells */}
          {columns?.map((col, i) => {
            const info = {
              getValue: () =>
                col.accessorKey ? (row as Record<string, unknown>)[col.accessorKey] : undefined,
              row: { original: row },
            };
            return (
              <span
                key={col.id ?? col.accessorKey ?? i}
                data-testid={`cell-${col.accessorKey ?? col.id ?? i}-${row.tenantId}`}
              >
                {typeof col.cell === "function" ? col.cell(info as never) : null}
              </span>
            );
          })}
          {renderMobileItem?.({ original: row })}
        </div>
      ))}
      <button
        data-testid="next-page"
        onClick={() =>
          onPaginationChange?.((_prev: { pageIndex: number; pageSize: number }) => ({
            pageIndex: (serverPagination?.pageIndex ?? 0) + 1,
            pageSize: serverPagination?.pageSize ?? 10,
          }))
        }
      >
        Next
      </button>
      <button
        data-testid="direct-page"
        onClick={() => onPaginationChange?.({ pageIndex: 2, pageSize: 10 })}
      >
        Direct
      </button>
    </div>
  ),
}));

vi.mock("#/presentation/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    size,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    size?: string;
  }) => (
    <button onClick={onClick} data-size={size}>
      {children}
    </button>
  ),
}));

vi.mock("#/presentation/components/ui/badge", () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>
      {children}
    </span>
  ),
}));

vi.mock("lucide-react", () => ({
  Plus: () => <span data-testid="icon-plus" />,
  Search: () => <span data-testid="icon-search" />,
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import {
  TenantListPanel,
  type TenantListItem,
} from "#/presentation/components/block/superadmin/TenantListPanel";

// ─── fixtures ────────────────────────────────────────────────────────────────

const tenants: TenantListItem[] = [
  {
    tenantId: "t-1",
    slug: "tenant-one",
    name: "Tenant One",
    status: "active",
    timezone: "Asia/Jakarta",
    accountCount: 3,
    createdAt: "2024-01-15T00:00:00Z",
  },
  {
    tenantId: "t-2",
    slug: "tenant-two",
    name: "Tenant Two",
    status: "suspended",
    timezone: "UTC",
    accountCount: 1,
    createdAt: "2024-02-01T00:00:00Z",
  },
  {
    tenantId: "t-3",
    slug: "tenant-three",
    name: "Tenant Three",
    status: "archived",
    timezone: "America/New_York",
    accountCount: 0,
    createdAt: "2023-12-01T00:00:00Z",
  },
];

function defaultProps(overrides = {}) {
  return {
    tenants,
    isLoading: false,
    error: null,
    searchQuery: "",
    onSearchChange: vi.fn(),
    onSelectTenant: vi.fn(),
    onCreateTenant: vi.fn(),
    pagination: { page: 1, pageSize: 10, total: 3 },
    onPageChange: vi.fn(),
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("TenantListPanel - rendering", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders tenant rows", () => {
    render(<TenantListPanel {...defaultProps()} />);
    expect(screen.getByTestId("row-t-1")).toBeDefined();
    expect(screen.getByTestId("row-t-2")).toBeDefined();
    expect(screen.getByTestId("row-t-3")).toBeDefined();
  });

  it("shows loading state", () => {
    render(<TenantListPanel {...defaultProps({ isLoading: true })} />);
    expect(screen.getByTestId("loading")).toBeDefined();
  });

  it("shows error state", () => {
    render(<TenantListPanel {...defaultProps({ error: "DB error" })} />);
    expect(screen.getByText("DB error")).toBeDefined();
  });

  it("shows empty state when no tenants", () => {
    render(<TenantListPanel {...defaultProps({ tenants: [] })} />);
    expect(screen.getAllByText("No tenants found").length).toBeGreaterThanOrEqual(1);
  });

  it("shows emptySearchState", () => {
    render(<TenantListPanel {...defaultProps()} />);
    expect(screen.getByText("Try adjusting your search query")).toBeDefined();
  });

  it("calls onCreateTenant when Create Tenant clicked", () => {
    const onCreateTenant = vi.fn();
    render(<TenantListPanel {...defaultProps({ onCreateTenant })} />);
    fireEvent.click(screen.getByText("Create Tenant"));
    expect(onCreateTenant).toHaveBeenCalledOnce();
  });

  it("shows total count in header (plural)", () => {
    render(<TenantListPanel {...defaultProps()} />);
    expect(screen.getByText("3 tenants total")).toBeDefined();
  });

  it("shows singular 'tenant' for total of 1", () => {
    render(
      <TenantListPanel {...defaultProps({ pagination: { page: 1, pageSize: 10, total: 1 } })} />,
    );
    expect(screen.getByText("1 tenant total")).toBeDefined();
  });

  it("calls onSelectTenant when row clicked", () => {
    const onSelectTenant = vi.fn();
    render(<TenantListPanel {...defaultProps({ onSelectTenant })} />);
    fireEvent.click(screen.getByTestId("row-t-1"));
    expect(onSelectTenant).toHaveBeenCalledWith("t-1");
  });
});

describe("TenantListPanel - column cells", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders name cell", () => {
    render(<TenantListPanel {...defaultProps()} />);
    expect(screen.getAllByText("Tenant One").length).toBeGreaterThanOrEqual(1);
  });

  it("renders slug cell", () => {
    render(<TenantListPanel {...defaultProps()} />);
    expect(screen.getAllByText("tenant-one").length).toBeGreaterThanOrEqual(1);
  });

  it("renders active status badge", () => {
    render(<TenantListPanel {...defaultProps()} />);
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
  });

  it("renders suspended status badge", () => {
    render(<TenantListPanel {...defaultProps()} />);
    expect(screen.getAllByText("Suspended").length).toBeGreaterThanOrEqual(1);
  });

  it("renders archived status badge", () => {
    render(<TenantListPanel {...defaultProps()} />);
    expect(screen.getAllByText("Archived").length).toBeGreaterThanOrEqual(1);
  });

  it("renders timezone cell", () => {
    render(<TenantListPanel {...defaultProps()} />);
    expect(screen.getByText("Asia/Jakarta")).toBeDefined();
  });

  it("renders accountCount cell", () => {
    render(<TenantListPanel {...defaultProps()} />);
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
  });

  it("renders formatted createdAt date", () => {
    render(<TenantListPanel {...defaultProps()} />);
    expect(screen.getAllByText("Jan 15, 2024").length).toBeGreaterThanOrEqual(1);
  });
});

describe("TenantListPanel - pagination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls onPageChange with next page via function updater", () => {
    const onPageChange = vi.fn();
    render(
      <TenantListPanel
        {...defaultProps({ onPageChange, pagination: { page: 1, pageSize: 10, total: 30 } })}
      />,
    );
    fireEvent.click(screen.getByTestId("next-page"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange with direct page object updater", () => {
    const onPageChange = vi.fn();
    render(<TenantListPanel {...defaultProps({ onPageChange })} />);
    fireEvent.click(screen.getByTestId("direct-page"));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});

describe("TenantListPanel - renderMobileItem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders mobile item with tenant name", () => {
    render(<TenantListPanel {...defaultProps()} />);
    const names = screen.getAllByText("Tenant One");
    expect(names.length).toBeGreaterThanOrEqual(1);
  });

  it("renders mobile item with slug", () => {
    render(<TenantListPanel {...defaultProps()} />);
    const slugs = screen.getAllByText("tenant-one");
    expect(slugs.length).toBeGreaterThanOrEqual(1);
  });

  it("renders mobile item with account count", () => {
    render(<TenantListPanel {...defaultProps()} />);
    expect(screen.getByText("3 accounts")).toBeDefined();
  });

  it("renders mobile item with formatted date", () => {
    render(<TenantListPanel {...defaultProps()} />);
    const dates = screen.getAllByText("Jan 15, 2024");
    expect(dates.length).toBeGreaterThanOrEqual(1);
  });

  it("renders mobile status badge for active tenant", () => {
    render(<TenantListPanel {...defaultProps()} />);
    const activeBadges = screen.getAllByText("Active");
    expect(activeBadges.length).toBeGreaterThanOrEqual(1);
  });
});

describe("TenantListPanel - formatDate edge case", () => {
  beforeEach(() => vi.clearAllMocks());

  it("falls back to raw string for invalid date", () => {
    const withBadDate = [{ ...tenants[0], tenantId: "t-bad", createdAt: "not-a-date" }];
    render(<TenantListPanel {...defaultProps({ tenants: withBadDate })} />);
    // appears in column cell + mobile item
    expect(screen.getAllByText("not-a-date").length).toBeGreaterThanOrEqual(1);
  });
});
