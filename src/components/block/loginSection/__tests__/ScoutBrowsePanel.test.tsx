// @vitest-environment jsdom
/**
 * Tests for src/components/block/loginSection/ScoutBrowsePanel.tsx
 *
 * Covers:
 * - Renders heading and description
 * - Manual slug entry form
 * - Offline message when not online and no local tenants
 * - Local tenants list rendering and selection
 * - Server search section (online only)
 * - Loading, error, no-results states
 * - Server result selection
 * - Back button
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../layout/AuthLayout", () => ({
  AuthLayout: ({
    children,
    headerSubtitle,
  }: {
    children: React.ReactNode;
    headerSubtitle?: string;
  }) => (
    <div data-testid="auth-layout" data-subtitle={headerSubtitle}>
      {children}
    </div>
  ),
}));

vi.mock("#/components/block/LoadingState", () => ({
  LoadingState: ({ text }: { text?: string }) => (
    <div data-testid="loading-state">{text ?? "Loading..."}</div>
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

vi.mock("lucide-react", () => ({
  ArrowLeft: () => <span />,
  BookOpen: () => <span />,
  Loader2Icon: () => <span data-testid="loader2-icon" />,
  Search: () => <span />,
  WifiOff: () => <span />,
}));

import { ScoutBrowsePanel } from "../ScoutBrowsePanel";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDefaultProps(overrides: Record<string, unknown> = {}) {
  return {
    query: "",
    results: [],
    loading: false,
    error: null,
    isOnline: true,
    localTenants: [],
    onQueryChange: vi.fn(),
    onSelectServer: vi.fn(),
    onSelectLocal: vi.fn(),
    onEnterSlug: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ScoutBrowsePanel", () => {
  it("renders the heading", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps()));
    expect(screen.getByRole("heading", { name: "Buka Scout" })).toBeDefined();
  });

  it("renders the description", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps()));
    expect(screen.getByText(/Pilih koperasi untuk membuka halaman Scout/)).toBeDefined();
  });

  it("renders the manual slug input", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps()));
    expect(screen.getByPlaceholderText("slug-koperasi")).toBeDefined();
  });

  it("disables 'Buka' button when manual slug is empty", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps()));
    const bukaBtn = screen.getByText("Buka");
    expect((bukaBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables 'Buka' button when manual slug is entered", async () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps()));
    const input = screen.getByPlaceholderText("slug-koperasi");
    await userEvent.type(input, "my-koperasi");
    const bukaBtn = screen.getByText("Buka");
    expect((bukaBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("calls onEnterSlug with trimmed lowercase slug on form submit", async () => {
    const onEnterSlug = vi.fn();
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ onEnterSlug })));
    const input = screen.getByPlaceholderText("slug-koperasi");
    await userEvent.type(input, "my-koperasi");
    const form = input.closest("form")!;
    fireEvent.submit(form);
    expect(onEnterSlug).toHaveBeenCalledWith("my-koperasi");
  });

  it("does not call onEnterSlug when slug is empty", () => {
    const onEnterSlug = vi.fn();
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ onEnterSlug })));
    const form = screen.getByPlaceholderText("slug-koperasi").closest("form")!;
    fireEvent.submit(form);
    expect(onEnterSlug).not.toHaveBeenCalled();
  });

  it("strips non-slug characters from manual input", async () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps()));
    const input = screen.getByPlaceholderText("slug-koperasi") as HTMLInputElement;
    await userEvent.type(input, "My Koperasi!");
    // Only lowercase letters, digits, and hyphens should remain
    expect(input.value).toMatch(/^[a-z0-9-]*$/);
  });

  it("shows offline message when not online and no local tenants", () => {
    render(
      createElement(ScoutBrowsePanel, makeDefaultProps({ isOnline: false, localTenants: [] })),
    );
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByText(/offline/i)).toBeDefined();
  });

  it("does not show offline message when online", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ isOnline: true })));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not show offline message when offline but local tenants exist", () => {
    const localTenants = [
      {
        tenantId: "t-1",
        slug: "koperasi-a",
        name: "Koperasi A",
        timezone: "UTC",
        mode: "local" as const,
        createdAt: 0,
      },
    ];
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ isOnline: false, localTenants })));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders local tenants list when localTenants is non-empty", () => {
    const localTenants = [
      {
        tenantId: "t-1",
        slug: "koperasi-a",
        name: "Koperasi A",
        timezone: "UTC",
        mode: "local" as const,
        createdAt: 0,
      },
      {
        tenantId: "t-2",
        slug: "koperasi-b",
        name: "Koperasi B",
        timezone: "UTC",
        mode: "local" as const,
        createdAt: 0,
      },
    ];
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ localTenants })));
    expect(screen.getByText("Koperasi A")).toBeDefined();
    expect(screen.getByText("Koperasi B")).toBeDefined();
  });

  it("calls onSelectLocal when a local tenant is clicked", async () => {
    const onSelectLocal = vi.fn();
    const localTenants = [
      {
        tenantId: "t-1",
        slug: "koperasi-a",
        name: "Koperasi A",
        timezone: "UTC",
        mode: "local" as const,
        createdAt: 0,
      },
    ];
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ localTenants, onSelectLocal })));
    await userEvent.click(screen.getByText("Koperasi A").closest("button")!);
    expect(onSelectLocal).toHaveBeenCalledWith(localTenants[0]);
  });

  it("shows server search section when online", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ isOnline: true })));
    expect(screen.getByPlaceholderText("Cari koperasi...")).toBeDefined();
  });

  it("does not show server search section when offline", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ isOnline: false })));
    expect(screen.queryByPlaceholderText("Cari koperasi...")).toBeNull();
  });

  it("shows loading state when loading=true", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ loading: true, isOnline: true })));
    expect(screen.getByTestId("loading-state")).toBeDefined();
  });
  it("shows error message when error is set", () => {
    render(
      createElement(ScoutBrowsePanel, makeDefaultProps({ error: "Koneksi gagal", isOnline: true })),
    );
    expect(screen.getByText("Koneksi gagal")).toBeDefined();
  });

  it("shows 'no results' when query >= 2 chars and no results", () => {
    render(
      createElement(
        ScoutBrowsePanel,
        makeDefaultProps({ query: "ko", results: [], isOnline: true }),
      ),
    );
    expect(screen.getByText("Tidak ada koperasi yang cocok")).toBeDefined();
  });

  it("does not show 'no results' when query < 2 chars", () => {
    render(
      createElement(
        ScoutBrowsePanel,
        makeDefaultProps({ query: "k", results: [], isOnline: true }),
      ),
    );
    expect(screen.queryByText("Tidak ada koperasi yang cocok")).toBeNull();
  });

  it("renders server search results", () => {
    const results = [
      { tenantId: "t-1", name: "Koperasi Server A", slug: "koperasi-server-a" },
      { tenantId: "t-2", name: "Koperasi Server B", slug: "koperasi-server-b" },
    ];
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ results, isOnline: true })));
    expect(screen.getByText("Koperasi Server A")).toBeDefined();
    expect(screen.getByText("Koperasi Server B")).toBeDefined();
  });

  it("calls onSelectServer when a server result is clicked", async () => {
    const onSelectServer = vi.fn();
    const results = [{ tenantId: "t-1", name: "Koperasi Server A", slug: "koperasi-server-a" }];
    render(
      createElement(
        ScoutBrowsePanel,
        makeDefaultProps({ results, isOnline: true, onSelectServer }),
      ),
    );
    await userEvent.click(screen.getByText("Koperasi Server A").closest("button")!);
    expect(onSelectServer).toHaveBeenCalledWith(results[0]);
  });

  it("calls onQueryChange when search input changes", async () => {
    const onQueryChange = vi.fn();
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ isOnline: true, onQueryChange })));
    const input = screen.getByPlaceholderText("Cari koperasi...");
    await userEvent.type(input, "ko");
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("calls onBack when back button is clicked", async () => {
    const onBack = vi.fn();
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ onBack })));
    await userEvent.click(screen.getByText("Kembali"));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows local tenant slug below name", () => {
    const localTenants = [
      {
        tenantId: "t-1",
        slug: "koperasi-a",
        name: "Koperasi A",
        timezone: "UTC",
        mode: "local" as const,
        createdAt: 0,
      },
    ];
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ localTenants })));
    expect(screen.getByText("koperasi-a")).toBeDefined();
  });

  it("shows server result slug below name", () => {
    const results = [{ tenantId: "t-1", name: "Koperasi Server A", slug: "koperasi-server-a" }];
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ results, isOnline: true })));
    expect(screen.getByText("koperasi-server-a")).toBeDefined();
  });
});
