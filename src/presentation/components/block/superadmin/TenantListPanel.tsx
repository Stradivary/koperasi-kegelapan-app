import { Plus, Search } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";

import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { DataTable, type ServerPaginationMeta } from "../data-table";

export interface TenantListItem {
  tenantId: string;
  slug: string;
  name: string;
  status: "active" | "suspended" | "archived";
  timezone: string;
  accountCount: number;
  createdAt: string;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

interface TenantListPanelProps {
  tenants: TenantListItem[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectTenant: (tenantId: string) => void;
  onCreateTenant: () => void;
  pagination: PaginationState;
  onPageChange: (page: number) => void;
}

const STATUS_STYLES: Record<TenantListItem["status"], { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  suspended: {
    label: "Suspended",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  archived: {
    label: "Archived",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
};

function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

const columnHelper = createColumnHelper<TenantListItem>();

// ─── Module-level cell renderers ─────────────────────────────────────────────

function renderTenantName(info: { getValue: () => string }) {
  return <span className="font-medium">{info.getValue()}</span>;
}

function renderTenantSlug(info: { getValue: () => string }) {
  return <span className="font-mono text-muted-foreground text-xs">{info.getValue()}</span>;
}

function renderTenantStatus(info: { getValue: () => TenantListItem["status"] }) {
  const status = info.getValue();
  const style = STATUS_STYLES[status];
  return (
    <Badge variant="outline" className={style.className}>
      {style.label}
    </Badge>
  );
}

function renderTenantTimezone(info: { getValue: () => string }) {
  return <span className="text-muted-foreground">{info.getValue()}</span>;
}

function renderAccountCountHeader() {
  return <span className="text-right w-full block">Accounts</span>;
}

function renderAccountCount(info: { getValue: () => number }) {
  return <span className="text-right block">{info.getValue()}</span>;
}

function renderTenantCreatedAt(info: { getValue: () => string }) {
  return <span className="text-muted-foreground">{formatDate(info.getValue())}</span>;
}

const columns = [
  columnHelper.accessor("name", {
    header: "Name",
    cell: renderTenantName,
  }),
  columnHelper.accessor("slug", {
    header: "Slug",
    cell: renderTenantSlug,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: renderTenantStatus,
  }),
  columnHelper.accessor("timezone", {
    header: "Timezone",
    cell: renderTenantTimezone,
  }),
  columnHelper.accessor("accountCount", {
    header: renderAccountCountHeader,
    cell: renderAccountCount,
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: renderTenantCreatedAt,
  }),
];

export function TenantListPanel({
  tenants,
  isLoading,
  error,
  searchQuery,
  onSearchChange,
  onSelectTenant,
  onCreateTenant,
  pagination,
  onPageChange,
}: Readonly<TenantListPanelProps>) {
  // Convert 1-based page to 0-based for DataTable
  const serverPagination: ServerPaginationMeta = {
    pageIndex: pagination.page - 1,
    pageSize: pagination.pageSize,
    totalItems: pagination.total,
    totalPages: Math.max(1, Math.ceil(pagination.total / pagination.pageSize)),
  };

  return (
    <DataTable
      columns={columns}
      data={tenants}
      isLoading={isLoading}
      error={error}
      paginationMode="server"
      serverPagination={serverPagination}
      onPaginationChange={(updater) => {
        const next =
          typeof updater === "function"
            ? updater({ pageIndex: pagination.page - 1, pageSize: pagination.pageSize })
            : updater;
        // Convert 0-based back to 1-based for parent
        onPageChange(next.pageIndex + 1);
      }}
      searchValue={searchQuery}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search by name or slug..."
      onRowClick={(tenant) => onSelectTenant(tenant.tenantId)}
      getRowId={(row) => row.tenantId}
      enableSorting={false}
      header={
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Tenants</h2>
            <p className="text-sm text-muted-foreground">
              {pagination.total} tenant{pagination.total === 1 ? "" : "s"} total
            </p>
          </div>
          <Button size="sm" onClick={onCreateTenant}>
            <Plus size={14} className="mr-1" />
            Create Tenant
          </Button>
        </div>
      }
      emptyState={
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Search size={32} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No tenants found</p>
        </div>
      }
      emptySearchState={
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Search size={32} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No tenants found</p>
          <p className="text-xs text-muted-foreground/70">Try adjusting your search query</p>
        </div>
      }
      renderMobileItem={(row) => {
        const tenant = row.original;
        const style = STATUS_STYLES[tenant.status];
        return (
          <div className="px-4 py-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{tenant.name}</p>
              <Badge variant="outline" className={style.className}>
                {style.label}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono">{tenant.slug}</span>
              <span>{tenant.accountCount} accounts</span>
              <span>{formatDate(tenant.createdAt)}</span>
            </div>
          </div>
        );
      }}
    />
  );
}
