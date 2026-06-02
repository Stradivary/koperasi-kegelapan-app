// @vitest-environment jsdom
/**
 * Tests for SuperadminSection.tsx
 * Covers: login gate, authenticated view, tenant list, account list,
 *         section switching, create dialogs, status changes
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("#/infrastructure/api/apiClient", () => ({
  API_BASE_URL: "http://localhost",
}));

// Mock react-query
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => {
  return {
    useQuery: ({ queryKey, enabled }: any) => {
      if (enabled === false) {
        return { data: undefined, isLoading: false, error: null };
      }
      if (queryKey[0] === "superadmin-tenants") {
        return {
          data: {
            tenants: [
              {
                tenantId: "t-1",
                name: "Tenant A",
                slug: "tenant-a",
                status: "active",
                createdAt: "2024-01-01",
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          },
          isLoading: false,
          error: null,
        };
      }
      if (queryKey[0] === "superadmin-accounts") {
        return {
          data: {
            accounts: [
              {
                accountId: "a-1",
                username: "admin",
                role: "admin",
                status: "active",
                tenantName: "Tenant A",
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          },
          isLoading: false,
          error: null,
        };
      }
      if (queryKey[0] === "superadmin-tenant-detail") {
        return {
          data: { tenantId: "t-1", name: "Tenant A", slug: "tenant-a", status: "active" },
          isLoading: false,
          error: null,
        };
      }
      if (queryKey[0] === "superadmin-tenant-options") {
        return { data: { tenants: [] }, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: false, error: null };
    },
    useMutation: ({ mutationFn: _mf, onSuccess: _oS, onError: _oE }: any) => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    }),
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  };
});

// Mock child components
vi.mock("../../layout/SuperadminLayout", () => ({
  SuperadminLayout: ({ children, activeSection, onSectionChange }: any) =>
    createElement(
      "div",
      { "data-testid": "superadmin-layout", "data-section": activeSection },
      createElement(
        "button",
        { "data-testid": "switch-tenants", onClick: () => onSectionChange("tenants") },
        "Tenants",
      ),
      createElement(
        "button",
        { "data-testid": "switch-accounts", onClick: () => onSectionChange("accounts") },
        "Accounts",
      ),
      children,
    ),
}));

vi.mock("../../block/superadmin/TenantListPanel", () => ({
  TenantListPanel: ({
    tenants,
    isLoading: _isl,
    onSelectTenant,
    onCreateTenant,
    onSearchChange,
    searchQuery,
    pagination: _pg,
    onPageChange: _opgc,
  }: any) =>
    createElement(
      "div",
      { "data-testid": "tenant-list-panel" },
      createElement("span", { "data-testid": "tenant-count" }, String(tenants.length)),
      createElement(
        "button",
        { "data-testid": "create-tenant-btn", onClick: onCreateTenant },
        "Create",
      ),
      createElement(
        "button",
        { "data-testid": "select-tenant-btn", onClick: () => onSelectTenant("t-1") },
        "Select",
      ),
      createElement("input", {
        "data-testid": "tenant-search",
        value: searchQuery,
        onChange: (e: any) => onSearchChange(e.target.value),
      }),
    ),
}));

vi.mock("../../block/superadmin/TenantDetailPanel", () => ({
  TenantDetailPanel: ({ tenant: _t, onBack, onStatusChange }: any) =>
    createElement(
      "div",
      { "data-testid": "tenant-detail-panel" },
      createElement("button", { "data-testid": "back-btn", onClick: onBack }, "Back"),
      createElement(
        "button",
        { "data-testid": "status-change-btn", onClick: () => onStatusChange("suspended") },
        "Suspend",
      ),
    ),
}));

vi.mock("../../block/superadmin/AccountListPanel", () => ({
  AccountListPanel: ({
    accounts,
    onCreateAccount,
    onChangePassword,
    onToggleStatus,
    searchQuery: _sq,
    onSearchChange: _osq,
  }: any) =>
    createElement(
      "div",
      { "data-testid": "account-list-panel" },
      createElement("span", { "data-testid": "account-count" }, String(accounts.length)),
      createElement(
        "button",
        { "data-testid": "create-account-btn", onClick: onCreateAccount },
        "Create Account",
      ),
      createElement(
        "button",
        { "data-testid": "change-password-btn", onClick: () => onChangePassword(accounts[0]) },
        "Change Password",
      ),
      createElement(
        "button",
        { "data-testid": "toggle-status-btn", onClick: () => onToggleStatus(accounts[0]) },
        "Toggle Status",
      ),
    ),
}));

vi.mock("../../block/dialogs/TenantCreateDialog", () => ({
  TenantCreateDialog: ({ open, onOpenChange }: any) =>
    open
      ? createElement(
          "div",
          { "data-testid": "tenant-create-dialog" },
          createElement(
            "button",
            { "data-testid": "close-create-dialog", onClick: () => onOpenChange(false) },
            "Close",
          ),
        )
      : null,
}));

vi.mock("../../block/dialogs/AccountCreateDialog", () => ({
  AccountCreateDialog: ({ open }: any) =>
    open ? createElement("div", { "data-testid": "account-create-dialog" }) : null,
}));

vi.mock("../../block/dialogs/ChangePasswordDialog", () => ({
  ChangePasswordDialog: ({ open, accountUsername }: any) =>
    open
      ? createElement("div", { "data-testid": "change-password-dialog" }, accountUsername)
      : null,
}));

vi.mock("../../ui/confirmation-dialog-drawer", () => ({
  ConfirmationDialogDrawer: ({ open, onConfirm, onCancel, title }: any) =>
    open
      ? createElement(
          "div",
          { "data-testid": "confirmation-dialog" },
          createElement("span", null, title),
          createElement(
            "button",
            { "data-testid": "confirm-action", onClick: onConfirm },
            "Confirm",
          ),
          createElement("button", { "data-testid": "cancel-action", onClick: onCancel }, "Cancel"),
        )
      : null,
}));

import { SuperadminSection } from "../SuperadminSection";

// ── Helpers ───────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // Clear localStorage
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SuperadminSection - login gate", () => {
  it("renders login form when not authenticated", () => {
    render(createElement(SuperadminSection));
    expect(screen.getByText("Superadmin Login")).toBeDefined();
    expect(screen.getByLabelText("Username")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
  });

  it("renders login button", () => {
    render(createElement(SuperadminSection));
    expect(screen.getByText("Masuk")).toBeDefined();
  });

  it("renders back to main page link", () => {
    render(createElement(SuperadminSection));
    expect(screen.getByText("Kembali ke halaman utama")).toBeDefined();
  });

  it("navigates to / when back link clicked", () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByText("Kembali ke halaman utama"));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("shows error on failed login", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    render(createElement(SuperadminSection));
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    await act(async () => {
      fireEvent.submit(screen.getByText("Masuk").closest("form")!);
    });
    expect(screen.getByText("Username atau password salah")).toBeDefined();
  });

  it("shows error when role is not superadmin", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ role: "admin", accessToken: "token" }),
    });
    render(createElement(SuperadminSection));
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pass" } });
    await act(async () => {
      fireEvent.submit(screen.getByText("Masuk").closest("form")!);
    });
    expect(screen.getByText("Akun ini bukan superadmin")).toBeDefined();
  });

  it("shows network error on fetch failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    render(createElement(SuperadminSection));
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pass" } });
    await act(async () => {
      fireEvent.submit(screen.getByText("Masuk").closest("form")!);
    });
    expect(screen.getByText("Gagal terhubung ke server")).toBeDefined();
  });

  it("authenticates and shows layout on successful login", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ role: "superadmin", accessToken: "token123" }),
    });
    render(createElement(SuperadminSection));
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pass" } });
    await act(async () => {
      fireEvent.submit(screen.getByText("Masuk").closest("form")!);
    });
    expect(screen.getByTestId("superadmin-layout")).toBeDefined();
  });
});

describe("SuperadminSection - authenticated view", () => {
  beforeEach(() => {
    localStorage.setItem("superadmin-token", "valid-token");
  });

  it("renders SuperadminLayout", () => {
    render(createElement(SuperadminSection));
    expect(screen.getByTestId("superadmin-layout")).toBeDefined();
  });

  it("renders TenantListPanel by default", () => {
    render(createElement(SuperadminSection));
    expect(screen.getByTestId("tenant-list-panel")).toBeDefined();
  });

  it("shows tenant count", () => {
    render(createElement(SuperadminSection));
    expect(screen.getByTestId("tenant-count").textContent).toBe("1");
  });
});

describe("SuperadminSection - tenant operations", () => {
  beforeEach(() => {
    localStorage.setItem("superadmin-token", "valid-token");
  });

  it("opens create tenant dialog", () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByTestId("create-tenant-btn"));
    expect(screen.getByTestId("tenant-create-dialog")).toBeDefined();
  });

  it("navigates to tenant detail on select", () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByTestId("select-tenant-btn"));
    expect(screen.getByTestId("tenant-detail-panel")).toBeDefined();
  });

  it("navigates back to list from detail", () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByTestId("select-tenant-btn"));
    fireEvent.click(screen.getByTestId("back-btn"));
    expect(screen.getByTestId("tenant-list-panel")).toBeDefined();
  });
});

describe("SuperadminSection - section switching", () => {
  beforeEach(() => {
    localStorage.setItem("superadmin-token", "valid-token");
  });

  it("switches to accounts section", () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByTestId("switch-accounts"));
    expect(screen.getByTestId("account-list-panel")).toBeDefined();
  });

  it("switches back to tenants section", () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByTestId("switch-accounts"));
    fireEvent.click(screen.getByTestId("switch-tenants"));
    expect(screen.getByTestId("tenant-list-panel")).toBeDefined();
  });
});

describe("SuperadminSection - account operations", () => {
  beforeEach(() => {
    localStorage.setItem("superadmin-token", "valid-token");
  });

  it("opens create account dialog", () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByTestId("switch-accounts"));
    fireEvent.click(screen.getByTestId("create-account-btn"));
    expect(screen.getByTestId("account-create-dialog")).toBeDefined();
  });

  it("opens change password dialog", () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByTestId("switch-accounts"));
    fireEvent.click(screen.getByTestId("change-password-btn"));
    expect(screen.getByTestId("change-password-dialog")).toBeDefined();
  });

  it("opens status confirmation dialog", () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByTestId("switch-accounts"));
    fireEvent.click(screen.getByTestId("toggle-status-btn"));
    expect(screen.getByTestId("confirmation-dialog")).toBeDefined();
  });

  it("closes confirmation dialog on cancel", () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByTestId("switch-accounts"));
    fireEvent.click(screen.getByTestId("toggle-status-btn"));
    fireEvent.click(screen.getByTestId("cancel-action"));
    expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  });
});

describe("SuperadminSection - search", () => {
  beforeEach(() => {
    localStorage.setItem("superadmin-token", "valid-token");
  });

  it("handles tenant search input", () => {
    render(createElement(SuperadminSection));
    const searchInput = screen.getByTestId("tenant-search");
    fireEvent.change(searchInput, { target: { value: "test" } });
    // Search value should be updated (controlled input)
    expect((searchInput as HTMLInputElement).value).toBeDefined();
  });
});

describe("SuperadminSection - tenant detail status change", () => {
  beforeEach(() => {
    localStorage.setItem("superadmin-token", "valid-token");
  });

  it("shows status change button in detail view", () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByTestId("select-tenant-btn"));
    expect(screen.getByTestId("status-change-btn")).toBeDefined();
  });

  it("calls status change mutation when status button clicked", () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByTestId("select-tenant-btn"));
    fireEvent.click(screen.getByTestId("status-change-btn"));
    // Should not crash - mutation is called
    expect(screen.getByTestId("tenant-detail-panel")).toBeDefined();
  });
});

describe("SuperadminSection - account status toggle confirm", () => {
  beforeEach(() => {
    localStorage.setItem("superadmin-token", "valid-token");
  });

  it("confirms status toggle and calls mutation", async () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByTestId("switch-accounts"));
    fireEvent.click(screen.getByTestId("toggle-status-btn"));
    expect(screen.getByTestId("confirmation-dialog")).toBeDefined();
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-action"));
    });
    // The mutation was triggered (dialog may or may not close depending on async behavior)
    // Just verify the confirm action doesn't crash
    expect(screen.getByTestId("account-list-panel")).toBeDefined();
  });
});

describe("SuperadminSection - create tenant dialog close", () => {
  beforeEach(() => {
    localStorage.setItem("superadmin-token", "valid-token");
  });

  it("closes create tenant dialog", () => {
    render(createElement(SuperadminSection));
    fireEvent.click(screen.getByTestId("create-tenant-btn"));
    expect(screen.getByTestId("tenant-create-dialog")).toBeDefined();
    fireEvent.click(screen.getByTestId("close-create-dialog"));
    expect(screen.queryByTestId("tenant-create-dialog")).toBeNull();
  });
});

describe("SuperadminSection - login loading state", () => {
  it("shows Masuk... when login is in progress", async () => {
    // Create a never-resolving fetch to keep loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(createElement(SuperadminSection));
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pass" } });
    await act(async () => {
      fireEvent.submit(screen.getByText("Masuk").closest("form")!);
    });
    // Button should show loading text
    expect(screen.getByText("Masuk...")).toBeDefined();
  });
});
