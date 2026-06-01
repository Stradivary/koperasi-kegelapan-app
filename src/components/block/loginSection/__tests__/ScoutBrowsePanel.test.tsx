// @vitest-environment jsdom
/**
 * Tests for src/components/block/loginSection/ScoutBrowsePanel.tsx
 *
 * Covers:
 * - Renders heading and description
 * - Unified search / slug entry form (single input, context-aware placeholder)
 * - Buka button visibility (only when query has content)
 * - Offline message when not online and no local tenants
 * - Local tenants list rendering and selection (offline only)
 * - Server search results (online only)
 * - Loading, error, no-results states
 * - slugError alert
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

vi.mock("lucide-react", () => ({
  ArrowLeft: () => <span />,
  BookOpen: () => <span />,
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
    slugError: null,
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
    expect(screen.getByText(/Cari koperasi untuk membuka halaman Scout/)).toBeDefined();
  });

  it("renders the unified search input with online placeholder", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ isOnline: true })));
    expect(screen.getByPlaceholderText("Cari atau ketik slug koperasi...")).toBeDefined();
  });

  it("renders the unified search input with offline placeholder", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ isOnline: false })));
    expect(screen.getByPlaceholderText("Cari koperasi lokal...")).toBeDefined();
  });

  it("does not show 'Buka' button when query is empty", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ query: "" })));
    expect(screen.queryByText("Buka")).toBeNull();
  });

  it("shows 'Buka' button when query has content", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ query: "my-koperasi" })));
    expect(screen.getByText("Buka")).toBeDefined();
  });

  it("calls onQueryChange when input changes", async () => {
    const onQueryChange = vi.fn();
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ onQueryChange })));
    const input = screen.getByPlaceholderText("Cari atau ketik slug koperasi...");
    await userEvent.type(input, "ko");
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("calls onEnterSlug with trimmed lowercase query on form submit", () => {
    const onEnterSlug = vi.fn();
    render(
      createElement(ScoutBrowsePanel, makeDefaultProps({ query: "my-koperasi", onEnterSlug })),
    );
    const form = screen.getByPlaceholderText("Cari atau ketik slug koperasi...").closest("form")!;
    fireEvent.submit(form);
    expect(onEnterSlug).toHaveBeenCalledWith("my-koperasi");
  });

  it("does not call onEnterSlug when query is empty on submit", () => {
    const onEnterSlug = vi.fn();
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ query: "", onEnterSlug })));
    fireEvent.submit(document.querySelector("form")!);
    expect(onEnterSlug).not.toHaveBeenCalled();
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

  // Single list block renders all local tenants when offline
  it("renders local tenants list when offline and localTenants is non-empty", () => {
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
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ isOnline: false, localTenants })));
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
    render(
      createElement(
        ScoutBrowsePanel,
        makeDefaultProps({ isOnline: false, localTenants, onSelectLocal }),
      ),
    );
    await userEvent.click(screen.getByText("Koperasi A").closest("button")!);
    expect(onSelectLocal).toHaveBeenCalledWith(localTenants[0]);
  });

  it("does not render local tenants when online", () => {
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
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ isOnline: true, localTenants })));
    expect(screen.queryByText("Koperasi A")).toBeNull();
  });

  it("shows loading state when loading=true and online", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ loading: true, isOnline: true })));
    expect(screen.getByTestId("loading-state")).toBeDefined();
  });

  it("shows error message when error is set", () => {
    render(
      createElement(ScoutBrowsePanel, makeDefaultProps({ error: "Koneksi gagal", isOnline: true })),
    );
    expect(screen.getByText("Koneksi gagal")).toBeDefined();
  });

  it("shows 'no results' when query >= 2 chars and no results online", () => {
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

  it("renders server search results when online", () => {
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

  it("calls onBack when back button is clicked", async () => {
    const onBack = vi.fn();
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ onBack })));
    await userEvent.click(screen.getByText("Kembali"));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows slugError alert when slugError is set", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ slugError: "koperasi-xyz" })));
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText(/koperasi-xyz/)).toBeDefined();
  });

  it("does not show slugError alert when slugError is null", () => {
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ slugError: null })));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows offline hint inside slugError alert when offline", () => {
    render(
      createElement(
        ScoutBrowsePanel,
        makeDefaultProps({ slugError: "koperasi-xyz", isOnline: false }),
      ),
    );
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText(/Sambungkan ke internet atau pilih dari daftar lokal/)).toBeDefined();
  });

  it("does not show offline hint inside slugError alert when online", () => {
    render(
      createElement(
        ScoutBrowsePanel,
        makeDefaultProps({ slugError: "koperasi-xyz", isOnline: true }),
      ),
    );
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.queryByText(/Sambungkan ke internet atau pilih dari daftar lokal/)).toBeNull();
  });

  it("shows local tenant slug below name when offline", () => {
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
    expect(screen.getByText("koperasi-a")).toBeDefined();
  });

  it("shows server result slug below name", () => {
    const results = [{ tenantId: "t-1", name: "Koperasi Server A", slug: "koperasi-server-a" }];
    render(createElement(ScoutBrowsePanel, makeDefaultProps({ results, isOnline: true })));
    expect(screen.getByText("koperasi-server-a")).toBeDefined();
  });

  it("filters local tenants by query when offline and query is set", () => {
    const localTenants = [
      {
        tenantId: "t-1",
        slug: "koperasi-a",
        name: "Koperasi Alpha",
        timezone: "UTC",
        mode: "local" as const,
        createdAt: 0,
      },
      {
        tenantId: "t-2",
        slug: "koperasi-b",
        name: "Koperasi Beta",
        timezone: "UTC",
        mode: "local" as const,
        createdAt: 0,
      },
    ];
    render(
      createElement(
        ScoutBrowsePanel,
        makeDefaultProps({ isOnline: false, localTenants, query: "alpha" }),
      ),
    );
    expect(screen.getByText("Koperasi Alpha")).toBeDefined();
    expect(screen.queryByText("Koperasi Beta")).toBeNull();
  });

  it("shows 'no local match' message when offline query has no matches", () => {
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
    render(
      createElement(
        ScoutBrowsePanel,
        makeDefaultProps({ isOnline: false, localTenants, query: "zzz" }),
      ),
    );
    expect(screen.getByText("Tidak ada koperasi lokal yang cocok")).toBeDefined();
  });
});
