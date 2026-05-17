import { Search, Plus, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Spinner } from "../ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

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
}: TenantListPanelProps) {
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Tenants</h2>
          <p className="text-sm text-muted-foreground">
            {pagination.total} tenant{pagination.total !== 1 ? "s" : ""} total
          </p>
        </div>
        <Button size="sm" onClick={onCreateTenant}>
          <Plus size={14} className="mr-1" />
          Create Tenant
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search by name or slug..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Error */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
          <span className="ml-2 text-sm text-muted-foreground">Loading tenants...</span>
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && tenants.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead className="text-right">Accounts</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => {
                const statusStyle = STATUS_STYLES[tenant.status];
                return (
                  <TableRow
                    key={tenant.tenantId}
                    className="cursor-pointer"
                    onClick={() => onSelectTenant(tenant.tenantId)}
                  >
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {tenant.slug}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusStyle.className}>
                        {statusStyle.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{tenant.timezone}</TableCell>
                    <TableCell className="text-right">{tenant.accountCount}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(tenant.createdAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && tenants.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Search size={32} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No tenants found</p>
          {searchQuery && (
            <p className="text-xs text-muted-foreground/70">Try adjusting your search query</p>
          )}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !error && pagination.total > 0 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {pagination.page} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft size={14} className="mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
            >
              Next
              <ChevronRight size={14} className="ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
