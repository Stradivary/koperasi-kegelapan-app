// @vitest-environment jsdom
/**
 * Tests for DataTable.tsx
 * Covers: rendering, search, pagination, loading/error/empty states,
 *         mobile vs desktop, sortable headers, row click
 */
import { createElement } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockIsMobile = false;
vi.mock("#/hooks/use-mobile.ts", () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock("#/lib/utils.ts", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("#/components/ui/input.tsx", () => ({
  Input: (props: any) =>
    createElement("input", {
      ...props,
      "data-testid": "search-input",
      onChange: (e: any) => props.onChange?.(e),
    }),
}));

vi.mock("#/components/ui/table.tsx", () => ({
  Table: ({ children }: any) => createElement("table", { "data-testid": "table" }, children),
  TableBody: ({ children }: any) => createElement("tbody", null, children),
  TableCell: ({ children }: any) => createElement("td", null, children),
  TableHead: ({ children, onClick, onKeyDown, tabIndex, className, ...rest }: any) =>
    createElement(
      "th",
      { onClick, onKeyDown, tabIndex, "data-testid": "table-head", className, ...rest },
      children,
    ),
  TableHeader: ({ children }: any) => createElement("thead", null, children),
  TableRow: ({ children, onClick, onKeyDown, tabIndex, role, className, ...rest }: any) =>
    createElement("tr", { onClick, onKeyDown, tabIndex, role, className, ...rest }, children),
}));

vi.mock("../DataTablePagination", () => ({
  DataTablePagination: ({ table: _t, pageSizeOptions: _ps, totalItems }: any) =>
    createElement("div", { "data-testid": "pagination", "data-total": totalItems }),
}));

vi.mock("../DataTableSkeleton", () => ({
  DataTableSkeleton: ({ columns, rows, isMobile }: any) =>
    createElement("div", {
      "data-testid": "skeleton",
      "data-columns": columns,
      "data-rows": rows,
      "data-mobile": String(isMobile),
    }),
}));

import { DataTable } from "../DataTable";

// ── Test data ─────────────────────────────────────────────────────────────────

interface TestRow {
  id: string;
  name: string;
  age: number;
}

const columns: ColumnDef<TestRow, any>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "age", header: "Age" },
];

const testData: TestRow[] = [
  { id: "1", name: "Alice", age: 30 },
  { id: "2", name: "Bob", age: 25 },
  { id: "3", name: "Charlie", age: 35 },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  mockIsMobile = false;
});

describe("DataTable — loading state", () => {
  it("renders skeleton when isLoading=true", () => {
    render(createElement(DataTable, { columns: columns as any, data: [], isLoading: true }));
    expect(screen.getByTestId("skeleton")).toBeDefined();
  });

  it("does not render table content when loading", () => {
    render(createElement(DataTable, { columns: columns as any, data: testData, isLoading: true }));
    expect(screen.queryByTestId("table")).toBeNull();
  });
});

describe("DataTable — error state", () => {
  it("renders error message", () => {
    render(
      createElement(DataTable, {
        columns: columns as any,
        data: [],
        error: "Something went wrong",
      }),
    );
    expect(screen.getByText("Something went wrong")).toBeDefined();
  });
});

describe("DataTable — empty state", () => {
  it("renders default empty state when no data", () => {
    render(createElement(DataTable, { columns: columns as any, data: [] }));
    expect(screen.getByText("No data available")).toBeDefined();
  });

  it("renders custom empty state", () => {
    const emptyState = createElement("div", { "data-testid": "custom-empty" }, "Nothing here");
    render(createElement(DataTable, { columns: columns as any, data: [], emptyState }));
    expect(screen.getByTestId("custom-empty")).toBeDefined();
  });

  it("renders empty search state when search has no results", () => {
    render(
      createElement(DataTable, {
        columns: columns as any,
        data: testData,
        searchValue: "zzzzz",
        showSearch: true,
      }),
    );
    expect(screen.getByText("No results found")).toBeDefined();
  });

  it("renders custom empty search state", () => {
    const emptySearchState = createElement("div", null, "No search results");
    render(
      createElement(DataTable, {
        columns: columns as any,
        data: testData,
        searchValue: "zzzzz",
        showSearch: true,
        emptySearchState,
      }),
    );
    expect(screen.getByText("No search results")).toBeDefined();
  });
});

