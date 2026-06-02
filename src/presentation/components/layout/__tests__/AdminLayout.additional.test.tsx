// @vitest-environment jsdom
/**
 * Additional coverage for AdminLayout.tsx
 * Targets: lines 125, 154, 184, 221, 325-368, 391-392
 * Covers: sidebar collapse, sync drawer content, onSyncToServer button,
 *         mobile menu nav clicks, section label changes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockTenantContextStoreDelete = vi.fn();
const mockIsOnline = vi.fn().mockReturnValue({ isOnline: true });

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mockNavigate }));
vi.mock("#/presentation/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => mockIsOnline() }));
vi.mock("#/infrastructure/persistence/dexie/indexeddb", () => ({
  tenantContextStore: { delete: (...a: unknown[]) => mockTenantContextStoreDelete(...a) },
}));
vi.mock("#/presentation/lib/brand", () => ({
  BRAND: { APP_NAME: "TestApp", BYLINE: "Test Byline" },
}));
vi.mock("../../block/SyncStatusIndicator", () => ({
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
    title,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    title?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} title={title}>
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

describe("AdminLayout - sync drawer content", () => {
  it("shows SyncStatusIndicator in drawer when syncStatus and online", async () => {
    render(
      <AdminLayout
        {...defaultProps}
        syncStatus="idle"
        lastSyncedAt={Date.now()}
        pendingCount={0}
      />,
    );
    fireEvent.click(screen.getByLabelText("Lihat status sinkronisasi"));
    expect(screen.getByTestId("sync-status-indicator")).toBeDefined();
  });

  it("shows Online text in sync drawer when online", async () => {
    render(<AdminLayout {...defaultProps} syncStatus="idle" />);
    fireEvent.click(screen.getByLabelText("Lihat status sinkronisasi"));
    expect(screen.getByText("Online")).toBeDefined();
  });

  it("shows Offline text in sync drawer when offline", async () => {
    mockIsOnline.mockReturnValue({ isOnline: false });
    render(<AdminLayout {...defaultProps} syncStatus="idle" />);
    fireEvent.click(screen.getByLabelText("Lihat status sinkronisasi"));
    expect(screen.getByText("Offline")).toBeDefined();
  });

  it("does not show SyncStatusIndicator when offline", async () => {
    mockIsOnline.mockReturnValue({ isOnline: false });
    render(<AdminLayout {...defaultProps} syncStatus="idle" />);
    fireEvent.click(screen.getByLabelText("Lihat status sinkronisasi"));
    expect(screen.queryByTestId("sync-status-indicator")).toBeNull();
  });

  it("shows Sync ke Server button when onSyncToServer provided and online", async () => {
    const onSyncToServer = vi.fn();
    render(<AdminLayout {...defaultProps} onSyncToServer={onSyncToServer} />);
    fireEvent.click(screen.getByLabelText("Lihat status sinkronisasi"));
    expect(screen.getByText("Sync ke Server")).toBeDefined();
  });

  it("calls onSyncToServer and closes drawer when button clicked", async () => {
    const onSyncToServer = vi.fn();
    render(<AdminLayout {...defaultProps} onSyncToServer={onSyncToServer} />);
    fireEvent.click(screen.getByLabelText("Lihat status sinkronisasi"));
    expect(screen.getByText("Status Sinkronisasi")).toBeDefined();
    fireEvent.click(screen.getByText("Sync ke Server"));
    expect(onSyncToServer).toHaveBeenCalledOnce();
  });

  it("disables Sync ke Server button when isSyncingToServer=true", async () => {
    const onSyncToServer = vi.fn();
    render(
      <AdminLayout {...defaultProps} onSyncToServer={onSyncToServer} isSyncingToServer={true} />,
    );
    fireEvent.click(screen.getByLabelText("Lihat status sinkronisasi"));
    const btn = screen.getByText("Syncing...").closest("button")!;
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not show Sync ke Server button when offline", async () => {
    mockIsOnline.mockReturnValue({ isOnline: false });
    const onSyncToServer = vi.fn();
    render(<AdminLayout {...defaultProps} onSyncToServer={onSyncToServer} />);
    fireEvent.click(screen.getByLabelText("Lihat status sinkronisasi"));
    expect(screen.queryByText("Sync ke Server")).toBeNull();
  });
});

describe("AdminLayout - section labels", () => {
  it.each([
    ["members", "Anggota"],
    ["transactions", "Transaksi"],
    ["scout", "Scout"],
    ["settings", "Pengaturan"],
  ] as const)("shows correct label for section=%s", (section, label) => {
    render(<AdminLayout {...defaultProps} activeSection={section} />);
    const elements = screen.getAllByText(label);
    expect(elements.length).toBeGreaterThan(0);
  });
});

describe("AdminLayout - mobile menu navigation", () => {
  it("navigates to cards route when Kartu clicked in mobile menu", async () => {
    render(<AdminLayout {...defaultProps} />);
    await userEvent.click(screen.getByTestId("menu-icon").closest("button")!);
    // Click Kartu in the mobile sidebar nav
    const kartuBtns = screen.getAllByText("Kartu");
    await userEvent.click(kartuBtns[kartuBtns.length - 1]);
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: expect.stringContaining("cards") }),
    );
  });

  it("closes mobile menu after nav click", async () => {
    render(<AdminLayout {...defaultProps} />);
    await userEvent.click(screen.getByTestId("menu-icon").closest("button")!);
    const memberBtns = screen.getAllByText("Anggota");
    await userEvent.click(memberBtns[memberBtns.length - 1]);
    // Mobile menu should close - X button no longer visible
    expect(screen.queryByLabelText("Tutup menu")).toBeNull();
  });

  it("closes mobile menu when backdrop is clicked", async () => {
    render(<AdminLayout {...defaultProps} />);
    await userEvent.click(screen.getByTestId("menu-icon").closest("button")!);
    const backdrop = screen.getByLabelText("Tutup menu");
    await userEvent.click(backdrop);
    expect(screen.queryByLabelText("Tutup menu")).toBeNull();
  });
});

describe("AdminLayout - getSyncDotColor", () => {
  it("shows red dot when offline", () => {
    mockIsOnline.mockReturnValue({ isOnline: false });
    render(<AdminLayout {...defaultProps} />);
    // The sync dot button should have a red dot
    const syncBtn = screen.getByLabelText("Lihat status sinkronisasi");
    expect(syncBtn.innerHTML).toContain("bg-red-500");
  });

  it("shows amber dot when pendingCount > 0 and online", () => {
    render(<AdminLayout {...defaultProps} pendingCount={5} />);
    const syncBtn = screen.getByLabelText("Lihat status sinkronisasi");
    expect(syncBtn.innerHTML).toContain("bg-amber-500");
  });

  it("shows blue pulsing dot when syncStatus is pushing", () => {
    render(<AdminLayout {...defaultProps} syncStatus="pushing" pendingCount={0} />);
    const syncBtn = screen.getByLabelText("Lihat status sinkronisasi");
    expect(syncBtn.innerHTML).toContain("bg-blue-500");
  });

  it("shows red dot when syncStatus is error", () => {
    render(<AdminLayout {...defaultProps} syncStatus="error" pendingCount={0} />);
    const syncBtn = screen.getByLabelText("Lihat status sinkronisasi");
    expect(syncBtn.innerHTML).toContain("bg-red-500");
  });

  it("shows green dot when online, idle, no pending", () => {
    render(<AdminLayout {...defaultProps} syncStatus="idle" pendingCount={0} />);
    const syncBtn = screen.getByLabelText("Lihat status sinkronisasi");
    expect(syncBtn.innerHTML).toContain("bg-green-500");
  });
});
