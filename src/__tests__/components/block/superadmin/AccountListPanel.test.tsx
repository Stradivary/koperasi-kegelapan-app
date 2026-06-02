// @vitest-environment jsdom
/**
 * Tests for src/components/block/superadmin/AccountListPanel.tsx
 * Covers: rendering, header, loading/error/empty states, column cells,
 *         action buttons (changePassword, toggleStatus), pagination,
 *         renderMobileItem, formatDate, STATUS_STYLES, ROLE_STYLES.
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
    emptyState,
    emptySearchState,
    columns,
    onPaginationChange,
    serverPagination,
    renderMobileItem,
  }: {
    data: {
      accountId: string;
      username: string;
      role: string;
      status: string;
      tenantName: string;
      tenantSlug: string;
      createdAt: string;
    }[];
    isLoading?: boolean;
    error?: string | null;
    header?: React.ReactNode;
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
      {/* Render column cells for each row so we can test them */}
      {data.map((row) => (
        <div key={row.accountId} data-testid={`row-${row.accountId}`}>
          {columns?.map((col, i) => {
            const info = {
              getValue: () => {
                if (col.accessorKey) return (row as Record<string, unknown>)[col.accessorKey];
                return undefined;
              },
              row: { original: row },
            };
            return (
              <span
                key={col.id ?? col.accessorKey ?? i}
                data-testid={`cell-${col.accessorKey ?? col.id ?? i}-${row.accountId}`}
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
    title,
  }: {
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    title?: string;
    size?: string;
    variant?: string;
    className?: string;
  }) => (
    <button onClick={onClick} title={title}>
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
  Key: () => <span data-testid="icon-key" />,
  Plus: () => <span data-testid="icon-plus" />,
  Search: () => <span data-testid="icon-search" />,
  Shield: () => <span data-testid="icon-shield" />,
  UserCog: () => <span data-testid="icon-usercog" />,
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import {
  AccountListPanel,
  type AccountListItem,
} from "#/presentation/components/block/superadmin/AccountListPanel";

// ─── fixtures ────────────────────────────────────────────────────────────────

const accounts: AccountListItem[] = [
  {
    accountId: "a-1",
    tenantId: "t-1",
    tenantName: "Tenant One",
    tenantSlug: "tenant-one",
    username: "admin1",
    role: "admin",
    status: "active",
    createdAt: "2024-01-15T00:00:00Z",
  },
  {
    accountId: "a-2",
    tenantId: "t-1",
    tenantName: "Tenant One",
    tenantSlug: "tenant-one",
    username: "station1",
    role: "station",
    status: "suspended",
    createdAt: "2024-02-01T00:00:00Z",
  },
];

function defaultProps(overrides = {}) {
  return {
    accounts,
    isLoading: false,
    error: null,
    searchQuery: "",
    onSearchChange: vi.fn(),
    onCreateAccount: vi.fn(),
    onChangePassword: vi.fn(),
    onToggleStatus: vi.fn(),
    pagination: { page: 1, pageSize: 10, total: 2 },
    onPageChange: vi.fn(),
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("AccountListPanel - rendering", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders account rows", () => {
    render(<AccountListPanel {...defaultProps()} />);
    expect(screen.getByTestId("row-a-1")).toBeDefined();
    expect(screen.getByTestId("row-a-2")).toBeDefined();
  });

  it("shows loading state", () => {
    render(<AccountListPanel {...defaultProps({ isLoading: true })} />);
    expect(screen.getByTestId("loading")).toBeDefined();
  });

  it("shows error state", () => {
    render(<AccountListPanel {...defaultProps({ error: "Load failed" })} />);
    expect(screen.getByText("Load failed")).toBeDefined();
  });

  it("shows empty state when no accounts", () => {
    render(<AccountListPanel {...defaultProps({ accounts: [] })} />);
    expect(screen.getByText("No accounts found")).toBeDefined();
  });

  it("shows emptySearchState", () => {
    render(<AccountListPanel {...defaultProps()} />);
    expect(screen.getByText("No accounts match your search")).toBeDefined();
  });

  it("calls onCreateAccount when Create Account clicked", () => {
    const onCreateAccount = vi.fn();
    render(<AccountListPanel {...defaultProps({ onCreateAccount })} />);
    fireEvent.click(screen.getByText("Create Account"));
    expect(onCreateAccount).toHaveBeenCalledOnce();
  });

  it("shows total count in header (plural)", () => {
    render(<AccountListPanel {...defaultProps()} />);
    expect(screen.getByText("2 accounts total")).toBeDefined();
  });

  it("shows singular 'account' for total of 1", () => {
    render(
      <AccountListPanel {...defaultProps({ pagination: { page: 1, pageSize: 10, total: 1 } })} />,
    );
    expect(screen.getByText("1 account total")).toBeDefined();
  });
});

describe("AccountListPanel - column cells", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders username cell", () => {
    render(<AccountListPanel {...defaultProps()} />);
    expect(screen.getAllByText("admin1").length).toBeGreaterThanOrEqual(1);
  });

  it("renders role badge for known role (admin)", () => {
    render(<AccountListPanel {...defaultProps()} />);
    expect(screen.getAllByText("admin").length).toBeGreaterThanOrEqual(1);
  });

  it("renders role badge for unknown role falls back gracefully", () => {
    const withUnknownRole = [{ ...accounts[0], accountId: "a-x", role: "unknown-role" }];
    render(<AccountListPanel {...defaultProps({ accounts: withUnknownRole })} />);
    expect(screen.getAllByText("unknown-role").length).toBeGreaterThanOrEqual(1);
  });

  it("renders tenant name and slug in tenant cell", () => {
    render(<AccountListPanel {...defaultProps()} />);
    expect(screen.getAllByText("Tenant One").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("tenant-one").length).toBeGreaterThanOrEqual(1);
  });

  it("renders status badge for active account", () => {
    render(<AccountListPanel {...defaultProps()} />);
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
  });

  it("renders status badge for suspended account", () => {
    render(<AccountListPanel {...defaultProps()} />);
    expect(screen.getAllByText("Suspended").length).toBeGreaterThanOrEqual(1);
  });

  it("renders status badge for unknown status falls back to raw value", () => {
    const withUnknownStatus = [{ ...accounts[0], accountId: "a-y", status: "unknown-status" }];
    render(<AccountListPanel {...defaultProps({ accounts: withUnknownStatus })} />);
    expect(screen.getAllByText("unknown-status").length).toBeGreaterThanOrEqual(1);
  });

  it("renders formatted date in createdAt cell", () => {
    render(<AccountListPanel {...defaultProps()} />);
    expect(screen.getByText("Jan 15, 2024")).toBeDefined();
  });
});

describe("AccountListPanel - action buttons", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls onChangePassword when key button clicked", () => {
    const onChangePassword = vi.fn();
    render(<AccountListPanel {...defaultProps({ onChangePassword })} />);
    fireEvent.click(screen.getAllByTitle("Change password")[0]);
    expect(onChangePassword).toHaveBeenCalledWith(accounts[0]);
  });

  it("calls onToggleStatus when shield/suspend button clicked on active account", () => {
    const onToggleStatus = vi.fn();
    render(<AccountListPanel {...defaultProps({ onToggleStatus })} />);
    fireEvent.click(screen.getAllByTitle("Suspend account")[0]);
    expect(onToggleStatus).toHaveBeenCalledWith(accounts[0]);
  });

  it("calls onToggleStatus when activate button clicked on suspended account", () => {
    const onToggleStatus = vi.fn();
    render(<AccountListPanel {...defaultProps({ onToggleStatus })} />);
    fireEvent.click(screen.getAllByTitle("Activate account")[0]);
    expect(onToggleStatus).toHaveBeenCalledWith(accounts[1]);
  });
});