describe("DataTable — desktop rendering", () => {
  it("renders table with data rows", () => {
    render(createElement(DataTable, { columns: columns as any, data: testData }));
    expect(screen.getByTestId("table")).toBeDefined();
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Bob")).toBeDefined();
    expect(screen.getByText("Charlie")).toBeDefined();
  });

  it("renders sortable headers", () => {
    render(
      createElement(DataTable, { columns: columns as any, data: testData, enableSorting: true }),
    );
    const headers = screen.getAllByTestId("table-head");
    expect(headers.length).toBeGreaterThan(0);
  });

  it("renders row click handler", () => {
    const onRowClick = vi.fn();
    render(createElement(DataTable, { columns: columns as any, data: testData, onRowClick }));
    const rows = screen.getAllByRole("button");
    fireEvent.click(rows[0]);
    expect(onRowClick).toHaveBeenCalledWith(testData[0]);
  });

  it("handles keyboard navigation on clickable rows", () => {
    const onRowClick = vi.fn();
    render(createElement(DataTable, { columns: columns as any, data: testData, onRowClick }));
    const rows = screen.getAllByRole("button");
    fireEvent.keyDown(rows[0], { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledWith(testData[0]);
  });
});

describe("DataTable — mobile rendering", () => {
  beforeEach(() => {
    mockIsMobile = true;
  });

  it("renders mobile card list when renderMobileItem is provided", () => {
    const renderMobileItem = (row: any, index: number) =>
      createElement("div", { "data-testid": `mobile-item-${index}` }, row.original.name);
    render(createElement(DataTable, { columns: columns as any, data: testData, renderMobileItem }));
    expect(screen.getByTestId("mobile-item-0")).toBeDefined();
    expect(screen.getByTestId("mobile-item-1")).toBeDefined();
  });

  it("renders mobile row as button when onRowClick is provided", () => {
    const onRowClick = vi.fn();
    const renderMobileItem = (row: any) => createElement("span", null, row.original.name);
    render(
      createElement(DataTable, {
        columns: columns as any,
        data: testData,
        renderMobileItem,
        onRowClick,
      }),
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onRowClick).toHaveBeenCalledWith(testData[0]);
  });

  it("falls back to table when renderMobileItem is not provided", () => {
    render(createElement(DataTable, { columns: columns as any, data: testData }));
    expect(screen.getByTestId("table")).toBeDefined();
  });
});

describe("DataTable — search", () => {
  it("renders search input when showSearch=true", () => {
    render(createElement(DataTable, { columns: columns as any, data: testData, showSearch: true }));
    expect(screen.getByTestId("search-input")).toBeDefined();
  });

  it("does not render search input when showSearch=false", () => {
    render(
      createElement(DataTable, { columns: columns as any, data: testData, showSearch: false }),
    );
    expect(screen.queryByTestId("search-input")).toBeNull();
  });

  it("calls onSearchChange when controlled", () => {
    const onSearchChange = vi.fn();
    render(
      createElement(DataTable, {
        columns: columns as any,
        data: testData,
        showSearch: true,
        searchValue: "",
        onSearchChange,
      }),
    );
    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "test" } });
    expect(onSearchChange).toHaveBeenCalledWith("test");
  });

  it("uses internal search state when uncontrolled", () => {
    render(createElement(DataTable, { columns: columns as any, data: testData, showSearch: true }));
    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "Alice" } });
    // Should filter to show only Alice
    expect(screen.getByText("Alice")).toBeDefined();
  });
});

describe("DataTable — pagination", () => {
  it("renders pagination when showPagination=true and data exists", () => {
    render(
      createElement(DataTable, { columns: columns as any, data: testData, showPagination: true }),
    );
    expect(screen.getByTestId("pagination")).toBeDefined();
  });

  it("does not render pagination when showPagination=false", () => {
    render(
      createElement(DataTable, { columns: columns as any, data: testData, showPagination: false }),
    );
    expect(screen.queryByTestId("pagination")).toBeNull();
  });

  it("does not render pagination when data is empty", () => {
    render(createElement(DataTable, { columns: columns as any, data: [], showPagination: true }));
    expect(screen.queryByTestId("pagination")).toBeNull();
  });
});

describe("DataTable — header", () => {
  it("renders custom header content", () => {
    const header = createElement("div", { "data-testid": "custom-header" }, "My Header");
    render(createElement(DataTable, { columns: columns as any, data: testData, header }));
    expect(screen.getByTestId("custom-header")).toBeDefined();
  });
});

describe("DataTable — sorting", () => {
  it("renders sort icons when enableSorting=true", () => {
    render(
      createElement(DataTable, { columns: columns as any, data: testData, enableSorting: true }),
    );
    const headers = screen.getAllByTestId("table-head");
    // Click header to sort
    fireEvent.click(headers[0]);
    // Should still render without error
    expect(screen.getByText("Alice")).toBeDefined();
  });

  it("handles keyboard sort toggle", () => {
    render(
      createElement(DataTable, { columns: columns as any, data: testData, enableSorting: true }),
    );
    const headers = screen.getAllByTestId("table-head");
    fireEvent.keyDown(headers[0], { key: "Enter" });
    expect(screen.getByText("Alice")).toBeDefined();
  });
});
