// @vitest-environment jsdom
/**
 * Tests for useDataTable hook
 * Covers: client pagination, server pagination, sorting, page size changes
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDataTable } from "../useDataTable";
import type { ColumnDef } from "@tanstack/react-table";

interface TestRow {
  id: string;
  name: string;
  value: number;
}

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "value", header: "Value" },
];

function makeData(count: number): TestRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`,
    name: `Item ${i}`,
    value: i * 10,
  }));
}

describe("useDataTable — client pagination", () => {
  it("returns a table instance with correct row count", () => {
    const data = makeData(25);
    const { result } = renderHook(() => useDataTable({ data, columns, pageSize: 10 }));
    expect(result.current.table.getRowModel().rows.length).toBe(10);
    expect(result.current.pageCount).toBe(3);
  });

  it("defaults to page 0", () => {
    const { result } = renderHook(() =>
      useDataTable({ data: makeData(20), columns, pageSize: 10 }),
    );
    expect(result.current.pagination.pageIndex).toBe(0);
  });

  it("uses provided pageSize", () => {
    const { result } = renderHook(() => useDataTable({ data: makeData(20), columns, pageSize: 5 }));
    expect(result.current.pagination.pageSize).toBe(5);
    expect(result.current.table.getRowModel().rows.length).toBe(5);
  });

  it("resets to page 0 when pageSize changes", () => {
    const { result, rerender } = renderHook(
      ({ pageSize }) => useDataTable({ data: makeData(20), columns, pageSize }),
      { initialProps: { pageSize: 10 } },
    );
    // Navigate to page 1
    act(() => {
      result.current.table.nextPage();
    });
    expect(result.current.pagination.pageIndex).toBe(1);
    // Change page size
    rerender({ pageSize: 5 });
    expect(result.current.pagination.pageIndex).toBe(0);
  });

  it("supports global filter", () => {
    const data = [
      { id: "1", name: "Apple", value: 10 },
      { id: "2", name: "Banana", value: 20 },
      { id: "3", name: "Cherry", value: 30 },
    ];
    const { result } = renderHook(() =>
      useDataTable({ data, columns, pageSize: 10, globalFilter: "Banana" }),
    );
    expect(result.current.table.getFilteredRowModel().rows.length).toBe(1);
  });

  it("supports sorting", () => {
    const data = [
      { id: "1", name: "Banana", value: 20 },
      { id: "2", name: "Apple", value: 10 },
    ];
    const { result } = renderHook(() =>
      useDataTable({ data, columns, pageSize: 10, sorting: [{ id: "name", desc: false }] }),
    );
    const rows = result.current.table.getRowModel().rows;
    expect(rows[0].original.name).toBe("Apple");
    expect(rows[1].original.name).toBe("Banana");
  });

  it("calls onSortingChange when sorting changes", () => {
    const onSortingChange = vi.fn();
    const { result } = renderHook(() =>
      useDataTable({ data: makeData(5), columns, pageSize: 10, onSortingChange }),
    );
    act(() => {
      result.current.table.getColumn("name")?.toggleSorting(false);
    });
    expect(onSortingChange).toHaveBeenCalled();
  });

  it("calls onPaginationChange when pagination changes", () => {
    const onPaginationChange = vi.fn();
    const { result } = renderHook(() =>
      useDataTable({ data: makeData(20), columns, pageSize: 10, onPaginationChange }),
    );
    act(() => {
      result.current.table.nextPage();
    });
    expect(onPaginationChange).toHaveBeenCalled();
  });

  it("supports custom getRowId", () => {
    const data = makeData(3);
    const { result } = renderHook(() =>
      useDataTable({ data, columns, pageSize: 10, getRowId: (row) => row.id }),
    );
    expect(result.current.table.getRow("row-0")).toBeDefined();
  });

  it("disables sorting when enableSorting=false", () => {
    const { result } = renderHook(() =>
      useDataTable({ data: makeData(5), columns, pageSize: 10, enableSorting: false }),
    );
    expect(result.current.table.getState().sorting).toEqual([]);
  });
});

describe("useDataTable — server pagination", () => {
  it("uses serverPagination values when paginationMode=server", () => {
    const { result } = renderHook(() =>
      useDataTable({
        data: makeData(10),
        columns,
        paginationMode: "server",
        serverPagination: { pageIndex: 2, pageSize: 10, totalItems: 50, totalPages: 5 },
      }),
    );
    expect(result.current.pagination.pageIndex).toBe(2);
    expect(result.current.pagination.pageSize).toBe(10);
    expect(result.current.pageCount).toBe(5);
  });

  it("does not reset page on pageSize change in server mode", () => {
    const { result, rerender } = renderHook(
      ({ pageSize }) =>
        useDataTable({
          data: makeData(10),
          columns,
          paginationMode: "server",
          serverPagination: { pageIndex: 3, pageSize, totalItems: 100, totalPages: 10 },
          pageSize,
        }),
      { initialProps: { pageSize: 10 } },
    );
    rerender({ pageSize: 20 });
    // Server mode — pageIndex comes from serverPagination, not internal state
    expect(result.current.pagination.pageIndex).toBe(3);
  });
});
