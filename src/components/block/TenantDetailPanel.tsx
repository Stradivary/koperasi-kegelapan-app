import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { LoadingState } from "./LoadingState";
import type {
  TenantDetail,
  TenantAccountInfo,
  TenantStatus,
} from "#/server/superadminTenants.types";
import { VALID_TRANSITIONS } from "#/server/superadminTenants.types";

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

// ─── Component ───────────────────────────────────────────────────────────────

export function TenantDetailPanel({
  tenant,
  isLoading,
  error,
  onStatusChange,
  onBack,
  isUpdating,
}: TenantDetailPanelProps) {
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
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenant.accounts.map((account: TenantAccountInfo) => (
                <TableRow key={account.accountId}>
                  <TableCell className="font-medium">{account.username}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{account.role}</Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(account.status)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(account.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
              {tenant.accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    No accounts found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Confirmation dialog */}
      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change the status of{" "}
              <span className="font-semibold">{tenant.name}</span> from{" "}
              <span className="font-semibold">{tenant.status}</span> to{" "}
              <span className="font-semibold">{confirmTarget}</span>?
              {confirmTarget === "archived" && (
                <span className="block mt-2 text-destructive">
                  This action cannot be undone. Archived tenants cannot be reactivated.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmTarget === "archived" ? "destructive" : "default"}
              disabled={isUpdating}
              onClick={() => {
                if (confirmTarget) {
                  onStatusChange(confirmTarget);
                  setConfirmTarget(null);
                }
              }}
            >
              {isUpdating && <Loader2 size={14} className="mr-1 animate-spin" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
