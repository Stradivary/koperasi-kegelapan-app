// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../layout/AuthLayout", () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-layout">{children}</div>
  ),
}));

vi.mock("#/components/block/LoadingState", () => ({
  LoadingState: ({ text }: { text?: string }) => (
    <div data-testid="loading-state">{text ?? "Memuat..."}</div>
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
  Search: () => <span />,
  WifiOff: () => <span />,
}));

import { ServerBrowsePanel } from "../ServerBrowsePanel";

const defaultProps = {
  query: "",
  results: [],
  loading: false,
  error: null,
  isOnline: true,
  onQueryChange: vi.fn(),
  onSelect: vi.fn(),
  onBack: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ServerBrowsePanel", () => {
  it("renders the search input", () => {
    render(<ServerBrowsePanel {...defaultProps} />);
    expect(screen.getByPlaceholderText("Cari koperasi...")).toBeDefined();
  });

  it("shows offline message when not online", () => {
    render(<ServerBrowsePanel {...defaultProps} isOnline={false} />);
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByText(/offline/i)).toBeDefined();
  });

  it("disables search input when offline", () => {
    render(<ServerBrowsePanel {...defaultProps} isOnline={false} />);
    const input = screen.getByPlaceholderText("Offline - tidak bisa mencari");
    expect(input).toHaveProperty("disabled", true);
  });

  it("shows loading state when loading is true", () => {
    render(<ServerBrowsePanel {...defaultProps} loading={true} />);
    expect(screen.getByTestId("loading-state")).toBeDefined();
  });

  it("does not show loading state when loading is false", () => {
    render(<ServerBrowsePanel {...defaultProps} loading={false} />);
    expect(screen.queryByTestId("loading-state")).toBeNull();
  });

  it("shows error message when error is provided", () => {
    render(<ServerBrowsePanel {...defaultProps} error="Koneksi gagal" />);
    expect(screen.getByText("Koneksi gagal")).toBeDefined();
  });

  it("shows 'no results' message when query >= 2 chars and no results", () => {
    render(<ServerBrowsePanel {...defaultProps} query="ko" results={[]} />);
    expect(screen.getByText("Tidak ada koperasi yang cocok")).toBeDefined();
  });

  it("does not show 'no results' when query < 2 chars", () => {
    render(<ServerBrowsePanel {...defaultProps} query="k" results={[]} />);
    expect(screen.queryByText("Tidak ada koperasi yang cocok")).toBeNull();
  });

  it("renders search results", () => {
    const results = [
      { tenantId: "t-1", name: "Koperasi A", slug: "koperasi-a" },
      { tenantId: "t-2", name: "Koperasi B", slug: "koperasi-b" },
    ];
    render(<ServerBrowsePanel {...defaultProps} results={results} />);
    expect(screen.getByText("Koperasi A")).toBeDefined();
    expect(screen.getByText("Koperasi B")).toBeDefined();
  });

  it("calls onSelect when a result is clicked", async () => {
    const onSelect = vi.fn();
    const results = [{ tenantId: "t-1", name: "Koperasi A", slug: "koperasi-a" }];
    render(<ServerBrowsePanel {...defaultProps} results={results} onSelect={onSelect} />);
    await userEvent.click(screen.getByText("Koperasi A").closest("button")!);
    expect(onSelect).toHaveBeenCalledWith(results[0]);
  });

  it("calls onQueryChange when input changes", async () => {
    const onQueryChange = vi.fn();
    render(<ServerBrowsePanel {...defaultProps} onQueryChange={onQueryChange} />);
    const input = screen.getByPlaceholderText("Cari koperasi...");
    await userEvent.type(input, "ko");
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("calls onBack when back button is clicked", async () => {
    const onBack = vi.fn();
    render(<ServerBrowsePanel {...defaultProps} onBack={onBack} />);
    await userEvent.click(screen.getByText("Kembali"));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
