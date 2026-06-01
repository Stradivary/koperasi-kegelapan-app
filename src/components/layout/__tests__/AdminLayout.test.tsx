// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockTenantContextStoreDelete = vi.fn();
const mockIsOnline = vi.fn().mockReturnValue({ isOnline: true });

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("#/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => mockIsOnline(),
}));

vi.mock("#/lib/indexeddb", () => ({
  tenantContextStore: {
    delete: (...args: unknown[]) => mockTenantContextStoreDelete(...args),
  },
}));

vi.mock("#/lib/utils/brand", () => ({
  BRAND: { APP_NAME: "TestApp", BYLINE: "Test Byline" },
}));

vi.mock("../block/SyncStatusIndicator", () => ({
  SyncStatusIndicator: () => <div data-testid="sync-status-indicator" />,
}));

vi.mock("../MobileBottomNav", () => ({
  MobileBottomNav: ({
    items,
    activeId,
    onSelect,
  }: {
    items: { id: string; label: string }[];
    activeId: string;
    onSelect: (id: string) => void;
  }) => (
    <nav data-testid="mobile-bottom-nav">
      {items.map((item) => (
        <button key={item.id} data-active={activeId === item.id} onClick={() => onSelect(item.id)}>
          {item.label}
        </button>
      ))}
    </nav>
  ),
}));

vi.mock("../ui/drawer", () => ({
  Drawer: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="drawer">{children}</div> : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock("../ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    className,
    title,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    title?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} className={className} title={title}>
      {children}
    </button>
  ),
}));

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    BookOpen: () => <span />,
    ChevronLeft: ({ className }: { className?: string }) => (
      <span data-testid="chevron" className={className} />
    ),
    CreditCard: () => <span />,
    Leaf: () => <span />,
    LogOut: () => <span data-testid="logout-icon" />,
    Menu: () => <span data-testid="menu-icon" />,
    Receipt: () => <span />,
    Settings: () => <span />,
    Upload: () => <span />,
    UserCheck: () => <span />,
    X: () => <span />,
  };
});

import { AdminLayout } from "../AdminLayout";

const defaultProps = {
  tenantName: "Koperasi Test",
  tenantId: "tenant-1",
  role: "admin",
  activeSection: "cards" as const,
  onSectionChange: vi.fn(),
  children: <div data-testid="content">Content</div>,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTenantContextStoreDelete.mockResolvedValue(undefined);
  mockNavigate.mockReturnValue(undefined);
  mockIsOnline.mockReturnValue({ isOnline: true });
});

afterEach(() => {
  cleanup();
});

describe("AdminLayout", () => {
  it("renders children content", () => {
    render(<AdminLayout {...defaultProps} />);
    expect(screen.getByTestId("content")).toBeDefined();
  });

  it("renders tenant name in header", () => {
    render(<AdminLayout {...defaultProps} />);
    const elements = screen.getAllByText("Koperasi Test");
    expect(elements.length).toBeGreaterThan(0);
  });

  it("renders active section label in header", () => {
    render(<AdminLayout {...defaultProps} activeSection="cards" />);
    const elements = screen.getAllByText("Kartu");
    expect(elements.length).toBeGreaterThan(0);
  });

  it("renders mobile bottom nav", () => {
    render(<AdminLayout {...defaultProps} />);
    expect(screen.getByTestId("mobile-bottom-nav")).toBeDefined();
  });

  it("shows pending count badge when pendingCount > 0", () => {
    render(<AdminLayout {...defaultProps} pendingCount={3} />);
    expect(screen.getByText("3")).toBeDefined();
  });

  it("does not show pending count when pendingCount is 0", () => {
    render(<AdminLayout {...defaultProps} pendingCount={0} />);
    expect(screen.queryByText("3")).toBeNull();
  });

  it("calls navigate when mobile nav item is clicked", async () => {
    render(<AdminLayout {...defaultProps} />);
    await userEvent.click(screen.getByText("Anggota"));
    expect(mockNavigate).toHaveBeenCalled();
  });

  it("opens mobile menu when hamburger is clicked", async () => {
    render(<AdminLayout {...defaultProps} />);
    const menuBtn = screen.getByTestId("menu-icon").closest("button")!;
    await userEvent.click(menuBtn);
    // Mobile drawer opens - "Keluar" text should now be visible
    expect(screen.getByText("Keluar")).toBeDefined();
  });

  it("navigates to / after logout via mobile menu", async () => {
    render(<AdminLayout {...defaultProps} />);
    // Open mobile menu
    const menuBtn = screen.getByTestId("menu-icon").closest("button")!;
    await userEvent.click(menuBtn);
    // Click logout
    await userEvent.click(screen.getByText("Keluar"));
    expect(mockTenantContextStoreDelete).toHaveBeenCalledWith("tenant-1");
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("shows online connectivity status indicator", () => {
    mockIsOnline.mockReturnValue({ isOnline: true });
    render(<AdminLayout {...defaultProps} />);
    const statusEls = screen.getAllByRole("status");
    expect(statusEls.length).toBeGreaterThan(0);
  });

  it("shows offline status in connectivity badge", () => {
    mockIsOnline.mockReturnValue({ isOnline: false });
    render(<AdminLayout {...defaultProps} />);
    const statusEls = screen.getAllByRole("status");
    const offlineEl = statusEls.find((el) => el.getAttribute("aria-label")?.includes("Offline"));
    expect(offlineEl).toBeDefined();
  });

  it("opens sync drawer when sync status button is clicked", async () => {
    render(
      <AdminLayout
        {...defaultProps}
        syncStatus="idle"
        lastSyncedAt={Date.now()}
        pendingCount={0}
      />,
    );
    const syncBtn = screen.getByLabelText("Lihat status sinkronisasi");
    await userEvent.click(syncBtn);
    expect(screen.getByText("Status Sinkronisasi")).toBeDefined();
  });
});
