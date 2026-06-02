import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { ConfirmationDialogDrawer } from "../../ui/confirmation-dialog-drawer";
import { LoadingState } from "../LoadingState";
import { DataTable } from "../data-table";
import type {
  TenantDetail,
  TenantAccountInfo,
  TenantStatus,
} from "#/application/admin/superadminTenants.types";
import { VALID_TRANSITIONS } from "#/application/admin/superadminTenants.types";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface TenantDetailPanelProps {
  tenant: TenantDetail | null;
  isLoading: boolean;
  error: string | null;
  onStatusChange: (newStatus: TenantStatus) => void;
  onBack: () => void;
  isUpdating: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_BADGE_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active: { label: "Active", variant: "default" },
  suspended: { label: "Suspended", variant: "secondary" },
  archived: { label: "Archived", variant: "destructive" },
};

function getStatusBadge(status: string) {
  const config = STATUS_BADGE_CONFIG[status] ?? {
    label: status,
    variant: "outline" as const,
  };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

const ACTION_LABELS: Record<
  TenantStatus,
  { label: string; variant: "default" | "destructive" | "secondary" }
> = {
  active: { label: "Activate", variant: "default" },
  suspended: { label: "Suspend", variant: "secondary" },
  archived: { label: "Archive", variant: "destructive" },
};

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return dateStr;
  }
}

function getAvailableTransitions(currentStatus: string): TenantStatus[] {
  const transitions = VALID_TRANSITIONS[currentStatus as TenantStatus];
  if (!transitions) return [];
  return Array.from(transitions);
}

const accountColumnHelper = createColumnHelper<TenantAccountInfo>();

const accountColumns = [
  accountColumnHelper.accessor("username", {
    header: "Username",
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  accountColumnHelper.accessor("role", {
    header: "Role",
    cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
  }),
  accountColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => getStatusBadge(info.getValue()),
  }),
  accountColumnHelper.accessor("createdAt", {
    header: "Created",
    cell: (info) => <span className="text-muted-foreground">{formatDate(info.getValue())}</span>,
  }),
];

// ─── Component ───────────────────────────────────────────────────────────────

export function TenantDetailPanel({
  tenant,
  isLoading,
  error,
  onStatusChange,
  onBack,
  isUpdating,
}: Readonly<TenantDetailPanelProps>) {
  const [confirmTarget, setConfirmTarget] = useState<TenantStatus | null>(null);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={16} className="mr-1" />
          Back to Tenants
        </Button>
        <LoadingState text="Loading tenant details..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={16} className="mr-1" />
          Back to Tenants
        </Button>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  // No tenant data
  if (!tenant) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={16} className="mr-1" />
          Back to Tenants
        </Button>
        <p className="text-sm text-muted-foreground">Tenant not found.</p>
      </div>
    );
  }

  const availableTransitions = getAvailableTransitions(tenant.status);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft size={16} className="mr-1" />
        Back to Tenants
      </Button>

      {/* Tenant metadata */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{tenant.name}</h2>
            <p className="text-sm text-muted-foreground font-mono">{tenant.slug}</p>
          </div>
          {getStatusBadge(tenant.status)}
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Timezone</dt>
            <dd className="font-medium">{tenant.timezone}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tenant ID</dt>
            <dd className="font-mono text-xs">{tenant.tenantId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="font-medium">{formatDate(tenant.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last Updated</dt>
            <dd className="font-medium">{formatDate(tenant.updatedAt)}</dd>
          </div>
        </dl>
      </div>

      {/* Status actions */}
      {availableTransitions.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">Actions:</span>
          {availableTransitions.map((targetStatus) => {
            const actionConfig = ACTION_LABELS[targetStatus];
            return (
              <Button
                key={targetStatus}
                variant={actionConfig.variant === "destructive" ? "destructive" : "outline"}
                size="sm"
                disabled={isUpdating}
                onClick={() => setConfirmTarget(targetStatus)}
              >
                {isUpdating && <Loader2 size={14} className="mr-1 animate-spin" />}
                {actionConfig.label}
              </Button>
            );
          })}
        </div>
      )}

      {/* Accounts table */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          Accounts ({tenant.accounts.length})
        </h3>
        <DataTable
          columns={accountColumns}
          data={tenant.accounts}
          paginationMode="client"
          pageSize={10}
          showSearch={false}
          enableSorting={false}
          getRowId={(row) => row.accountId}
          emptyState={
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm text-muted-foreground">No accounts found</p>
            </div>
          }
          renderMobileItem={(row) => {
            const account = row.original;
            return (
              <div className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{account.username}</span>
                  {getStatusBadge(account.status)}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{account.role}</Badge>
                  <span>{formatDate(account.createdAt)}</span>
                </div>
              </div>
            );
          }}
        />
      </div>

      {/* Confirmation dialog */}
      <ConfirmationDialogDrawer
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
        title="Confirm Status Change"
        description={
          <div>
            Are you sure you want to change the status of{" "}
            <span className="font-semibold">{tenant.name}</span> from{" "}
            <span className="font-semibold">{tenant.status}</span> to{" "}
            <span className="font-semibold">{confirmTarget}</span>?
            {confirmTarget === "archived" && (
              <span className="block mt-2 text-destructive">
                This action cannot be undone. Archived tenants cannot be reactivated.
              </span>
            )}
          </div>
        }
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        confirmVariant={confirmTarget === "archived" ? "destructive" : "default"}
        onConfirm={() => {
          if (confirmTarget) {
            onStatusChange(confirmTarget);
            setConfirmTarget(null);
          }
        }}
        onCancel={() => setConfirmTarget(null)}
        isProcessing={isUpdating}
        processingLabel="Confirm"
      />
    </div>
  );
}
