import { useState } from "react";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { flexRender } from "@tanstack/react-table";
import type { Row, Header } from "@tanstack/react-table";

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

// ── Sub-components ────────────────────────────────────────────────────────────

interface MobileRowProps<TData> {
  readonly row: Row<TData>;
  readonly index: number;
  readonly onRowClick?: (row: TData) => void;
  readonly renderMobileItem: (row: Row<TData>, index: number) => React.ReactNode;
}

function MobileRow<TData>({ row, index, onRowClick, renderMobileItem }: MobileRowProps<TData>) {
  if (onRowClick) {
    return (
      <button
        type="button"
        className={cn("w-full text-left transition-colors hover:bg-muted/30 cursor-pointer")}
        onClick={() => onRowClick(row.original)}
      >
        {renderMobileItem(row, index)}
      </button>
    );
  }
  return (
    <div className={cn("transition-colors hover:bg-muted/30")}>{renderMobileItem(row, index)}</div>
  );
}

interface SortableHeaderProps<TData> {
  readonly headerCell: Header<TData, unknown>;
}

function SortableHeader<TData>({ headerCell }: SortableHeaderProps<TData>) {
  const canSort = headerCell.column.getCanSort();
  const sorted = headerCell.column.getIsSorted();
  const toggleSort = canSort ? headerCell.column.getToggleSortingHandler() : undefined;

  let ariaSort: "ascending" | "descending" | "none" | undefined;
  if (sorted === "asc") {
    ariaSort = "ascending";
  } else if (sorted === "desc") {
    ariaSort = "descending";
  } else if (canSort) {
    ariaSort = "none";
  }

  let sortIcon: React.ReactNode = null;
  if (sorted === "asc") {
    sortIcon = <ArrowUp className="size-3.5" />;
  } else if (sorted === "desc") {
    sortIcon = <ArrowDown className="size-3.5" />;
  } else {
    sortIcon = <ArrowUpDown className="size-3.5" />;
  }

  return (
    <TableHead
      key={headerCell.id}
      className={cn(canSort && "cursor-pointer select-none")}
      onClick={toggleSort}
      onKeyDown={
        canSort
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleSort?.(e);
              }
            }
          : undefined
      }
      tabIndex={canSort ? 0 : undefined}
      aria-sort={ariaSort}
    >
      <div className="flex items-center gap-1">
        {headerCell.isPlaceholder
          ? null
          : flexRender(headerCell.column.columnDef.header, headerCell.getContext())}
        {canSort && <span className="text-muted-foreground/60">{sortIcon}</span>}
      </div>
    </TableHead>
  );
}

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
  pageSize: pageSizeProp,
  pageSizeOptions = [5, 10, 20, 30, 50],
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
}: Readonly<DataTableProps<TData>>) {
  const isMobile = useIsMobile();

  // Responsive default: 5 on mobile, 10 on desktop (caller can override)
  const pageSize = pageSizeProp ?? (isMobile ? 5 : 10);

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
            className="pl-9 bg-white"
          />
        </div>
      )}

      {/* Error */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Loading */}
      {isLoading && (
        <DataTableSkeleton
          columns={columns.length}
          rows={Math.min(5, pageSize)}
          isMobile={isMobile}
        />
      )}

      {/* Content */}
      {!isLoading && !error && (
        <>
          {(() => {
            if (rows.length === 0) {
              return hasSearch ? defaultEmptySearchState : defaultEmptyState;
            }
            if (isMobile && renderMobileItem) {
              return (
                /* ─── Mobile: Card List ─── */
                <div className="rounded-2xl border divide-y overflow-hidden">
                  {rows.map((row, index) => (
                    <MobileRow
                      key={row.id}
                      row={row}
                      index={index}
                      onRowClick={onRowClick}
                      renderMobileItem={renderMobileItem}
                    />
                  ))}
                </div>
              );
            }
            return (
              /* ─── Desktop: Table ─── */
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {table
                        .getHeaderGroups()
                        .map((headerGroup) =>
                          headerGroup.headers.map((headerCell) => (
                            <SortableHeader key={headerCell.id} headerCell={headerCell} />
                          )),
                        )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className={cn(onRowClick && "cursor-pointer")}
                        onClick={() => onRowClick?.(row.original)}
                        onKeyDown={
                          onRowClick
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  onRowClick(row.original);
                                }
                              }
                            : undefined
                        }
                        tabIndex={onRowClick ? 0 : undefined}
                        role={onRowClick ? "button" : undefined}
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
            );
          })()}

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
