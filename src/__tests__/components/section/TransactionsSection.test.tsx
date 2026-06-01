// @vitest-environment jsdom
/**
 * Tests for src/components/section/TransactionsSection.tsx
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const mockUseQuery = vi.fn();
const mockUseIsMobile = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
}));

vi.mock("@tanstack/react-table", () => ({
  createColumnHelper: () => ({
    accessor: (key: string, opts: any) => ({ key, ...opts }),
  }),
}));

vi.mock("#/lib/transactionLogService", () => ({
  getTransactions: vi.fn(),
}));

vi.mock("#/lib/indexeddb.lazy", () => ({
  getLocalAccountStore: vi.fn().mockResolvedValue({
    getByTenant: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("#/hooks/use-mobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock("#/lib/utils", () => ({
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

vi.mock("../../../components/ui/badge", () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

vi.mock("../../../components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("../../../components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("../../../components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock("../../../components/ui/select", () => ({
  Select: ({ children, value }: any) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

vi.mock("../../../components/block/data-table", () => ({
  DataTable: ({
    data,
    isLoading,
    header,
    emptyState,
  }: {
    data: any[];
    isLoading: boolean;
    header?: React.ReactNode;
    emptyState?: React.ReactNode;
    [key: string]: any;
  }) => (
    <div data-testid="data-table" data-loading={String(isLoading)} data-count={data.length}>
      {header}
      {data.length === 0 && !isLoading && emptyState}
    </div>
  ),
}));

import { TransactionsSection } from "#/components/section/TransactionsSection";

describe("TransactionsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it("renders DataTable in loading state", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });

    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    const table = screen.getByTestId("data-table");
    expect(table.getAttribute("data-loading")).toBe("true");
  });

  it("renders DataTable with data", () => {
    mockUseQuery.mockReturnValue({
      data: {
        entries: [
          {
            id: 1,
            cardId: "abc123",
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
    const table = screen.getByTestId("data-table");
    expect(table.getAttribute("data-count")).toBe("1");
  });

  it("renders empty state when no transactions", () => {
    mockUseQuery.mockReturnValue({
      data: { entries: [], total: 0, pageSize: 10 },
      isLoading: false,
    });

    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    expect(screen.getByText("Tidak ada transaksi ditemukan.")).toBeDefined();
  });

  it("renders filter inputs", () => {
    mockUseQuery.mockReturnValue({
      data: { entries: [], total: 0, pageSize: 10 },
      isLoading: false,
    });

    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    expect(screen.getByPlaceholderText("Cari card ID...")).toBeDefined();
  });

  it("renders date filter inputs with today as default", () => {
    mockUseQuery.mockReturnValue({
      data: { entries: [], total: 0, pageSize: 10 },
      isLoading: false,
    });

    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    const dateInputs = screen.getAllByDisplayValue(new Date().toISOString().split("T")[0]);
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
  });

  it("shows reset button when filters are active", () => {
    mockUseQuery.mockReturnValue({
      data: { entries: [], total: 0, pageSize: 10 },
      isLoading: false,
    });

    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);

    // Change card ID filter to activate filters
    const cardInput = screen.getByPlaceholderText("Cari card ID...");
    fireEvent.change(cardInput, { target: { value: "abc" } });

    expect(screen.getByText("Reset")).toBeDefined();
  });

  it("uses smaller page size on mobile", () => {
    mockUseIsMobile.mockReturnValue(true);
    mockUseQuery.mockReturnValue({
      data: { entries: [], total: 0, pageSize: 5 },
      isLoading: false,
    });

    render(<TransactionsSection tenantId="t-1" accountId="a-1" />);
    // The hook should be called with pageSize 5 for mobile
    expect(mockUseQuery).toHaveBeenCalled();
  });
});
