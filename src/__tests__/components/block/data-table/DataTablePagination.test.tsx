// @vitest-environment jsdom
/**
 * Tests for src/components/block/data-table/DataTablePagination.tsx
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

vi.mock("#/components/ui/button.tsx", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

vi.mock("#/components/ui/select.tsx", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="page-size-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    size?: string;
    className?: string;
  }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode; align?: string }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock("lucide-react", () => ({
  ChevronLeft: () => <span>{"<"}</span>,
  ChevronRight: () => <span>{">"}</span>,
  ChevronsLeft: () => <span>{"<<"}</span>,
  ChevronsRight: () => <span>{">>"}</span>,
}));

import { DataTablePagination } from "#/components/block/data-table/DataTablePagination";
import type { Table } from "@tanstack/react-table";

function makeTable(
  overrides: Partial<{
    pageIndex: number;
    pageSize: number;
    pageCount: number;
    canPrev: boolean;
    canNext: boolean;
    rowCount: number;
  }> = {},
): Table<unknown> {
  const {
    pageIndex = 0,
    pageSize = 10,
    pageCount = 3,
    canPrev = false,
    canNext = true,
    rowCount = 25,
  } = overrides;
  return {
    getState: () => ({ pagination: { pageIndex, pageSize } }),
    getPageCount: () => pageCount,
    getFilteredRowModel: () => ({ rows: Array(rowCount).fill({}) }),
    getCanPreviousPage: () => canPrev,
    getCanNextPage: () => canNext,
    setPageIndex: vi.fn(),
    setPageSize: vi.fn(),
    previousPage: vi.fn(),
    nextPage: vi.fn(),
  } as unknown as Table<unknown>;
}

describe("DataTablePagination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders page info text", () => {
    const table = makeTable({ pageIndex: 0, pageSize: 10, rowCount: 25 });
    render(<DataTablePagination table={table} />);
    expect(screen.getByText("1–10 dari 25")).toBeDefined();
  });

  it("renders '0 items' when no rows", () => {
    const table = makeTable({ rowCount: 0, canNext: false });
    render(<DataTablePagination table={table} />);
    expect(screen.getByText("0 items")).toBeDefined();
  });

  it("renders page indicator", () => {
    const table = makeTable({ pageIndex: 1, pageCount: 3 });
    render(<DataTablePagination table={table} />);
    expect(screen.getByText("2/3")).toBeDefined();
  });

  it("disables first/prev buttons on first page", () => {
    const table = makeTable({ canPrev: false });
    render(<DataTablePagination table={table} />);
    expect((screen.getByRole("button", { name: "First page" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("disables next/last buttons on last page", () => {
    const table = makeTable({ canNext: false });
    render(<DataTablePagination table={table} />);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: "Last page" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("calls nextPage when next button clicked", () => {
    const table = makeTable({ canNext: true });
    render(<DataTablePagination table={table} />);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(table.nextPage).toHaveBeenCalledOnce();
  });

  it("calls previousPage when prev button clicked", () => {
    const table = makeTable({ canPrev: true });
    render(<DataTablePagination table={table} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(table.previousPage).toHaveBeenCalledOnce();
  });

  it("calls setPageIndex(0) when first button clicked", () => {
    const table = makeTable({ canPrev: true });
    render(<DataTablePagination table={table} />);
    fireEvent.click(screen.getByRole("button", { name: "First page" }));
    expect(table.setPageIndex).toHaveBeenCalledWith(0);
  });

  it("calls setPageIndex(pageCount-1) when last button clicked", () => {
    const table = makeTable({ canNext: true, pageCount: 5 });
    render(<DataTablePagination table={table} />);
    fireEvent.click(screen.getByRole("button", { name: "Last page" }));
    expect(table.setPageIndex).toHaveBeenCalledWith(4);
  });

  it("uses totalItems prop when provided", () => {
    const table = makeTable({ pageIndex: 0, pageSize: 10 });
    render(<DataTablePagination table={table} totalItems={100} />);
    expect(screen.getByText("1–10 dari 100")).toBeDefined();
  });
});
