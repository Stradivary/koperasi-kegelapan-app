import { useState } from "react";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { flexRender } from "@tanstack/react-table";

import { cn } from "#/lib/utils.ts";
import { useIsMobile } from "#/hooks/use-mobile.ts";
import { Input } from "#/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";

import type { DataTableProps } from "./types";
import { useDataTable } from "./useDataTable";
import { DataTablePagination } from "./DataTablePagination";
import { DataTableSkeleton } from "./DataTableSkeleton";

/**
 * Shared DataTable / DataList component.
 *
 * - Desktop: renders a full `<Table>` with sortable headers
 * - Mobile: renders a card-based list using `renderMobileItem`
 * - Supports both client-side and server-side pagination
 * - Includes search, page sizing, sorting, loading/error/empty states
 */
export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  error = null,
  paginationMode = "client",
  serverPagination,
  onPaginationChange,
  onSortingChange,
  sorting: controlledSorting,
  pageSize = 10,
  pageSizeOptions = [10, 20, 30, 50],
  searchValue: controlledSearch,
  onSearchChange,
  searchPlaceholder = "Search...",
  showSearch = true,
  showPagination = true,
  emptyState,
  emptySearchState,
  renderMobileItem,
  onRowClick,
  header,
  className,
  getRowId,
  enableRowSelection: _enableRowSelection = false,
  enableSorting = true,
}: DataTableProps<TData>) {
  const isMobile = useIsMobile();

  // Internal search state (uncontrolled mode)
  const [internalSearch, setInternalSearch] = useState("");
  const searchQuery = controlledSearch ?? internalSearch;

  const handleSearchChange = (value: string) => {
    if (onSearchChange) {
      onSearchChange(value);
    } else {
      setInternalSearch(value);
    }
  };

  const { table } = useDataTable({
    data,
    columns,
    paginationMode,
    serverPagination,
    pageSize,
    sorting: controlledSorting,
    onSortingChange,
    onPaginationChange,
    globalFilter: paginationMode === "client" ? searchQuery : "",
    enableSorting,
    getRowId,
  });

  const rows = table.getRowModel().rows;
  const totalItems =
    paginationMode === "server"
      ? serverPagination?.totalItems
      : table.getFilteredRowModel().rows.length;

  const hasSearch = searchQuery.length > 0;

  // Default empty states
  const defaultEmptyState = emptyState ?? (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <p className="text-sm text-muted-foreground">No data available</p>
    </div>
  );

  const defaultEmptySearchState = emptySearchState ?? (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Search size={32} className="text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">No results found</p>
      <p className="text-xs text-muted-foreground/70">Try adjusting your search query</p>
    </div>
  );

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      {header}

      {/* Search */}
      {showSearch && (
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Error */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Loading */}
      {isLoading && (
        <DataTableSkeleton
          columns={columns.length}
          rows={pageSize > 5 ? 5 : pageSize}
          isMobile={isMobile}
        />
      )}

      {/* Content */}
      {!isLoading && !error && (
        <>
          {rows.length === 0 ? (
            hasSearch ? (
              defaultEmptySearchState
            ) : (
              defaultEmptyState
            )
          ) : isMobile && renderMobileItem ? (
            /* ─── Mobile: Card List ─── */
            <div className="rounded-2xl border divide-y overflow-hidden">
              {rows.map((row, index) => (
                <div
                  key={row.id}
                  className={cn(
                    "transition-colors hover:bg-muted/30",
                    onRowClick && "cursor-pointer",
                  )}
                  onClick={() => onRowClick?.(row.original)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRowClick?.(row.original);
                    }
                  }}
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {renderMobileItem(row, index)}
                </div>
              ))}
            </div>
          ) : (
            /* ─── Desktop: Table ─── */
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    {table.getHeaderGroups().map((headerGroup) =>
                      headerGroup.headers.map((headerCell) => {
                        const canSort = headerCell.column.getCanSort();
                        const sorted = headerCell.column.getIsSorted();
                        return (
                          <TableHead
                            key={headerCell.id}
                            className={cn(canSort && "cursor-pointer select-none")}
                            onClick={
                              canSort ? headerCell.column.getToggleSortingHandler() : undefined
                            }
                          >
                            <div className="flex items-center gap-1">
                              {headerCell.isPlaceholder
                                ? null
                                : flexRender(
                                    headerCell.column.columnDef.header,
                                    headerCell.getContext(),
                                  )}
                              {canSort && (
                                <span className="text-muted-foreground/60">
                                  {sorted === "asc" ? (
                                    <ArrowUp className="size-3.5" />
                                  ) : sorted === "desc" ? (
                                    <ArrowDown className="size-3.5" />
                                  ) : (
                                    <ArrowUpDown className="size-3.5" />
                                  )}
                                </span>
                              )}
                            </div>
                          </TableHead>
                        );
                      }),
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(onRowClick && "cursor-pointer")}
                      onClick={() => onRowClick?.(row.original)}
                      data-state={row.getIsSelected() ? "selected" : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {showPagination && (totalItems ?? 0) > 0 && (
            <DataTablePagination
              table={table}
              pageSizeOptions={pageSizeOptions}
              totalItems={totalItems}
            />
          )}
        </>
      )}
    </div>
  );
}
