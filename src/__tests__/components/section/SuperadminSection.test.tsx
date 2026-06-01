// @vitest-environment jsdom
/**
 * Tests for src/components/section/SuperadminSection.tsx
 * Covers: login gate, auth flow, tenant list, account list, dialogs.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockUseQueryClient = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
  useMutation: (opts: unknown) => mockUseMutation(opts),
  useQueryClient: () => mockUseQueryClient(),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("#/hooks/useApi", () => ({ API_BASE_URL: "http://localhost:8787" }));

vi.mock("#/components/layout/SuperadminLayout", () => ({
  SuperadminLayout: ({
    children,
    activeSection,
    onSectionChange,
  }: {
    children: React.ReactNode;
    activeSection: string;
    onSectionChange: (s: string) => void;
  }) => (
    <div data-testid="superadmin-layout" data-section={activeSection}>
      <button onClick={() => onSectionChange("accounts")}>Accounts</button>
      <button onClick={() => onSectionChange("tenants")}>Tenants</button>
      {children}
    </div>
  ),
}));
vi.mock("#/components/block/superadmin/TenantListPanel", () => ({
  TenantListPanel: ({
    tenants,
    isLoading,
    onCreateTenant,
    onSelectTenant,
  }: {
    tenants: unknown[];
    isLoading: boolean;
    error?: string | null;
    searchQuery?: string;
    onSearchChange?: (q: string) => void;
    onSelectTenant: (id: string) => void;
    onCreateTenant: () => void;
    pagination?: unknown;
    onPageChange?: (p: number) => void;
  }) => (
    <div
      data-testid="tenant-list-panel"
      data-loading={String(isLoading)}
      data-count={tenants.length}
    >
      <button onClick={onCreateTenant}>Create Tenant</button>
      <button onClick={() => onSelectTenant("t-1")}>Select Tenant</button>
    </div>
  ),
}));
vi.mock("#/components/block/superadmin/TenantDetailPanel", () => ({
  TenantDetailPanel: ({
    tenant: _t,
    onBack,
  }: {
    tenant: unknown;
    onBack: () => void;
    isLoading?: boolean;
    error?: string | null;
    onStatusChange?: (s: string) => void;
    isUpdating?: boolean;
  }) => (
    <div data-testid="tenant-detail-panel">
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));
vi.mock("#/components/block/superadmin/AccountListPanel", () => ({
  AccountListPanel: ({
    accounts,
    isLoading,
    onCreateAccount,
  }: {
    accounts: unknown[];
    isLoading: boolean;
    error?: string | null;
    searchQuery?: string;
    onSearchChange?: (q: string) => void;
    onCreateAccount: () => void;
    onChangePassword?: (a: unknown) => void;
    onToggleStatus?: (a: unknown) => void;
    pagination?: unknown;
    onPageChange?: (p: number) => void;
  }) => (
    <div
      data-testid="account-list-panel"
      data-loading={String(isLoading)}
      data-count={accounts.length}
    >
      <button onClick={onCreateAccount}>Create Account</button>
    </div>
  ),
}));
vi.mock("#/components/block/dialogs/TenantCreateDialog", () => ({
  TenantCreateDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onSubmit?: (d: unknown) => void;
    isSubmitting?: boolean;
    error?: unknown;
  }) =>
    open ? (
      <div data-testid="tenant-create-dialog">
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,
}));
vi.mock("#/components/block/dialogs/AccountCreateDialog", () => ({
  AccountCreateDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onSubmit?: (d: unknown) => void;
    isSubmitting?: boolean;
    error?: unknown;
    tenants?: unknown[];
    tenantsLoading?: boolean;
  }) =>
    open ? (
      <div data-testid="account-create-dialog">
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,
}));
vi.mock("#/components/block/dialogs/ChangePasswordDialog", () => ({
  ChangePasswordDialog: ({
    open,
  }: {
    open: boolean;
    onOpenChange?: (o: boolean) => void;
    accountUsername?: string;
    onSubmit?: (p: string) => void;
    isSubmitting?: boolean;
    error?: string | null;
  }) => (open ? <div data-testid="change-password-dialog" /> : null),
}));
vi.mock("#/components/ui/confirmation-dialog-drawer", () => ({
  ConfirmationDialogDrawer: ({ open }: { open: boolean; [key: string]: unknown }) =>
    open ? <div data-testid="confirmation-dialog" /> : null,
}));

import { SuperadminSection } from "#/components/section/SuperadminSection";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

function setupAuthenticated() {
  localStorageMock.setItem("superadmin-token", "test-token");
  mockUseQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
  mockUseQuery.mockReturnValue({
    data: { tenants: [], total: 0, page: 1, pageSize: 20 },
    isLoading: false,
    error: null,
  });
  mockUseMutation.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  });
}

describe("SuperadminSection - login gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it("shows login form when not authenticated", () => {
    mockUseQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
    mockUseQuery.mockReturnValue({ data: null, isLoading: false, error: null });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
    render(<SuperadminSection />);
    expect(screen.getByText("Superadmin Login")).toBeDefined();
    expect(screen.getByLabelText("Username")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
  });

  it("shows Masuk button in login form", () => {
    mockUseQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
    mockUseQuery.mockReturnValue({ data: null, isLoading: false, error: null });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
    render(<SuperadminSection />);
    expect(screen.getByRole("button", { name: "Masuk" })).toBeDefined();
  });

  it("shows Kembali ke halaman utama link", () => {
    mockUseQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
    mockUseQuery.mockReturnValue({ data: null, isLoading: false, error: null });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
    render(<SuperadminSection />);
    expect(screen.getByText("Kembali ke halaman utama")).toBeDefined();
  });

  it("calls navigate when Kembali clicked", () => {
    mockUseQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
    mockUseQuery.mockReturnValue({ data: null, isLoading: false, error: null });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
    render(<SuperadminSection />);
    fireEvent.click(screen.getByText("Kembali ke halaman utama"));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("shows login error when fetch fails", async () => {
    mockUseQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
    mockUseQuery.mockReturnValue({ data: null, isLoading: false, error: null });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<SuperadminSection />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
    fireEvent.submit(screen.getByRole("button", { name: "Masuk" }).closest("form")!);
    await waitFor(() => expect(screen.getByText("Gagal terhubung ke server")).toBeDefined());
  });

  it("shows wrong credentials error when login returns non-ok", async () => {
    mockUseQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
    mockUseQuery.mockReturnValue({ data: null, isLoading: false, error: null });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<SuperadminSection />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.submit(screen.getByRole("button", { name: "Masuk" }).closest("form")!);
    await waitFor(() => expect(screen.getByText("Username atau password salah")).toBeDefined());
  });

  it("shows non-superadmin error when role is not superadmin", async () => {
    mockUseQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
    mockUseQuery.mockReturnValue({ data: null, isLoading: false, error: null });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ role: "admin", accessToken: "tok" }) });
    render(<SuperadminSection />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pass" } });
    fireEvent.submit(screen.getByRole("button", { name: "Masuk" }).closest("form")!);
    await waitFor(() => expect(screen.getByText("Akun ini bukan superadmin")).toBeDefined());
  });
});

describe("SuperadminSection - authenticated (tenants view)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthenticated();
  });

  it("renders SuperadminLayout when authenticated", () => {
    render(<SuperadminSection />);
    expect(screen.getByTestId("superadmin-layout")).toBeDefined();
  });

  it("renders TenantListPanel by default", () => {
    render(<SuperadminSection />);
    expect(screen.getByTestId("tenant-list-panel")).toBeDefined();
  });

  it("opens TenantCreateDialog when Create Tenant clicked", () => {
    render(<SuperadminSection />);
    fireEvent.click(screen.getByText("Create Tenant"));
    expect(screen.getByTestId("tenant-create-dialog")).toBeDefined();
  });

  it("shows TenantDetailPanel when tenant selected", () => {
    render(<SuperadminSection />);
    fireEvent.click(screen.getByText("Select Tenant"));
    expect(screen.getByTestId("tenant-detail-panel")).toBeDefined();
  });

  it("returns to list when Back clicked in detail panel", () => {
    render(<SuperadminSection />);
    fireEvent.click(screen.getByText("Select Tenant"));
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByTestId("tenant-list-panel")).toBeDefined();
  });
});

describe("SuperadminSection - authenticated (accounts view)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthenticated();
  });

  it("renders AccountListPanel when accounts section selected", () => {
    render(<SuperadminSection />);
    fireEvent.click(screen.getByText("Accounts"));
    expect(screen.getByTestId("account-list-panel")).toBeDefined();
  });

  it("opens AccountCreateDialog when Create Account clicked", () => {
    render(<SuperadminSection />);
    fireEvent.click(screen.getByText("Accounts"));
    fireEvent.click(screen.getByText("Create Account"));
    expect(screen.getByTestId("account-create-dialog")).toBeDefined();
  });
});