describe("AccountListPanel - pagination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls onPageChange with next page via function updater", () => {
    const onPageChange = vi.fn();
    render(
      <AccountListPanel
        {...defaultProps({ onPageChange, pagination: { page: 1, pageSize: 10, total: 20 } })}
      />,
    );
    fireEvent.click(screen.getByTestId("next-page"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange with direct page object updater", () => {
    const onPageChange = vi.fn();
    render(<AccountListPanel {...defaultProps({ onPageChange })} />);
    fireEvent.click(screen.getByTestId("direct-page"));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});

describe("AccountListPanel - renderMobileItem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders mobile item with username and status badge", () => {
    render(<AccountListPanel {...defaultProps()} />);
    // username appears in mobile item too
    const usernames = screen.getAllByText("admin1");
    expect(usernames.length).toBeGreaterThanOrEqual(1);
  });

  it("renders mobile Password button and calls onChangePassword", () => {
    const onChangePassword = vi.fn();
    render(<AccountListPanel {...defaultProps({ onChangePassword })} />);
    const passwordBtns = screen.getAllByText("Password");
    fireEvent.click(passwordBtns[0]);
    expect(onChangePassword).toHaveBeenCalledWith(accounts[0]);
  });

  it("renders mobile Suspend button for active account and calls onToggleStatus", () => {
    const onToggleStatus = vi.fn();
    render(<AccountListPanel {...defaultProps({ onToggleStatus })} />);
    const suspendBtns = screen.getAllByText("Suspend");
    fireEvent.click(suspendBtns[0]);
    expect(onToggleStatus).toHaveBeenCalledWith(accounts[0]);
  });

  it("renders mobile Activate button for suspended account and calls onToggleStatus", () => {
    const onToggleStatus = vi.fn();
    render(<AccountListPanel {...defaultProps({ onToggleStatus })} />);
    const activateBtns = screen.getAllByText("Activate");
    fireEvent.click(activateBtns[0]);
    expect(onToggleStatus).toHaveBeenCalledWith(accounts[1]);
  });
});

describe("AccountListPanel - formatDate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("falls back to raw string for invalid date", () => {
    const withBadDate = [{ ...accounts[0], accountId: "a-bad", createdAt: "not-a-date" }];
    render(<AccountListPanel {...defaultProps({ accounts: withBadDate })} />);
    expect(screen.getByText("not-a-date")).toBeDefined();
  });
});
