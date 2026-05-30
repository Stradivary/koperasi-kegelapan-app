// @vitest-environment jsdom
/**
 * Tests for LocalSetupSection.tsx
 * Targets: lines 41-107 (tenant step, admin step, done step)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSetup = {
  step: "tenant" as "tenant" | "admin" | "done",
  tenantName: "",
  tenantSlug: "",
  slugError: null as string | null,
  adminUsername: "",
  adminPassword: "",
  confirmPassword: "",
  error: null as string | null,
  loading: false,
  setTenantName: vi.fn(),
  setTenantSlug: vi.fn(),
  setAdminUsername: vi.fn(),
  setAdminPassword: vi.fn(),
  setConfirmPassword: vi.fn(),
  setStep: vi.fn(),
  handleNextStep: vi.fn(),
  handleSetup: vi.fn(),
};

vi.mock("#/hooks/useLocalSetup", () => ({ useLocalSetup: () => mockSetup }));
vi.mock("#/lib/slugValidation", () => ({
  createSlug: (n: string) => n.toLowerCase().replace(/\s+/g, "-"),
}));
vi.mock("#/lib/brand", () => ({ BRAND: { APP_NAME: "TestApp" } }));
vi.mock("../layout/AuthLayout", () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-layout">{children}</div>
  ),
}));
vi.mock("../ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
vi.mock("../ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("../ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));
vi.mock("#/assets/images/success_human.svg", () => ({ default: "success.svg" }));

import { LocalSetupSection } from "../LocalSetupSection";

const defaultProps = { onComplete: vi.fn(), onBack: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  mockSetup.step = "tenant";
  mockSetup.tenantName = "";
  mockSetup.tenantSlug = "";
  mockSetup.slugError = null;
  mockSetup.adminUsername = "";
  mockSetup.adminPassword = "";
  mockSetup.confirmPassword = "";
  mockSetup.error = null;
  mockSetup.loading = false;
});

afterEach(() => {
  cleanup();
});

describe("LocalSetupSection — tenant step", () => {
  it("renders tenant name and slug inputs", () => {
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByPlaceholderText("Contoh: Koperasi Maju")).toBeDefined();
    expect(screen.getByPlaceholderText("koperasi-maju")).toBeDefined();
  });

  it("calls setTenantName when name input changes", async () => {
    render(<LocalSetupSection {...defaultProps} />);
    await userEvent.type(screen.getByPlaceholderText("Contoh: Koperasi Maju"), "My Koperasi");
    expect(mockSetup.setTenantName).toHaveBeenCalled();
  });

  it("calls setTenantSlug with sanitized value when slug input changes", () => {
    render(<LocalSetupSection {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("koperasi-maju"), {
      target: { value: "My Koperasi!" },
    });
    // "My Koperasi!" → lowercase → "my koperasi!" → remove non [a-z0-9-] → "mykoperasi"
    expect(mockSetup.setTenantSlug).toHaveBeenCalledWith("mykoperasi");
  });

  it("shows slug error when slugError is set", () => {
    mockSetup.slugError = "Slug sudah digunakan";
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("Slug sudah digunakan")).toBeDefined();
  });

  it("shows helper text when no slug error", () => {
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("Biarkan kosong untuk generate otomatis")).toBeDefined();
  });

  it("calls onBack when Kembali clicked", async () => {
    render(<LocalSetupSection {...defaultProps} />);
    await userEvent.click(screen.getByText("Kembali"));
    expect(defaultProps.onBack).toHaveBeenCalledOnce();
  });

  it("calls handleNextStep when Lanjut clicked", async () => {
    mockSetup.tenantName = "My Koperasi";
    render(<LocalSetupSection {...defaultProps} />);
    await userEvent.click(screen.getByText("Lanjut"));
    expect(mockSetup.handleNextStep).toHaveBeenCalledOnce();
  });

  it("disables Lanjut when tenantName is empty", () => {
    mockSetup.tenantName = "";
    render(<LocalSetupSection {...defaultProps} />);
    const btn = screen.getByText("Lanjut").closest("button")!;
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables Lanjut when slugError is set", () => {
    mockSetup.tenantName = "My Koperasi";
    mockSetup.slugError = "error";
    render(<LocalSetupSection {...defaultProps} />);
    const btn = screen.getByText("Lanjut").closest("button")!;
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("LocalSetupSection — admin step", () => {
  beforeEach(() => {
    mockSetup.step = "admin";
    mockSetup.tenantName = "My Koperasi";
    mockSetup.tenantSlug = "my-koperasi";
  });

  it("renders admin username and password inputs", () => {
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByPlaceholderText("admin")).toBeDefined();
    expect(screen.getByPlaceholderText("Min. 6 karakter")).toBeDefined();
    expect(screen.getByPlaceholderText("Ulangi password")).toBeDefined();
  });

  it("shows suggested username based on slug", () => {
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("my-koperasi-admin")).toBeDefined();
  });

  it("shows error message when error is set", () => {
    mockSetup.error = "Password tidak cocok";
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("Password tidak cocok")).toBeDefined();
  });

  it("calls setStep('tenant') when Kembali clicked", async () => {
    render(<LocalSetupSection {...defaultProps} />);
    await userEvent.click(screen.getByText("Kembali"));
    expect(mockSetup.setStep).toHaveBeenCalledWith("tenant");
  });

  it("calls handleSetup when Selesaikan clicked", async () => {
    mockSetup.adminUsername = "admin";
    mockSetup.adminPassword = "password123";
    render(<LocalSetupSection {...defaultProps} />);
    await userEvent.click(screen.getByText("Selesaikan"));
    expect(mockSetup.handleSetup).toHaveBeenCalledOnce();
  });

  it("shows 'Menyiapkan...' when loading=true", () => {
    mockSetup.loading = true;
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("Menyiapkan...")).toBeDefined();
  });

  it("calls setAdminPassword when password input changes", () => {
    mockSetup.step = "admin";
    mockSetup.tenantName = "My Koperasi";
    render(<LocalSetupSection {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("Min. 6 karakter"), {
      target: { value: "secret123" },
    });
    expect(mockSetup.setAdminPassword).toHaveBeenCalledWith("secret123");
  });

  it("calls setConfirmPassword when confirm password input changes", () => {
    mockSetup.step = "admin";
    mockSetup.tenantName = "My Koperasi";
    render(<LocalSetupSection {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("Ulangi password"), {
      target: { value: "secret123" },
    });
    expect(mockSetup.setConfirmPassword).toHaveBeenCalledWith("secret123");
  });

  it("shows suggested username from tenantName when slug is empty", () => {
    mockSetup.step = "admin";
    mockSetup.tenantName = "My Koperasi";
    mockSetup.tenantSlug = "";
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("my-koperasi-admin")).toBeDefined();
  });

  it("disables Selesaikan when adminPassword is empty", () => {
    mockSetup.step = "admin";
    mockSetup.adminUsername = "admin";
    mockSetup.adminPassword = "";
    render(<LocalSetupSection {...defaultProps} />);
    const btn = screen.getByText("Selesaikan").closest("button")!;
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("LocalSetupSection — done step", () => {
  beforeEach(() => {
    mockSetup.step = "done";
  });

  it("shows success image and Siap text", () => {
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("Siap!")).toBeDefined();
    expect(screen.getByAltText("Setup selesai")).toBeDefined();
  });

  it("shows app name in done message", () => {
    render(<LocalSetupSection {...defaultProps} />);
    // Use getAllByText since "TestApp" may appear in multiple places
    const elements = screen.getAllByText(/TestApp/);
    expect(elements.length).toBeGreaterThan(0);
  });
});
