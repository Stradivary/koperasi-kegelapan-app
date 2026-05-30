import { useState, useMemo, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef,
  type SortingState,
  type PaginationState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import type { PaginationMode, ServerPaginationMeta } from "./types";

export interface UseDataTableOptions<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  paginationMode?: PaginationMode;
  serverPagination?: ServerPaginationMeta;
  pageSize?: number;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  onPaginationChange?: (pagination: PaginationState) => void;
  globalFilter?: string;
  enableSorting?: boolean;
  getRowId?: (row: TData, index: number) => string;
}

export function useDataTable<TData>({
  data,
  columns,
  paginationMode = "client",
  serverPagination,
  pageSize = 10,
  sorting: controlledSorting,
  onSortingChange,
  onPaginationChange,
  globalFilter = "",
  enableSorting = true,
  getRowId,
}: UseDataTableOptions<TData>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [internalPagination, setInternalPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const isServer = paginationMode === "server";
  const sorting = controlledSorting ?? internalSorting;

  // Reset to page 0 when pageSize changes (e.g. mobile ↔ desktop)
  useEffect(() => {
    if (isServer) {
      return;
    }
    setInternalPagination((prev) =>
      prev.pageSize !== pageSize ? { pageIndex: 0, pageSize } : prev,
    );
  }, [pageSize, isServer]);

  const pagination = useMemo(() => {
    if (isServer && serverPagination) {
      return {
        pageIndex: serverPagination.pageIndex,
        pageSize: serverPagination.pageSize,
      };
    }
    return internalPagination;
  }, [isServer, serverPagination, internalPagination]);

  const pageCount = useMemo(() => {
    if (isServer && serverPagination) {
      return serverPagination.totalPages;
    }
    return undefined; // let TanStack Table calculate from data
  }, [isServer, serverPagination]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination,
      columnFilters,
      globalFilter,
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      if (onSortingChange) {
        onSortingChange(next);
      } else {
        setInternalSorting(next);
      }
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(pagination) : updater;
      if (onPaginationChange) {
        onPaginationChange(next);
      } else {
        setInternalPagination(next);
      }
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: () => {}, // controlled externally
    getCoreRowModel: getCoreRowModel(),
    ...(isServer
      ? { manualPagination: true, manualSorting: true, pageCount }
      : {
          getPaginationRowModel: getPaginationRowModel(),
          getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
          getFilteredRowModel: getFilteredRowModel(),
        }),
    getRowId,
    enableSorting,
  });

  return {
    table,
    sorting,
    pagination,
    pageCount: pageCount ?? table.getPageCount(),
  };
}
