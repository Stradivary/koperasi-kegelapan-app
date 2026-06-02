// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { SyncStatusIndicator } from "../SyncStatusIndicator";
import type { SyncEngineStatus } from "#/presentation/hooks/useSyncEngine";

function renderIndicator(props: {
  syncStatus: SyncEngineStatus;
  lastSyncedAt: number | null;
  pendingCount: number;
  onSync?: () => void;
}) {
  return render(createElement(SyncStatusIndicator, props));
}

describe("SyncStatusIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders idle status with green badge", () => {
    renderIndicator({
      syncStatus: "idle",
      lastSyncedAt: Date.now() - 30_000,
      pendingCount: 0,
    });

    expect(screen.getByText("Synced")).toBeDefined();
    const badge = screen.getByText("Synced").closest("span");
    expect(badge?.className).toContain("bg-green-100");
  });

  it("renders pushing status with blue badge", () => {
    renderIndicator({ syncStatus: "pushing", lastSyncedAt: null, pendingCount: 2 });

    expect(screen.getByText("Pushing")).toBeDefined();
    const badge = screen.getByText("Pushing").closest("span");
    expect(badge?.className).toContain("bg-blue-100");
  });

  it("renders pulling status with blue badge", () => {
    renderIndicator({ syncStatus: "pulling", lastSyncedAt: null, pendingCount: 0 });

    expect(screen.getByText("Pulling")).toBeDefined();
    const badge = screen.getByText("Pulling").closest("span");
    expect(badge?.className).toContain("bg-blue-100");
  });

  it("renders error status with red badge", () => {
    renderIndicator({ syncStatus: "error", lastSyncedAt: null, pendingCount: 1 });

    expect(screen.getByText("Sync Error")).toBeDefined();
    const badge = screen.getByText("Sync Error").closest("span");
    expect(badge?.className).toContain("bg-red-100");
  });

  it("renders offline status with gray badge", () => {
    renderIndicator({ syncStatus: "offline", lastSyncedAt: null, pendingCount: 0 });

    expect(screen.getByText("Offline")).toBeDefined();
    const badge = screen.getByText("Offline").closest("span");
    expect(badge?.className).toContain("bg-gray-100");
  });

  it("shows pending count when > 0", () => {
    renderIndicator({ syncStatus: "idle", lastSyncedAt: Date.now(), pendingCount: 5 });

    expect(screen.getByText("5 pending")).toBeDefined();
  });

  it("does not show pending count when 0", () => {
    renderIndicator({ syncStatus: "idle", lastSyncedAt: Date.now(), pendingCount: 0 });

    expect(screen.queryByText(/pending/)).toBeNull();
  });

  it("shows relative time for lastSyncedAt when idle", () => {
    const twoMinAgo = Date.now() - 2 * 60 * 1000;
    renderIndicator({ syncStatus: "idle", lastSyncedAt: twoMinAgo, pendingCount: 0 });

    expect(screen.getByText("2m ago")).toBeDefined();
  });

  it("shows 'just now' for very recent sync", () => {
    renderIndicator({ syncStatus: "idle", lastSyncedAt: Date.now() - 2000, pendingCount: 0 });

    expect(screen.getByText("just now")).toBeDefined();
  });

  it("does not show lastSyncedAt when null", () => {
    renderIndicator({ syncStatus: "idle", lastSyncedAt: null, pendingCount: 0 });

    expect(screen.queryByText(/ago/)).toBeNull();
    expect(screen.queryByText("just now")).toBeNull();
  });

  it("does not show lastSyncedAt when not idle", () => {
    renderIndicator({
      syncStatus: "pushing",
      lastSyncedAt: Date.now() - 60_000,
      pendingCount: 0,
    });

    expect(screen.queryByText("1m ago")).toBeNull();
  });

  it("has accessible role=status with descriptive aria-label", () => {
    renderIndicator({
      syncStatus: "idle",
      lastSyncedAt: Date.now() - 120_000,
      pendingCount: 3,
    });

    const statusEl = screen.getByRole("status");
    expect(statusEl).toBeDefined();
    const label = statusEl.getAttribute("aria-label");
    expect(label).toContain("Synced");
    expect(label).toContain("3 pending");
    expect(label).toContain("2m ago");
  });

  it("calls onSync when pending badge is clicked", () => {
    const onSync = vi.fn();
    renderIndicator({
      syncStatus: "idle",
      lastSyncedAt: null,
      pendingCount: 2,
      onSync,
    });

    screen.getByText("2 pending").click();
    expect(onSync).toHaveBeenCalledOnce();
  });

  it("renders all status types correctly", () => {
    const statuses: SyncEngineStatus[] = ["idle", "pushing", "pulling", "error", "offline"];
    for (const status of statuses) {
      const { unmount } = renderIndicator({
        syncStatus: status,
        lastSyncedAt: null,
        pendingCount: 0,
      });
      expect(screen.getByRole("status")).toBeDefined();
      unmount();
      cleanup();
    }
  });
});
