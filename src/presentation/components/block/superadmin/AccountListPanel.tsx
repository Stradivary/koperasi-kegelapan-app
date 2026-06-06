import { useMemo } from "react";
import { Key, Plus, Search, Shield, UserCog } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";

import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { DataTable, type ServerPaginationMeta } from "../data-table";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AccountListItem {
  accountId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  username: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

interface AccountListPanelProps {
  accounts: AccountListItem[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateAccount: () => void;
  onChangePassword: (account: AccountListItem) => void;
  onToggleStatus: (account: AccountListItem) => void;
  pagination: PaginationState;
  onPageChange: (page: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  suspended: {
    label: "Suspended",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
};

const ROLE_STYLES: Record<string, { className: string }> = {
  superadmin: {
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  },
  admin: { className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  station: { className: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400" },
  gate: { className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  terminal: { className: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400" },
  scout: {
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
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

// ─── Columns ─────────────────────────────────────────────────────────────────

const columnHelper = createColumnHelper<AccountListItem>();

// ─── Module-level cell renderers ─────────────────────────────────────────────

function renderAccountUsername(info: { getValue: () => string }) {
  return <span className="font-medium">{info.getValue()}</span>;
}

function renderAccountRole(info: { getValue: () => AccountListItem["role"] }) {
  const role = info.getValue();
  const style = ROLE_STYLES[role] ?? { className: "" };
  return (
    <Badge variant="outline" className={style.className}>
      {role}
    </Badge>
  );
}

function renderAccountTenant(info: { getValue: () => string; row: { original: AccountListItem } }) {
  const row = info.row.original;
  return (
    <div className="min-w-0">
      <span className="text-sm">{info.getValue()}</span>
      <span className="block text-xs text-muted-foreground font-mono">{row.tenantSlug}</span>
    </div>
  );
}

function renderAccountStatus(info: { getValue: () => AccountListItem["status"] }) {
  const status = info.getValue();
  const style = STATUS_STYLES[status] ?? { label: status, className: "" };
  return (
    <Badge variant="outline" className={style.className}>
      {style.label}
    </Badge>
  );
}

function renderAccountCreatedAt(info: { getValue: () => string }) {
  return <span className="text-muted-foreground">{formatDate(info.getValue())}</span>;
}

function renderActionsHeader() {
  return <span className="sr-only">Actions</span>;
}

function renderAccountActions(
  onChangePassword: (account: AccountListItem) => void,
  onToggleStatus: (account: AccountListItem) => void,
) {
  return function AccountActionsCellRenderer(info: { row: { original: AccountListItem } }) {
    const account = info.row.original;
    return (
      <div className="flex items-center gap-1 justify-end">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            onChangePassword(account);
          }}
          title="Change password"
        >
          <Key size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStatus(account);
          }}
          title={account.status === "active" ? "Suspend account" : "Activate account"}
        >
          {account.status === "active" ? (
            <Shield size={14} className="text-yellow-600" />
          ) : (
            <UserCog size={14} className="text-green-600" />
          )}
        </Button>
      </div>
    );
  };
}

function createColumns(
  onChangePassword: (account: AccountListItem) => void,
  onToggleStatus: (account: AccountListItem) => void,
) {
  return [
    columnHelper.accessor("username", {
      header: "Username",
      cell: renderAccountUsername,
    }),
    columnHelper.accessor("role", {
      header: "Role",
      cell: renderAccountRole,
    }),
    columnHelper.accessor("tenantName", {
      header: "Tenant",
      cell: renderAccountTenant,
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: renderAccountStatus,
    }),
    columnHelper.accessor("createdAt", {
      header: "Created",
      cell: renderAccountCreatedAt,
    }),
    columnHelper.display({
      id: "actions",
      header: renderActionsHeader,
      cell: renderAccountActions(onChangePassword, onToggleStatus),
    }),
  ];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AccountListPanel({
  accounts,
  isLoading,
  error,
  searchQuery,
  onSearchChange,
  onCreateAccount,
  onChangePassword,
  onToggleStatus,
  pagination,
  onPageChange,
}: Readonly<AccountListPanelProps>) {
  const serverPagination: ServerPaginationMeta = {
    pageIndex: pagination.page - 1,
    pageSize: pagination.pageSize,
    totalItems: pagination.total,
    totalPages: Math.max(1, Math.ceil(pagination.total / pagination.pageSize)),
  };

  const columns = useMemo(
    () => createColumns(onChangePassword, onToggleStatus),
    [onChangePassword, onToggleStatus],
  );

  return (
    <DataTable
      columns={columns}
      data={accounts}
      isLoading={isLoading}
      error={error}
      paginationMode="server"
      serverPagination={serverPagination}
      onPaginationChange={(updater) => {
        const next =
          typeof updater === "function"
            ? updater({ pageIndex: pagination.page - 1, pageSize: pagination.pageSize })
            : updater;
        onPageChange(next.pageIndex + 1);
      }}
      searchValue={searchQuery}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search by username or tenant..."
      getRowId={(row) => row.accountId}
      enableSorting={false}
      header={
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Accounts</h2>
            <p className="text-sm text-muted-foreground">
              {pagination.total} account{pagination.total === 1 ? "" : "s"} total
            </p>
          </div>
          <Button size="sm" onClick={onCreateAccount}>
            <Plus size={14} className="mr-1" />
            Create Account
          </Button>
        </div>
      }
      emptyState={
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Search size={32} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No accounts found</p>
        </div>
      }
      emptySearchState={
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Search size={32} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No accounts match your search</p>
          <p className="text-xs text-muted-foreground/70">Try adjusting your search query</p>
        </div>
      }
      renderMobileItem={(row) => {
        const account = row.original;
        const statusStyle = STATUS_STYLES[account.status] ?? {
          label: account.status,
          className: "",
        };
        const roleStyle = ROLE_STYLES[account.role] ?? { className: "" };
        return (
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{account.username}</span>
              <Badge variant="outline" className={statusStyle.className}>
                {statusStyle.label}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className={roleStyle.className}>
                {account.role}
              </Badge>
              <span>{account.tenantName}</span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onChangePassword(account);
                }}
              >
                <Key size={12} />
                Password
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStatus(account);
                }}
              >
                {account.status === "active" ? (
                  <>
                    <Shield size={12} />
                    Suspend
                  </>
                ) : (
                  <>
                    <UserCog size={12} />
                    Activate
                  </>
                )}
              </Button>
            </div>
          </div>
        );
      }}
    />
  );
}
