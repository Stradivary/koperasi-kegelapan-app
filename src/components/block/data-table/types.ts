import type {
  ColumnDef,
  SortingState,
  PaginationState,
  OnChangeFn,
  Row,
} from "@tanstack/react-table";
import type { ReactNode } from "react";

/** Pagination mode: client-side or server-side */
export type PaginationMode = "client" | "server";

/** Server pagination metadata returned from your API */
export interface ServerPaginationMeta {
  /** Current page index (0-based) */
  pageIndex: number;
  /** Items per page */
  pageSize: number;
  /** Total number of items across all pages */
  totalItems: number;
  /** Total number of pages */
  totalPages: number;
}

/** Props for the DataTable component */
export interface DataTableProps<TData> {
  /** Column definitions (TanStack Table ColumnDef) */
  columns: ColumnDef<TData, any>[];

  /** Data array to display */
  data: TData[];

  /** Whether data is currently loading */
  isLoading?: boolean;

  /** Error message to display */
  error?: string | null;

  /** Pagination mode */
  paginationMode?: PaginationMode;

  /** Server pagination metadata (required when paginationMode="server") */
  serverPagination?: ServerPaginationMeta;

  /** Callback when pagination changes (for server mode) */
  onPaginationChange?: OnChangeFn<PaginationState>;

  /** Callback when sorting changes (for server mode) */
  onSortingChange?: OnChangeFn<SortingState>;

  /** Current sorting state (controlled, for server mode) */
  sorting?: SortingState;

  /** Default page size (defaults to 10 on desktop, 5 on mobile) */
  pageSize?: number;

  /** Available page size options */
  pageSizeOptions?: number[];

  /** Search/filter value (controlled) */
  searchValue?: string;

  /** Callback when search changes */
  onSearchChange?: (value: string) => void;

  /** Search placeholder text */
  searchPlaceholder?: string;

  /** Whether to show the search input */
  showSearch?: boolean;

  /** Whether to show pagination controls */
  showPagination?: boolean;

  /** Custom empty state content */
  emptyState?: ReactNode;

  /** Custom empty state when search has no results */
  emptySearchState?: ReactNode;

  /** Render function for mobile card/list items */
  renderMobileItem?: (row: Row<TData>, index: number) => ReactNode;

  /** Click handler for row/item */
  onRowClick?: (row: TData) => void;

  /** Header content (title, actions, etc.) rendered above the table */
  header?: ReactNode;

  /** Additional className for the root container */
  className?: string;

  /** Unique key extractor for rows (defaults to index) */
  getRowId?: (row: TData, index: number) => string;

  /** Whether rows are selectable */
  enableRowSelection?: boolean;

  /** Whether columns are sortable (default: true for client mode) */
  enableSorting?: boolean;
}
