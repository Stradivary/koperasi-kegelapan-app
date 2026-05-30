// @vitest-environment jsdom
/**
 * Tests for DevicesSection.tsx
 * Covers: loading state, empty state, tenant list rendering, actions,
 *         sync flow, remove flow, role-based navigation, formatRelativeTime
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mockNavigate }));

const mockTenantContextStoreGetAll = vi.fn();
const mockTenantContextStoreDelete = vi.fn();
const mockLocalTenantConfigStoreGetAll = vi.fn();
const mockReconciliationOutboxGetPending = vi.fn();
const mockReconciliationOutboxMarkSynced = vi.fn();

vi.mock("#/lib/indexeddb", () => ({
  tenantContextStore: {
    getAll: () => mockTenantContextStoreGetAll(),
    delete: (...a: unknown[]) => mockTenantContextStoreDelete(...a),
  },
  localTenantConfigStore: {
    getAll: () => mockLocalTenantConfigStoreGetAll(),
  },
  reconciliationOutbox: {
    getPending: (...a: unknown[]) => mockReconciliationOutboxGetPending(...a),
    markSynced: (...a: unknown[]) => mockReconciliationOutboxMarkSynced(...a),
  },
}));

vi.mock("#/lib/api", () => ({ API_BASE_URL: "https://api.test" }));
vi.mock("../layout/AuthLayout", () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-layout">{children}</div>
  ),
}));
vi.mock("../block/LoadingState", () => ({
  LoadingState: () => <div data-testid="loading-state" />,
}));
vi.mock("#/components/ui/button", () => ({
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
vi.mock("lucide-react", () => ({
  RefreshCw: () => <span />,
  ArrowRight: () => <span />,
  Trash2: () => <span />,
  HardDrive: () => <span />,
  Server: () => <span />,
  WifiOff: () => <span />,
  Clock: () => <span />,
  AlertCircle: () => <span />,
  Loader2Icon: () => <span />,
}));

import { DevicesSection } from "../DevicesSection";

beforeEach(() => {
  vi.clearAllMocks();
  mockTenantContextStoreGetAll.mockResolvedValue([]);
  mockLocalTenantConfigStoreGetAll.mockResolvedValue([]);
  mockReconciliationOutboxGetPending.mockResolvedValue([]);
  mockTenantContextStoreDelete.mockResolvedValue(undefined);
  mockReconciliationOutboxMarkSynced.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("DevicesSection — loading and empty state", () => {
  it("shows empty state when no tenants registered", async () => {
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText("Belum ada tenant terdaftar")).toBeDefined();
  });

  it("shows tenant count in subtitle", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      {
        tenantId: "t1",
        tenantName: "Koperasi A",
        tenantSlug: "koperasi-a",
        role: "admin",
        updatedAt: Date.now(),
      },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText(/1 tenant/)).toBeDefined();
  });
});

describe("DevicesSection — tenant list", () => {
  it("renders tenant name and slug", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      {
        tenantId: "t1",
        tenantName: "Koperasi A",
        tenantSlug: "koperasi-a",
        role: "admin",
        updatedAt: Date.now(),
      },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText("Koperasi A")).toBeDefined();
    expect(screen.getByText("@koperasi-a")).toBeDefined();
  });

  it("shows role badge", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      {
        tenantId: "t1",
        tenantName: "Koperasi A",
        tenantSlug: "koperasi-a",
        role: "admin",
        updatedAt: Date.now(),
      },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText("Admin")).toBeDefined();
  });

  it("shows Synced badge for synced tenants", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "admin", updatedAt: Date.now() },
    ]);
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([
      { tenantId: "t1", slug: "a", name: "A", mode: "synced" },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText("Synced")).toBeDefined();
  });

  it("shows Lokal badge for local-only tenants", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "admin", updatedAt: Date.now() },
    ]);
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([
      { tenantId: "t1", slug: "a", name: "A", mode: "local" },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText("Lokal")).toBeDefined();
  });

  it("shows pending count when there are pending entries", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "admin", updatedAt: Date.now() },
    ]);
    mockReconciliationOutboxGetPending.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText("2 pending")).toBeDefined();
  });

  it("shows Tersinkron when no pending entries", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "admin", updatedAt: Date.now() },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText("Tersinkron")).toBeDefined();
  });
});

describe("DevicesSection — actions", () => {
  it("navigates to tenant route when Buka clicked", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "admin", updatedAt: Date.now() },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await userEvent.click(screen.getByText("Buka"));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/tenant/t1/admin" });
  });

  it("navigates to station route for station role", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "station", updatedAt: Date.now() },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await userEvent.click(screen.getByText("Buka"));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/tenant/t1/station" });
  });

  it("navigates to gate route for gate role", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "gate", updatedAt: Date.now() },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await userEvent.click(screen.getByText("Buka"));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/tenant/t1/gate" });
  });

  it("navigates to terminal route for terminal role", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "terminal", updatedAt: Date.now() },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await userEvent.click(screen.getByText("Buka"));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/tenant/t1/terminal" });
  });

  it("navigates to kiosk route for kiosk role", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "kiosk", updatedAt: Date.now() },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await userEvent.click(screen.getByText("Buka"));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/tenant/t1/kiosk" });
  });

  it("navigates to scout route for scout role", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "scout", updatedAt: Date.now() },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await userEvent.click(screen.getByText("Buka"));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/tenant/t1/scout" });
  });

  it("removes tenant context when delete button clicked", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "admin", updatedAt: Date.now() },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    // Find all buttons, the delete button is the icon-only one (not Buka, not Kembali ke Login, not refresh)
    const allBtns = screen.getAllByRole("button");
    // The delete button renders only a Trash2 icon (empty span from mock)
    // It's the button after "Buka" in the card actions
    const bukaIdx = allBtns.findIndex((b) => b.textContent?.includes("Buka"));
    const deleteBtn = allBtns[bukaIdx + 1]; // next button after Buka
    if (deleteBtn) {
      await userEvent.click(deleteBtn);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }
    expect(mockTenantContextStoreDelete).toHaveBeenCalledWith("t1");
  });

  it("navigates to / when Kembali ke Login clicked", async () => {
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await userEvent.click(screen.getByText("Kembali ke Login"));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("shows 'Belum masuk sebagai perangkat' for config-only entries", async () => {
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([
      { tenantId: "t1", slug: "a", name: "Config Only", mode: "local" },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText("Belum masuk sebagai perangkat")).toBeDefined();
  });
});

describe("DevicesSection — sync flow", () => {
  it("shows Sinkron button when there are pending entries", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "admin", updatedAt: Date.now() },
    ]);
    mockReconciliationOutboxGetPending.mockResolvedValue([{ id: 1, idempotencyKey: "key1" }]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText("Sinkron")).toBeDefined();
  });

  it("calls reconcile API when Sinkron clicked", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "admin", updatedAt: Date.now() },
    ]);
    mockReconciliationOutboxGetPending.mockResolvedValue([{ id: 1, idempotencyKey: "key1" }]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await act(async () => {
      await userEvent.click(screen.getByText("Sinkron"));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test/api/reconcile",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("marks entries as synced after successful reconcile", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "admin", updatedAt: Date.now() },
    ]);
    mockReconciliationOutboxGetPending.mockResolvedValue([
      { id: 1, idempotencyKey: "key1" },
      { id: 2, idempotencyKey: "key2" },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await act(async () => {
      await userEvent.click(screen.getByText("Sinkron"));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockReconciliationOutboxMarkSynced).toHaveBeenCalledWith("key1");
    expect(mockReconciliationOutboxMarkSynced).toHaveBeenCalledWith("key2");
  });

  it("does not mark synced when reconcile fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "admin", updatedAt: Date.now() },
    ]);
    mockReconciliationOutboxGetPending.mockResolvedValue([{ id: 1, idempotencyKey: "key1" }]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await act(async () => {
      await userEvent.click(screen.getByText("Sinkron"));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockReconciliationOutboxMarkSynced).not.toHaveBeenCalled();
  });

  it("skips sync when no pending entries on sync click", async () => {
    global.fetch = vi.fn();
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "admin", updatedAt: Date.now() },
    ]);
    // First call returns pending (to show button), second call returns empty (on click)
    mockReconciliationOutboxGetPending
      .mockResolvedValueOnce([{ id: 1, idempotencyKey: "key1" }])
      .mockResolvedValueOnce([]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await act(async () => {
      await userEvent.click(screen.getByText("Sinkron"));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("DevicesSection — formatRelativeTime", () => {
  it("shows 'baru saja' for recent timestamps", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      { tenantId: "t1", tenantName: "A", tenantSlug: "a", role: "admin", updatedAt: Date.now() },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText("baru saja")).toBeDefined();
  });

  it("shows minutes for timestamps within an hour", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      {
        tenantId: "t1",
        tenantName: "A",
        tenantSlug: "a",
        role: "admin",
        updatedAt: Date.now() - 5 * 60_000,
      },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText("5 menit lalu")).toBeDefined();
  });

  it("shows hours for timestamps within a day", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      {
        tenantId: "t1",
        tenantName: "A",
        tenantSlug: "a",
        role: "admin",
        updatedAt: Date.now() - 3 * 60 * 60_000,
      },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText("3 jam lalu")).toBeDefined();
  });

  it("shows days for timestamps older than a day", async () => {
    mockTenantContextStoreGetAll.mockResolvedValue([
      {
        tenantId: "t1",
        tenantName: "A",
        tenantSlug: "a",
        role: "admin",
        updatedAt: Date.now() - 2 * 24 * 60 * 60_000,
      },
    ]);
    render(<DevicesSection />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText("2 hari lalu")).toBeDefined();
  });
});
