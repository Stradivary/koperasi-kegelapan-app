/**
 * Shared types and pure constants for superadmin tenants.
 * This file has NO server-side dependencies (no DB, no cloudflare:workers)
 * and can be safely imported by client-side code.
 */

export type TenantStatus = "active" | "suspended" | "archived";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TenantListItem {
  tenantId: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  accountCount: number;
  createdAt: string;
}

export interface TenantListResponse {
  tenants: TenantListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TenantDetail {
  tenantId: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  accounts: TenantAccountInfo[];
}

export interface TenantAccountInfo {
  accountId: string;
  username: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface CreateTenantRequest {
  slug: string;
  name: string;
  timezone: string;
  adminUsername: string;
  adminPassword: string;
}

export interface CreateTenantSuccess {
  tenantId: string;
  slug: string;
  name: string;
  adminAccountId: string;
}

export interface CreateTenantConflict {
  error: "conflict";
  conflictType: "slug_only" | "admin_only" | "slug_and_admin";
  existingTenantName: string;
  existingSlug: string;
}

export interface CreateTenantValidationError {
  error: "validation";
  errors: { field: string; message: string }[];
}

export type CreateTenantResult =
  | { status: 201; data: CreateTenantSuccess }
  | { status: 409; data: CreateTenantConflict }
  | { status: 400; data: CreateTenantValidationError };

export interface UpdateTenantStatusResult {
  tenantId: string;
  status: TenantStatus;
  updatedAt: string;
}

export interface StatusUpdateError {
  error: "not_found" | "invalid_transition";
  message: string;
  currentStatus?: TenantStatus;
  requestedStatus?: TenantStatus;
}

// ─── Pure Constants ──────────────────────────────────────────────────────────

/**
 * Valid status transitions for tenants.
 * Key: current status, Value: set of allowed target statuses.
 */
export const VALID_TRANSITIONS: Record<TenantStatus, Set<TenantStatus>> = {
  active: new Set(["suspended", "archived"]),
  suspended: new Set(["active", "archived"]),
  archived: new Set([]),
};

/**
 * Check if a status transition is valid.
 * Returns true if the transition from currentStatus to targetStatus is allowed.
 */
export function isValidTransition(
  currentStatus: TenantStatus,
  targetStatus: TenantStatus,
): boolean {
  const allowedTargets = VALID_TRANSITIONS[currentStatus];
  return allowedTargets !== undefined && allowedTargets.has(targetStatus);
}
