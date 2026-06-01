// @vitest-environment jsdom
/**
 * Tests for src/components/block/loginSection/LoginFormPanel.tsx
 *
 * Covers:
 * - Renders all form fields and buttons
 * - Shows selected server tenant name
 * - Shows error message when error prop is set
 * - Shows loading state when loading=true
 * - Calls callbacks on user interactions
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, createRef } from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../layout/AuthLayout", () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-layout">{children}</div>
  ),
}));

vi.mock("#/components/block/LoadingState", () => ({
  LoadingState: ({ variant }: { variant?: string }) => (
    <span data-testid={`loading-${variant ?? "default"}`}>Loading...</span>
  ),
}));

vi.mock("../../ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: string;
  }) => (
    <button
      type={(type ?? "button") as "button" | "submit" | "reset"}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  ),
}));

vi.mock("../../ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("../../ui/label", () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

vi.mock("../../ui/password-input", () => ({
  PasswordInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="password" {...props} />
  ),
}));

vi.mock("lucide-react", () => ({
  BookOpen: () => <span />,
  Layers: () => <span />,
  Loader2Icon: () => <span data-testid="loader2-icon" />,
  Plus: () => <span />,
  Search: () => <span />,
  Settings: () => <span />,
}));

import { LoginFormPanel } from "../LoginFormPanel";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDefaultProps(overrides: Record<string, unknown> = {}) {
  return {
    username: "",
    password: "",
    tenantSlug: "",
    error: null,
    loading: false,
    selectedServerTenant: null,
    appName: "Koperasi Kegelapan",
    byline: "By Ahmad Muzaki",
    passwordRef: createRef<HTMLInputElement | null>(),
    onUsernameChange: vi.fn(),
    onPasswordChange: vi.fn(),
    onTenantSlugChange: vi.fn(),
    onSubmit: vi.fn(),
    onOpenServerBrowse: vi.fn(),
    onStartSetup: vi.fn(),
    onStartDeviceSetup: vi.fn(),
    onViewRegisteredTenants: vi.fn(),
    onOpenScoutBrowse: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LoginFormPanel", () => {
  it("renders the login heading", () => {
    render(createElement(LoginFormPanel, makeDefaultProps()));
    expect(screen.getByRole("heading", { name: "Masuk" })).toBeDefined();
  });

  it("renders username and password inputs", () => {
    render(createElement(LoginFormPanel, makeDefaultProps()));
    expect(screen.getByPlaceholderText("Masukkan username")).toBeDefined();
    expect(screen.getByPlaceholderText("masukkan password")).toBeDefined();
  });

  it("renders tenant slug input", () => {
    render(createElement(LoginFormPanel, makeDefaultProps()));
    expect(screen.getByPlaceholderText("slug koperasi")).toBeDefined();
  });

  it("shows default subtitle when no server tenant selected", () => {
    render(createElement(LoginFormPanel, makeDefaultProps()));
    expect(screen.getByText("Masuk dengan akun lokal atau server")).toBeDefined();
  });

  it("shows selected server tenant name in subtitle", () => {
    render(
      createElement(
        LoginFormPanel,
        makeDefaultProps({
          selectedServerTenant: { tenantId: "t-1", name: "Koperasi Maju", slug: "koperasi-maju" },
        }),
      ),
    );
    expect(screen.getByText("Login ke Koperasi Maju")).toBeDefined();
  });

  it("shows checkmark with tenant name when server tenant is selected", () => {
    render(
      createElement(
        LoginFormPanel,
        makeDefaultProps({
          selectedServerTenant: { tenantId: "t-1", name: "Koperasi Maju", slug: "koperasi-maju" },
        }),
      ),
    );
    expect(screen.getByText("✓ Koperasi Maju")).toBeDefined();
  });

  it("does not show checkmark when no server tenant selected", () => {
    render(createElement(LoginFormPanel, makeDefaultProps()));
    expect(screen.queryByText(/✓/)).toBeNull();
  });

  it("shows error message when error prop is set", () => {
    render(
      createElement(LoginFormPanel, makeDefaultProps({ error: "Username atau password salah" })),
    );
    expect(screen.getByText("Username atau password salah")).toBeDefined();
  });

  it("does not show error when error is null", () => {
    render(createElement(LoginFormPanel, makeDefaultProps({ error: null })));
    expect(screen.queryByText("Username atau password salah")).toBeNull();
  });

  it("shows loading state when loading=true", () => {
    render(createElement(LoginFormPanel, makeDefaultProps({ loading: true })));
    expect(screen.getByTestId("loading-button")).toBeDefined();
  });

  it("shows Masuk text when loading=false", () => {
    render(createElement(LoginFormPanel, makeDefaultProps({ loading: false })));
    // The submit button text - use role to be specific
    expect(screen.getByRole("button", { name: "Masuk" })).toBeDefined();
  });

  it("disables submit button when loading=true", () => {
    render(createElement(LoginFormPanel, makeDefaultProps({ loading: true })));
    // Find the submit button by type
    const form = screen.getByPlaceholderText("Masukkan username").closest("form")!;
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it("renders app name and byline", () => {
    render(createElement(LoginFormPanel, makeDefaultProps()));
    expect(screen.getByText("Koperasi Kegelapan · By Ahmad Muzaki")).toBeDefined();
  });

  it("calls onOpenServerBrowse when search button is clicked", async () => {
    const onOpenServerBrowse = vi.fn();
    render(createElement(LoginFormPanel, makeDefaultProps({ onOpenServerBrowse })));
    const searchBtn = screen.getByTitle("Cari koperasi di server");
    await userEvent.click(searchBtn);
    expect(onOpenServerBrowse).toHaveBeenCalledOnce();
  });

  it("calls onStartSetup when 'Daftarkan koperasi baru' is clicked", async () => {
    const onStartSetup = vi.fn();
    render(createElement(LoginFormPanel, makeDefaultProps({ onStartSetup })));
    await userEvent.click(screen.getByText("Daftarkan koperasi baru"));
    expect(onStartSetup).toHaveBeenCalledOnce();
  });

  it("calls onStartDeviceSetup when 'Pasang Perangkat' is clicked", async () => {
    const onStartDeviceSetup = vi.fn();
    render(createElement(LoginFormPanel, makeDefaultProps({ onStartDeviceSetup })));
    await userEvent.click(screen.getByText("Pasang Perangkat"));
    expect(onStartDeviceSetup).toHaveBeenCalledOnce();
  });

  it("calls onOpenScoutBrowse when 'Buka Scout' is clicked", async () => {
    const onOpenScoutBrowse = vi.fn();
    render(createElement(LoginFormPanel, makeDefaultProps({ onOpenScoutBrowse })));
    await userEvent.click(screen.getByText("Buka Scout"));
    expect(onOpenScoutBrowse).toHaveBeenCalledOnce();
  });

  it("calls onViewRegisteredTenants when 'Lihat tenant terdaftar' is clicked", async () => {
    const onViewRegisteredTenants = vi.fn();
    render(createElement(LoginFormPanel, makeDefaultProps({ onViewRegisteredTenants })));
    await userEvent.click(screen.getByText("Lihat tenant terdaftar"));
    expect(onViewRegisteredTenants).toHaveBeenCalledOnce();
  });

  it("calls onUsernameChange when username input changes", async () => {
    const onUsernameChange = vi.fn();
    render(createElement(LoginFormPanel, makeDefaultProps({ onUsernameChange })));
    const input = screen.getByPlaceholderText("Masukkan username");
    await userEvent.type(input, "admin");
    expect(onUsernameChange).toHaveBeenCalled();
  });

  it("calls onPasswordChange when password input changes", async () => {
    const onPasswordChange = vi.fn();
    render(createElement(LoginFormPanel, makeDefaultProps({ onPasswordChange })));
    const input = screen.getByPlaceholderText("masukkan password");
    await userEvent.type(input, "pass");
    expect(onPasswordChange).toHaveBeenCalled();
  });

  it("calls onTenantSlugChange when tenant slug input changes", async () => {
    const onTenantSlugChange = vi.fn();
    render(createElement(LoginFormPanel, makeDefaultProps({ onTenantSlugChange })));
    const input = screen.getByPlaceholderText("slug koperasi");
    await userEvent.type(input, "my-koperasi");
    expect(onTenantSlugChange).toHaveBeenCalled();
  });

  it("calls onSubmit when form is submitted", () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    render(createElement(LoginFormPanel, makeDefaultProps({ onSubmit })));
    const form = screen.getByPlaceholderText("Masukkan username").closest("form")!;
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("shows current username value in input", () => {
    render(createElement(LoginFormPanel, makeDefaultProps({ username: "testuser" })));
    const input = screen.getByPlaceholderText("Masukkan username") as HTMLInputElement;
    expect(input.value).toBe("testuser");
  });

  it("shows current tenantSlug value in input", () => {
    render(createElement(LoginFormPanel, makeDefaultProps({ tenantSlug: "my-koperasi" })));
    const input = screen.getByPlaceholderText("slug koperasi") as HTMLInputElement;
    expect(input.value).toBe("my-koperasi");
  });
});
