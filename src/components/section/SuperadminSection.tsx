import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { SuperadminLayout, type SuperadminView } from "../layout/SuperadminLayout";
import {
  TenantListPanel,
  type TenantListItem,
  type PaginationState,
} from "../block/TenantListPanel";
import { TenantDetailPanel } from "../block/TenantDetailPanel";
import {
  TenantCreateDialog,
  type CreateTenantRequest,
  type CreateTenantError,
} from "../block/TenantCreateDialog";
import type { TenantDetail, TenantStatus } from "#/server/superadminTenants.types";
import { API_BASE_URL } from "#/lib/api";

// ─── Constants ───────────────────────────────────────────────────────────────

const SUPERADMIN_TOKEN_KEY = "superadmin-token";
const DEFAULT_PAGE_SIZE = 20;
const TOAST_DURATION = 5000;
const STALE_TIME = 30_000; // 30 seconds

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAuthToken(): string | null {
  try {
    return localStorage.getItem(SUPERADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

async function handleResponse(res: Response, onAuthFail: () => void) {
  if (res.status === 401 || res.status === 403) {
    // Clear token and show login gate
    try {
      localStorage.removeItem(SUPERADMIN_TOKEN_KEY);
    } catch {
      // ignore
    }
    onAuthFail();
    throw new Error("Unauthorized");
  }
  return res;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ActiveView = "list" | "detail";

interface TenantListResponse {
  tenants: TenantListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SuperadminSection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Auth state ──
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getAuthToken());
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // ── View state ──
  const [activeSection, setActiveSection] = useState<SuperadminView>("tenants");
  const [activeView, setActiveView] = useState<ActiveView>("list");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  // ── List state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  // ── Create dialog state ──
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // ── Superadmin Login Handler ──
  async function handleSuperadminLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      });

      if (!res.ok) {
        setLoginError("Username atau password salah");
        return;
      }

      const data = await res.json();

      if (data.role !== "superadmin") {
        setLoginError("Akun ini bukan superadmin");
        return;
      }

      if (data.accessToken) {
        localStorage.setItem(SUPERADMIN_TOKEN_KEY, data.accessToken);
      }

      setIsAuthenticated(true);
    } catch {
      setLoginError("Gagal terhubung ke server");
    } finally {
      setLoginLoading(false);
    }
  }

  // ── Tenant List Query ──
  const tenantListQuery = useQuery<TenantListResponse>({
    queryKey: ["superadmin-tenants", page, DEFAULT_PAGE_SIZE, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(DEFAULT_PAGE_SIZE),
      });
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }

      const res = await fetch(`${API_BASE_URL}/api/superadmin/tenants?${params.toString()}`, {
        headers: authHeaders(),
      });

      const handled = await handleResponse(res, () => setIsAuthenticated(false));

      if (!handled.ok) {
        throw new Error(`Server error: ${handled.status}`);
      }

      return handled.json();
    },
    staleTime: STALE_TIME,
    placeholderData: (previousData) => previousData,
  });

  // ── Tenant Detail Query ──
  const tenantDetailQuery = useQuery<TenantDetail>({
    queryKey: ["superadmin-tenant-detail", selectedTenantId],
    queryFn: async () => {
      if (!selectedTenantId) throw new Error("No tenant selected");

      const res = await fetch(`${API_BASE_URL}/api/superadmin/tenants/${selectedTenantId}`, {
        headers: authHeaders(),
      });

      const handled = await handleResponse(res, () => setIsAuthenticated(false));

      if (!handled.ok) {
        throw new Error(`Server error: ${handled.status}`);
      }

      const data = await handled.json();
      return data.tenant ?? data;
    },
    enabled: activeView === "detail" && !!selectedTenantId,
    staleTime: STALE_TIME,
    placeholderData: (previousData) => previousData,
  });

  // ── Create Tenant Mutation ──
  const createTenantMutation = useMutation<
    { tenantId: string; slug: string; name: string; adminAccountId: string },
    CreateTenantError,
    CreateTenantRequest
  >({
    mutationFn: async (data) => {
      const res = await fetch(`${API_BASE_URL}/api/superadmin/tenants`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });

      const handled = await handleResponse(res, () => setIsAuthenticated(false));

      const body = await handled.json();

      if (!handled.ok) {
        // Transform server errors into CreateTenantError format
        if (body.error === "validation" && body.errors) {
          throw { errors: body.errors } as CreateTenantError;
        }
        if (body.error === "conflict") {
          const fieldErrors: { field: string; message: string }[] = [];
          if (body.conflictType === "slug_only" || body.conflictType === "slug_and_admin") {
            fieldErrors.push({
              field: "slug",
              message: `Slug already exists (used by "${body.existingTenantName}")`,
            });
          }
          if (body.conflictType === "admin_only" || body.conflictType === "slug_and_admin") {
            fieldErrors.push({
              field: "adminUsername",
              message: `Username already exists (in tenant "${body.existingTenantName}")`,
            });
          }
          throw { errors: fieldErrors } as CreateTenantError;
        }
        throw {
          errors: [{ field: "general", message: body.error || "Failed to create tenant" }],
        } as CreateTenantError;
      }

      return body;
    },
    onSuccess: (data) => {
      setCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["superadmin-tenants"] });
      toast.success(`Tenant "${data.name}" created successfully`, { duration: TOAST_DURATION });
    },
    onError: (error) => {
      // Only show toast for non-field errors (network/server errors)
      const isFieldError = error?.errors?.some((e) => e.field !== "general");
      if (!isFieldError) {
        toast.error("Failed to create tenant", { duration: TOAST_DURATION });
      }
    },
  });

  // ── Status Change Mutation ──
  const statusChangeMutation = useMutation<
    { tenantId: string; status: TenantStatus; updatedAt: string },
    Error,
    { tenantId: string; newStatus: TenantStatus }
  >({
    mutationFn: async ({ tenantId, newStatus }) => {
      const res = await fetch(`${API_BASE_URL}/api/superadmin/tenants/${tenantId}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });

      const handled = await handleResponse(res, () => setIsAuthenticated(false));
      const body = await handled.json();

      if (!handled.ok) {
        throw new Error(body.message || body.error || "Failed to update status");
      }

      return body;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin-tenant-detail", data.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["superadmin-tenants"] });
      toast.success(`Tenant status updated to "${data.status}"`, { duration: TOAST_DURATION });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update tenant status", { duration: TOAST_DURATION });
    },
  });

  // ── Handlers ──

  const handleSelectTenant = useCallback((tenantId: string) => {
    setSelectedTenantId(tenantId);
    setActiveView("detail");
  }, []);

  const handleBackToList = useCallback(() => {
    setActiveView("list");
    setSelectedTenantId(null);
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setPage(1); // Reset to first page on search
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handleCreateTenant = useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

  const handleCreateSubmit = useCallback(
    (data: CreateTenantRequest) => {
      createTenantMutation.mutate(data);
    },
    [createTenantMutation],
  );

  const handleStatusChange = useCallback(
    (newStatus: TenantStatus) => {
      if (!selectedTenantId) return;
      statusChangeMutation.mutate({ tenantId: selectedTenantId, newStatus });
    },
    [selectedTenantId, statusChangeMutation],
  );

  // ── Derived state ──

  const pagination: PaginationState = {
    page: tenantListQuery.data?.page ?? page,
    pageSize: tenantListQuery.data?.pageSize ?? DEFAULT_PAGE_SIZE,
    total: tenantListQuery.data?.total ?? 0,
  };

  const listError = tenantListQuery.error
    ? String(tenantListQuery.error.message || tenantListQuery.error)
    : null;

  const detailError = tenantDetailQuery.error
    ? String(tenantDetailQuery.error.message || tenantDetailQuery.error)
    : null;

  // ── Create error for dialog ──
  const createError: CreateTenantError | null = createTenantMutation.error ?? null;

  // ── Render ──

  // Show login gate if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Superadmin Login</h1>
            <p className="text-sm text-muted-foreground mt-1">Masuk dengan akun superadmin</p>
          </div>

          <form onSubmit={handleSuperadminLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="sa-username" className="text-sm font-medium">
                Username
              </label>
              <input
                id="sa-username"
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                autoComplete="username"
                required
                className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="sa-password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="sa-password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>

            {loginError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2">
                <p className="text-sm text-destructive">{loginError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full h-11 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {loginLoading ? "Masuk..." : "Masuk"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Kembali ke halaman utama
          </button>
        </div>
      </div>
    );
  }

  return (
    <SuperadminLayout activeSection={activeSection} onSectionChange={setActiveSection}>
      {activeSection === "tenants" && (
        <>
          {activeView === "list" && (
            <TenantListPanel
              tenants={tenantListQuery.data?.tenants ?? []}
              isLoading={tenantListQuery.isLoading}
              error={listError}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              onSelectTenant={handleSelectTenant}
              onCreateTenant={handleCreateTenant}
              pagination={pagination}
              onPageChange={handlePageChange}
            />
          )}

          {activeView === "detail" && (
            <TenantDetailPanel
              tenant={tenantDetailQuery.data ?? null}
              isLoading={tenantDetailQuery.isLoading}
              error={detailError}
              onStatusChange={handleStatusChange}
              onBack={handleBackToList}
              isUpdating={statusChangeMutation.isPending}
            />
          )}

          <TenantCreateDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            onSubmit={handleCreateSubmit}
            isSubmitting={createTenantMutation.isPending}
            error={createError}
          />
        </>
      )}

      {activeSection === "accounts" && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">Accounts management coming soon.</p>
        </div>
      )}
    </SuperadminLayout>
  );
}
