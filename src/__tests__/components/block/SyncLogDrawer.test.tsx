// @vitest-environment jsdom
/**
 * Tests for src/presentation/components/block/SyncLogDrawer.tsx
 * Covers: useSyncLogDrawer hook, useLongPress, StatusBadge, LogIcon, LogEntry,
 *         empty state, log rendering, clear button.
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSyncLogs = vi.fn();
const mockSubscribeSyncLogs = vi.fn();
const mockClearSyncLogs = vi.fn();

vi.mock("#/infrastructure/persistence/dexie/syncLogStore", () => ({
  getSyncLogs: () => mockGetSyncLogs(),
  subscribeSyncLogs: (cb: () => void) => mockSubscribeSyncLogs(cb),
  clearSyncLogs: () => mockClearSyncLogs(),
}));

vi.mock("lucide-react", () => ({
  Bug: () => <span data-testid="icon-bug" />,
  CircleAlert: () => <span data-testid="icon-circle-alert" />,
  CircleCheck: () => <span data-testid="icon-circle-check" />,
  Info: () => <span data-testid="icon-info" />,
  Trash2: () => <span data-testid="icon-trash" />,
  TriangleAlert: () => <span data-testid="icon-triangle-alert" />,
}));

vi.mock("#/presentation/components/ui/drawer", () => ({
  Drawer: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="drawer">{children}</div> : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer-content">{children}</div>
  ),
  DrawerHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer-header">{children}</div>
  ),
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DrawerFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer-footer">{children}</div>
  ),
}));

vi.mock("#/presentation/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    className?: string;
  }) => <button onClick={onClick}>{children}</button>,
}));

import { useSyncLogDrawer } from "#/presentation/components/block/SyncLogDrawer";

// ── Test component ────────────────────────────────────────────────────────────

function TestComponent(props: {
  syncStatus?: string;
  lastSyncedAt?: number | null;
  pendingCount?: number;
}) {
  const { open, triggerProps, drawerElement } = useSyncLogDrawer(props as any);
  return (
    <div>
      <div data-testid="trigger" {...triggerProps}>
        Trigger
      </div>
      <span data-testid="open-state">{String(open)}</span>
      {drawerElement}
    </div>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useSyncLogDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetSyncLogs.mockReturnValue([]);
    mockSubscribeSyncLogs.mockImplementation(() => () => {});
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("initializes with drawer closed", () => {
    render(<TestComponent />);
    expect(screen.getByTestId("open-state").textContent).toBe("false");
    expect(screen.queryByTestId("drawer")).toBeNull();
  });

  it("opens drawer after 3s long press", () => {
    render(<TestComponent />);
    const trigger = screen.getByTestId("trigger");

    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId("open-state").textContent).toBe("true");
    expect(screen.getByTestId("drawer")).toBeDefined();
  });

  it("does not open drawer if press is released before 3s", () => {
    render(<TestComponent />);
    const trigger = screen.getByTestId("trigger");

    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.pointerUp(trigger);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId("open-state").textContent).toBe("false");
  });

  it("cancels long press on pointer leave", () => {
    render(<TestComponent />);
    const trigger = screen.getByTestId("trigger");

    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.pointerLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId("open-state").textContent).toBe("false");
  });

  it("shows empty state when no logs", () => {
    mockGetSyncLogs.mockReturnValue([]);
    render(<TestComponent />);

    // Open drawer
    const trigger = screen.getByTestId("trigger");
    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("Belum ada log sync")).toBeDefined();
  });

  it("renders log entries when logs exist", () => {
    mockGetSyncLogs.mockReturnValue([
      { id: "1", level: "info", message: "Sync started", timestamp: Date.now() },
      {
        id: "2",
        level: "error",
        message: "Sync failed",
        timestamp: Date.now(),
        details: "timeout",
      },
    ]);
    render(<TestComponent />);

    const trigger = screen.getByTestId("trigger");
    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("Sync started")).toBeDefined();
    expect(screen.getByText("Sync failed")).toBeDefined();
    expect(screen.getByText("timeout")).toBeDefined();
  });

  it("renders warn level icon", () => {
    mockGetSyncLogs.mockReturnValue([
      { id: "1", level: "warn", message: "Retry needed", timestamp: Date.now() },
    ]);
    render(<TestComponent />);

    const trigger = screen.getByTestId("trigger");
    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId("icon-triangle-alert")).toBeDefined();
  });

  it("renders error level icon", () => {
    mockGetSyncLogs.mockReturnValue([
      { id: "1", level: "error", message: "Failed", timestamp: Date.now() },
    ]);
    render(<TestComponent />);

    const trigger = screen.getByTestId("trigger");
    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId("icon-circle-alert")).toBeDefined();
  });

  it("renders info level icon (default)", () => {
    mockGetSyncLogs.mockReturnValue([
      { id: "1", level: "info", message: "OK", timestamp: Date.now() },
    ]);
    render(<TestComponent />);

    const trigger = screen.getByTestId("trigger");
    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId("icon-circle-check")).toBeDefined();
  });

  it("calls clearSyncLogs when clear button clicked", () => {
    mockGetSyncLogs.mockReturnValue([
      { id: "1", level: "info", message: "test", timestamp: Date.now() },
    ]);
    render(<TestComponent />);

    const trigger = screen.getByTestId("trigger");
    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    fireEvent.click(screen.getByText("Hapus semua log"));
    expect(mockClearSyncLogs).toHaveBeenCalledOnce();
  });

  it("shows StatusBadge with correct status", () => {
    render(<TestComponent syncStatus="pushing" />);

    const trigger = screen.getByTestId("trigger");
    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("Pushing")).toBeDefined();
  });

  it("shows idle status by default", () => {
    render(<TestComponent syncStatus="idle" />);

    const trigger = screen.getByTestId("trigger");
    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("Idle")).toBeDefined();
  });

  it("shows last synced time", () => {
    const lastSyncedAt = new Date("2024-06-15T10:30:00").getTime();
    render(<TestComponent lastSyncedAt={lastSyncedAt} />);

    const trigger = screen.getByTestId("trigger");
    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText(/Terakhir sync/)).toBeDefined();
  });

  it("shows 'Belum pernah sync' when lastSyncedAt is null", () => {
    render(<TestComponent lastSyncedAt={null} />);

    const trigger = screen.getByTestId("trigger");
    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText(/Belum pernah sync/)).toBeDefined();
  });

  it("shows pending count", () => {
    render(<TestComponent lastSyncedAt={Date.now()} pendingCount={5} />);

    const trigger = screen.getByTestId("trigger");
    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText(/5 pending/)).toBeDefined();
  });

  it("does not show pending count when 0", () => {
    render(<TestComponent lastSyncedAt={Date.now()} pendingCount={0} />);

    const trigger = screen.getByTestId("trigger");
    fireEvent.pointerDown(trigger);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText(/pending/)).toBeNull();
  });
});
