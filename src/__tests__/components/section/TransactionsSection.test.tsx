// @vitest-environment jsdom
/**
 * Tests for src/components/section/TransactionsSection.tsx
 * Covers: loading, data, empty state, filters (card ID, type, date),
 *         reset filters, pagination, mobile layout, emptySearchState.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const mockUseQuery = vi.fn();
const mockUseIsMobile = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

vi.mock("@tanstack/react-table", () => ({
  createColumnHelper: () => ({
    accessor: (key: string, opts: unknown) => ({ key, ...(opts as object) }),
    display: (opts: unknown) => opts,
  }),
}));

vi.mock("#/presentation/hooks/useTransactionLog", () => ({
  getTransactions: vi.fn().mockResolvedValue({ entries: [], total: 0, pageSize: 10 }),
}));

vi.mock("#/presentation/hooks/useIndexedDbStores", () => ({
  getLocalAccountStore: vi.fn().mockResolvedValue({
    getByTenant: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("#/presentation/hooks/use-mobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock("#/presentation/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
  ArrowDownLeft: () => <span data-testid="icon-arrow-down-left" />,
  ArrowUpRight: () => <span data-testid="icon-arrow-up-right" />,
  CheckCircle2: () => <span data-testid="icon-check" />,
  Clock: () => <span data-testid="icon-clock" />,
  AlertCircle: () => <span data-testid="icon-alert" />,
  X: () => <span data-testid="icon-x" />,
  Receipt: () => <span data-testid="icon-receipt" />,
}));

vi.mock("#/presentation/components/ui/badge", () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

vi.mock("#/presentation/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    variant,
    size: _sz,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock("#/presentation/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("#/presentation/components/ui/label", () => ({
  Label: ({
    children,
    htmlFor,
  }: {
    children: React.ReactNode;
    htmlFor?: string;
    className?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("#/presentation/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <div data-testid="select" data-value={value}>
      <select value={value} onChange={(e) => onValueChange?.(e.target.value)}>
        {children}
      </select>
    </div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({
    children,
    id,
  }: {
    children: React.ReactNode;
    id?: string;
    size?: string;
    className?: string;
  }) => <div id={id}>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("#/presentation/components/block/data-table", () => ({
  DataTable: ({
    data,
    isLoading,
    header,
    emptyState,
    emptySearchState,
    onPaginationChange,
    serverPagination,
  }: {
    data: unknown[];
    isLoading: boolean;
    header?: React.ReactNode;
    emptyState?: React.ReactNode;
    emptySearchState?: React.ReactNode;
    onPaginationChange?: (u: unknown) => void;
    serverPagination?: {
      pageIndex: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
    [key: string]: unknown;
  }) => (
    <div
      data-testid="data-table"
      data-loading={String(isLoading)}
      data-count={data.length}
      data-page={serverPagination?.pageIndex}
      data-total={serverPagination?.totalItems}
    >
      {header}
      {data.length === 0 && !isLoading && emptyState}
      {emptySearchState && <div data-testid="empty-search-state">{emptySearchState}</div>}
      <button
        data-testid="next-page-btn"
        onClick={() =>
          onPaginationChange?.({
            pageIndex: (serverPagination?.pageIndex ?? 0) + 1,
            pageSize: serverPagination?.pageSize ?? 10,
          })
        }
      >
        Next
      </button>
    </div>
  ),
}));

import { TransactionsSection } from "#/presentation/components/section/TransactionsSection";

const today = (() => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
})();

describe("TransactionsSection - loading and data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it("renders DataTable in loading state", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    expect(screen.getByTestId("data-table").getAttribute("data-loading")).toBe("true");
  });

  it("renders DataTable with entries", () => {
    mockUseQuery.mockReturnValue({
      data: {
        entries: [
          {
            id: 1,
            cardId: "abc",
            type: "debit",
            amount: 5000,
            balanceAfter: 45000,
            timestamp: 1700000000,
            syncStatus: "synced",
            operatorName: "admin",
          },
        ],
        total: 1,
        pageSize: 10,
      },
      isLoading: false,
    });
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    expect(screen.getByTestId("data-table").getAttribute("data-count")).toBe("1");
  });

  it("renders empty state when no transactions", () => {
    mockUseQuery.mockReturnValue({
      data: { entries: [], total: 0, pageSize: 10 },
      isLoading: false,
    });
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    expect(screen.getByText("Tidak ada transaksi ditemukan.")).toBeDefined();
  });

  it("renders emptySearchState element", () => {
    mockUseQuery.mockReturnValue({
      data: { entries: [], total: 0, pageSize: 10 },
      isLoading: false,
    });
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    expect(screen.getByTestId("empty-search-state")).toBeDefined();
  });
});

describe("TransactionsSection - filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
    mockUseQuery.mockReturnValue({
      data: { entries: [], total: 0, pageSize: 10 },
      isLoading: false,
    });
  });

  it("renders card ID filter input", () => {
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    expect(screen.getByPlaceholderText("Cari card ID...")).toBeDefined();
  });

  it("renders date filter inputs with today as default", () => {
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    const dateInputs = screen.getAllByDisplayValue(today);
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
  });

  it("shows Reset button when card ID filter is active", () => {
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    fireEvent.change(screen.getByPlaceholderText("Cari card ID..."), { target: { value: "abc" } });
    expect(screen.getByText("Reset")).toBeDefined();
  });

  it("does not show Reset button when no filters active", () => {
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    expect(screen.queryByText("Reset")).toBeNull();
  });

  it("clears filters when Reset clicked", () => {
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    const cardInput = screen.getByPlaceholderText("Cari card ID...") as HTMLInputElement;
    fireEvent.change(cardInput, { target: { value: "abc" } });
    fireEvent.click(screen.getByText("Reset"));
    expect(cardInput.value).toBe("");
  });

  it("shows Reset when date filter differs from today", () => {
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    const dateInputs = screen.getAllByDisplayValue(today);
    fireEvent.change(dateInputs[0], { target: { value: "2024-01-01" } });
    expect(screen.getByText("Reset")).toBeDefined();
  });

  it("shows Reset when type filter is active", () => {
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    const select = screen.getByTestId("select").querySelector("select")!;
    fireEvent.change(select, { target: { value: "topup" } });
    expect(screen.getByText("Reset")).toBeDefined();
  });

  it("clears type filter when Reset clicked", () => {
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    const select = screen.getByTestId("select").querySelector("select")!;
    fireEvent.change(select, { target: { value: "topup" } });
    fireEvent.click(screen.getByText("Reset"));
    expect(select.value).toBe("all");
  });

  it("resets to page 1 when card ID filter changes", () => {
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    // Advance to page 2 first
    fireEvent.click(screen.getByTestId("next-page-btn"));
    // Then change filter — should reset page
    fireEvent.change(screen.getByPlaceholderText("Cari card ID..."), { target: { value: "x" } });
    expect(screen.getByTestId("data-table").getAttribute("data-page")).toBe("0");
  });
});

describe("TransactionsSection - mobile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses smaller page size on mobile", () => {
    mockUseIsMobile.mockReturnValue(true);
    mockUseQuery.mockReturnValue({
      data: { entries: [], total: 0, pageSize: 5 },
      isLoading: false,
    });
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    // useQuery should be called with pageSize 5
    const callArgs = mockUseQuery.mock.calls[0][0] as { queryKey: unknown[] };
    expect(callArgs.queryKey).toContain(5);
  });
});

describe("TransactionsSection - pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it("advances page when next page triggered", () => {
    mockUseQuery.mockReturnValue({
      data: { entries: [], total: 30, pageSize: 10 },
      isLoading: false,
    });
    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    fireEvent.click(screen.getByTestId("next-page-btn"));
    // After clicking next, page should be 2 (pageIndex=1)
    expect(screen.getByTestId("data-table").getAttribute("data-page")).toBe("1");
  });
});
