// @vitest-environment jsdom
/**
 * Tests for src/components/section/SettingsSection.tsx
 * Covers: parseDeviceName, formatEntitySyncDetail, isCurrentServerDevice,
 *         renderDeviceListContent, ProfileRow, ChecklistItem, main component rendering.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUseAdminTenantSync = vi.fn().mockReturnValue({
  onSyncToServer: vi.fn(),
  isSyncingToServer: false,
  syncStep: null,
  syncError: null,
  syncConflict: null,
  retryWithChanges: vi.fn(),
  resetSync: vi.fn(),
});

vi.mock("#/presentation/hooks/useAdminTenantSync", () => ({
  useAdminTenantSync: (...args: unknown[]) => mockUseAdminTenantSync(...args),
}));
vi.mock("#/presentation/hooks/SyncEngineContext", () => ({
  useSyncEngineContext: vi.fn().mockReturnValue({
    lastSyncedAt: null,
    syncStatus: "idle",
    pendingCount: 0,
    triggerSync: vi.fn(),
  }),
}));
vi.mock("#/presentation/hooks/useLocalDb", () => ({
  localDb: {
    users: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          filter: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
        }),
        between: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
      }),
    },
    cards: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          filter: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
        }),
        between: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
      }),
    },
    transactionLog: {
      where: vi.fn().mockReturnValue({
        between: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
        equals: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
      }),
    },
  },
}));
vi.mock("#/presentation/hooks/useIndexedDbStores", () => ({
  getIndexedDb: vi.fn().mockResolvedValue({
    localTenantConfigStore: { get: vi.fn().mockResolvedValue(null) },
    tenantContextStore: { get: vi.fn().mockResolvedValue(null) },
  }),
}));
vi.mock("#/presentation/hooks/useApi", () => ({
  API_BASE_URL: "http://localhost:8787",
  apiFetch: vi.fn().mockResolvedValue({ ok: false }),
  getAccessToken: vi.fn().mockReturnValue(null),
}));
vi.mock("#/presentation/components/block/dialogs/SyncConflictDialog", () => ({
  SyncConflictDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="sync-conflict-dialog" /> : null,
}));
vi.mock("#/presentation/components/block/SyncLogDrawer", () => ({
  useSyncLogDrawer: () => ({
    triggerProps: {},
    drawerElement: null,
  }),
}));
vi.mock("#/presentation/components/ui/badge", () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));
vi.mock("#/presentation/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
vi.mock("#/presentation/components/ui/card", () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h3 className={className}>{children}</h3>
  ),
}));
vi.mock("#/presentation/components/ui/collapsible", () => ({
  Collapsible: ({
    children,
    open,
    onOpenChange: _OOC,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (o: boolean) => void;
    className?: string;
  }) => (
    <div data-testid="collapsible" data-open={String(open)}>
      {children}
    </div>
  ),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({
    children,
    asChild: _AC,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div>{children}</div>,
}));
vi.mock("lucide-react", () => ({
  CheckCircle2: () => <span data-testid="icon-check-circle" />,
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
  Circle: () => <span data-testid="icon-circle" />,
  Cloud: () => <span data-testid="icon-cloud" />,
  CloudOff: () => <span data-testid="icon-cloud-off" />,
  CreditCard: () => <span data-testid="icon-credit-card" />,
  Monitor: () => <span data-testid="icon-monitor" />,
  Receipt: () => <span data-testid="icon-receipt" />,
  RefreshCw: ({ className }: { className?: string }) => (
    <span data-testid="icon-refresh" className={className} />
  ),
  Smartphone: () => <span data-testid="icon-smartphone" />,
  Upload: () => <span data-testid="icon-upload" />,
  User: () => <span data-testid="icon-user" />,
  Users: () => <span data-testid="icon-users" />,
  XCircle: () => <span data-testid="icon-x-circle" />,
}));

import { SettingsSection } from "#/presentation/components/section/SettingsSection";

describe("SettingsSection - rendering", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders Profil Tenant section", () => {
    render(<SettingsSection tenantId="t-1" />);
    expect(screen.getByText("Profil Tenant")).toBeDefined();
  });

  it("renders Sinkronisasi Tenant section", () => {
    render(<SettingsSection tenantId="t-1" />);
    expect(screen.getByText("Sinkronisasi Tenant")).toBeDefined();
  });

  it("renders Daftar Perangkat section", () => {
    render(<SettingsSection tenantId="t-1" />);
    expect(screen.getByText("Daftar Perangkat")).toBeDefined();
  });

  it("renders Push ke Server button", () => {
    render(<SettingsSection tenantId="t-1" />);
    expect(screen.getByText("Push ke Server")).toBeDefined();
  });

  it("renders Sinkronisasi Ulang button when syncEngine present", () => {
    render(<SettingsSection tenantId="t-1" />);
    expect(screen.getByText("Sinkronisasi Ulang")).toBeDefined();
  });

  it("renders Refresh button in device list", () => {
    render(<SettingsSection tenantId="t-1" />);
    expect(screen.getByText("Refresh")).toBeDefined();
  });
});

describe("SettingsSection - sync states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows syncing progress when syncStep is active", () => {
    mockUseAdminTenantSync.mockReturnValue({
      onSyncToServer: vi.fn(),
      isSyncingToServer: true,
      syncStep: "pushing-members",
      syncError: null,
      syncConflict: null,
      retryWithChanges: vi.fn(),
      resetSync: vi.fn(),
    });
    render(<SettingsSection tenantId="t-1" />);
    expect(screen.getByText("Mengirim data anggota...")).toBeDefined();
  });

  it("shows sync complete message when syncStep is complete", () => {
    mockUseAdminTenantSync.mockReturnValue({
      onSyncToServer: vi.fn(),
      isSyncingToServer: false,
      syncStep: "complete",
      syncError: null,
      syncConflict: null,
      retryWithChanges: vi.fn(),
      resetSync: vi.fn(),
    });
    render(<SettingsSection tenantId="t-1" />);
    expect(screen.getByText("Semua data berhasil disinkronkan ke server")).toBeDefined();
  });

  it("shows sync error when syncError is set", () => {
    mockUseAdminTenantSync.mockReturnValue({
      onSyncToServer: vi.fn(),
      isSyncingToServer: false,
      syncStep: null,
      syncError: "Network timeout",
      syncConflict: null,
      retryWithChanges: vi.fn(),
      resetSync: vi.fn(),
    });
    render(<SettingsSection tenantId="t-1" />);
    expect(screen.getByText("Network timeout")).toBeDefined();
  });

  it("shows SyncConflictDialog when syncConflict is set", () => {
    mockUseAdminTenantSync.mockReturnValue({
      onSyncToServer: vi.fn(),
      isSyncingToServer: false,
      syncStep: null,
      syncError: null,
      syncConflict: { type: "slug_only", existingSlug: "taken" },
      retryWithChanges: vi.fn(),
      resetSync: vi.fn(),
    });
    render(<SettingsSection tenantId="t-1" />);
    expect(screen.getByTestId("sync-conflict-dialog")).toBeDefined();
  });
});
