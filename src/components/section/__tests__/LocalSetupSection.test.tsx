// @vitest-environment jsdom
/**
 * Tests for src/components/section/LocalSetupSection.tsx
 *
 * Covers:
 * - Renders tenant info form when step is "tenant"
 * - Renders admin account form when step is "admin"
 * - Renders done/success screen when step is "done"
 * - Calls onBack when back button is pressed on tenant step
 * - Calls handleNextStep when "Lanjut" is clicked
 * - Calls handleSetup when "Selesaikan" is clicked
 * - Calls setStep("tenant") when back is pressed on admin step
 * - Shows slug error when slugError is set
 * - Shows error message when error is set on admin step
 * - Disables "Lanjut" when tenantName is empty or slugError is present
 * - Disables "Selesaikan" when loading or required fields are empty
 * - Shows "Menyiapkan..." label when loading
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUseLocalSetup = vi.fn();

vi.mock("#/hooks/useLocalSetup", () => ({
  useLocalSetup: (...args: unknown[]) => mockUseLocalSetup(...args),
}));

vi.mock("#/lib/brand", () => ({
  BRAND: {
    APP_NAME: "Test App",
    BYLINE: "By Test",
  },
}));

vi.mock("#/lib/slugValidation", () => ({
  createSlug: (name: string) => name.toLowerCase().replace(/\s+/g, "-"),
}));

// Stub layout and UI components
vi.mock("../../layout/AuthLayout", () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-layout">{children}</div>
  ),
}));

vi.mock("../../ui/button", () => ({
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

vi.mock("../../ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("../../ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

// Stub the success image import
vi.mock("#/assets/images/success_human.svg", () => ({ default: "success_human.svg" }));

import { LocalSetupSection } from "../LocalSetupSection";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDefaultSetup(overrides: Record<string, unknown> = {}) {
  return {
    step: "tenant",
    setStep: vi.fn(),
    tenantName: "",
    setTenantName: vi.fn(),
    tenantSlug: "",
    setTenantSlug: vi.fn(),
    slugError: null,
    adminUsername: "",
    setAdminUsername: vi.fn(),
    adminPassword: "",
    setAdminPassword: vi.fn(),
    confirmPassword: "",
    setConfirmPassword: vi.fn(),
    error: null,
    loading: false,
    handleNextStep: vi.fn(),
    handleSetup: vi.fn(),
    ...overrides,
  };
}

const defaultProps = {
  onComplete: vi.fn(),
  onBack: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LocalSetupSection — step: tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders tenant info form when step is tenant", () => {
    mockUseLocalSetup.mockReturnValue(makeDefaultSetup({ step: "tenant" }));
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("Informasi Koperasi")).toBeDefined();
    expect(screen.getByPlaceholderText("Contoh: Koperasi Maju")).toBeDefined();
  });

  it("renders slug input on tenant step", () => {
    mockUseLocalSetup.mockReturnValue(makeDefaultSetup({ step: "tenant" }));
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByPlaceholderText("koperasi-maju")).toBeDefined();
  });

  it("calls onBack when Kembali is clicked on tenant step", async () => {
    const onBack = vi.fn();
    mockUseLocalSetup.mockReturnValue(makeDefaultSetup({ step: "tenant" }));
    render(<LocalSetupSection onComplete={vi.fn()} onBack={onBack} />);
    await userEvent.click(screen.getByText("Kembali"));
    expect(onBack).toHaveBeenCalled();
  });

  it("calls handleNextStep when Lanjut is clicked", async () => {
    const handleNextStep = vi.fn();
    mockUseLocalSetup.mockReturnValue(
      makeDefaultSetup({ step: "tenant", tenantName: "Koperasi Maju", handleNextStep }),
    );
    render(<LocalSetupSection {...defaultProps} />);
    await userEvent.click(screen.getByText("Lanjut"));
    expect(handleNextStep).toHaveBeenCalled();
  });

  it("disables Lanjut when tenantName is empty", () => {
    mockUseLocalSetup.mockReturnValue(makeDefaultSetup({ step: "tenant", tenantName: "" }));
    render(<LocalSetupSection {...defaultProps} />);
    const btn = screen.getByText("Lanjut").closest("button");
    expect(btn?.disabled).toBe(true);
  });

  it("disables Lanjut when slugError is present", () => {
    mockUseLocalSetup.mockReturnValue(
      makeDefaultSetup({
        step: "tenant",
        tenantName: "Koperasi Maju",
        slugError: "Slug sudah digunakan",
      }),
    );
    render(<LocalSetupSection {...defaultProps} />);
    const btn = screen.getByText("Lanjut").closest("button");
    expect(btn?.disabled).toBe(true);
  });

  it("shows slug error message when slugError is set", () => {
    mockUseLocalSetup.mockReturnValue(
      makeDefaultSetup({
        step: "tenant",
        tenantName: "Koperasi Maju",
        slugError: "Slug sudah digunakan",
      }),
    );
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("Slug sudah digunakan")).toBeDefined();
  });

  it("shows helper text when no slug error", () => {
    mockUseLocalSetup.mockReturnValue(makeDefaultSetup({ step: "tenant", slugError: null }));
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("Biarkan kosong untuk generate otomatis")).toBeDefined();
  });

  it("calls setTenantName when tenant name input changes", async () => {
    const setTenantName = vi.fn();
    mockUseLocalSetup.mockReturnValue(makeDefaultSetup({ step: "tenant", setTenantName }));
    render(<LocalSetupSection {...defaultProps} />);
    const input = screen.getByPlaceholderText("Contoh: Koperasi Maju");
    await userEvent.type(input, "A");
    expect(setTenantName).toHaveBeenCalled();
  });
});

describe("LocalSetupSection — step: admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders admin account form when step is admin", () => {
    mockUseLocalSetup.mockReturnValue(
      makeDefaultSetup({ step: "admin", tenantName: "Koperasi Maju" }),
    );
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("Akun Admin")).toBeDefined();
    expect(screen.getByPlaceholderText("admin")).toBeDefined();
  });

  it("shows tenant name in admin step description", () => {
    mockUseLocalSetup.mockReturnValue(
      makeDefaultSetup({ step: "admin", tenantName: "Koperasi Maju" }),
    );
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText(/Koperasi Maju/)).toBeDefined();
  });

  it("calls setStep('tenant') when Kembali is clicked on admin step", async () => {
    const setStep = vi.fn();
    mockUseLocalSetup.mockReturnValue(
      makeDefaultSetup({ step: "admin", tenantName: "Koperasi Maju", setStep }),
    );
    render(<LocalSetupSection {...defaultProps} />);
    await userEvent.click(screen.getByText("Kembali"));
    expect(setStep).toHaveBeenCalledWith("tenant");
  });

  it("calls handleSetup when Selesaikan is clicked", async () => {
    const handleSetup = vi.fn();
    mockUseLocalSetup.mockReturnValue(
      makeDefaultSetup({
        step: "admin",
        tenantName: "Koperasi Maju",
        adminUsername: "koperasi-admin",
        adminPassword: "secret123",
        handleSetup,
      }),
    );
    render(<LocalSetupSection {...defaultProps} />);
    await userEvent.click(screen.getByText("Selesaikan"));
    expect(handleSetup).toHaveBeenCalled();
  });

  it("disables Selesaikan when loading is true", () => {
    mockUseLocalSetup.mockReturnValue(
      makeDefaultSetup({
        step: "admin",
        tenantName: "Koperasi Maju",
        adminUsername: "koperasi-admin",
        adminPassword: "secret123",
        loading: true,
      }),
    );
    render(<LocalSetupSection {...defaultProps} />);
    const btn = screen.getByText("Menyiapkan...").closest("button");
    expect(btn?.disabled).toBe(true);
  });

  it("shows Menyiapkan... label when loading", () => {
    mockUseLocalSetup.mockReturnValue(
      makeDefaultSetup({
        step: "admin",
        tenantName: "Koperasi Maju",
        adminUsername: "koperasi-admin",
        adminPassword: "secret123",
        loading: true,
      }),
    );
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("Menyiapkan...")).toBeDefined();
  });

  it("disables Selesaikan when adminUsername is empty", () => {
    mockUseLocalSetup.mockReturnValue(
      makeDefaultSetup({
        step: "admin",
        tenantName: "Koperasi Maju",
        adminUsername: "",
        adminPassword: "secret123",
      }),
    );
    render(<LocalSetupSection {...defaultProps} />);
    const btn = screen.getByText("Selesaikan").closest("button");
    expect(btn?.disabled).toBe(true);
  });

  it("disables Selesaikan when adminPassword is empty", () => {
    mockUseLocalSetup.mockReturnValue(
      makeDefaultSetup({
        step: "admin",
        tenantName: "Koperasi Maju",
        adminUsername: "koperasi-admin",
        adminPassword: "",
      }),
    );
    render(<LocalSetupSection {...defaultProps} />);
    const btn = screen.getByText("Selesaikan").closest("button");
    expect(btn?.disabled).toBe(true);
  });

  it("shows error message when error is set", () => {
    mockUseLocalSetup.mockReturnValue(
      makeDefaultSetup({
        step: "admin",
        tenantName: "Koperasi Maju",
        error: "Password tidak cocok",
      }),
    );
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("Password tidak cocok")).toBeDefined();
  });

  it("renders password and confirm password inputs", () => {
    mockUseLocalSetup.mockReturnValue(
      makeDefaultSetup({ step: "admin", tenantName: "Koperasi Maju" }),
    );
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByPlaceholderText("Min. 6 karakter")).toBeDefined();
    expect(screen.getByPlaceholderText("Ulangi password")).toBeDefined();
  });
});

describe("LocalSetupSection — step: done", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders success screen when step is done", () => {
    mockUseLocalSetup.mockReturnValue(makeDefaultSetup({ step: "done" }));
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText("Siap!")).toBeDefined();
  });

  it("shows app name in done screen", () => {
    mockUseLocalSetup.mockReturnValue(makeDefaultSetup({ step: "done" }));
    render(<LocalSetupSection {...defaultProps} />);
    expect(screen.getByText(/Test App/)).toBeDefined();
  });

  it("renders success image in done screen", () => {
    mockUseLocalSetup.mockReturnValue(makeDefaultSetup({ step: "done" }));
    render(<LocalSetupSection {...defaultProps} />);
    const img = screen.getByAltText("Setup selesai");
    expect(img).toBeDefined();
  });
});

describe("LocalSetupSection — hook integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("passes onComplete to useLocalSetup", () => {
    mockUseLocalSetup.mockReturnValue(makeDefaultSetup());
    const onComplete = vi.fn();
    render(<LocalSetupSection onComplete={onComplete} onBack={vi.fn()} />);
    expect(mockUseLocalSetup).toHaveBeenCalledWith(expect.objectContaining({ onComplete }));
  });
});
