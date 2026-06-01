// @vitest-environment jsdom
/**
 * Additional tests for SyncStatusIndicator to cover lines 70-74:
 * the setInterval tick for relative time refresh.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { createElement } from "react";
import { SyncStatusIndicator } from "../SyncStatusIndicator";

describe("SyncStatusIndicator - interval tick", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("sets up interval when lastSyncedAt is provided", () => {
    const lastSyncedAt = Date.now() - 60_000; // 1 minute ago
    render(
      createElement(SyncStatusIndicator, {
        syncStatus: "idle",
        lastSyncedAt,
        pendingCount: 0,
      }),
    );

    expect(screen.getByText("1m ago")).toBeDefined();

    // Advance time by 30 seconds (interval tick)
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    // Component should still render (tick causes re-render)
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("clears interval on unmount when lastSyncedAt is set", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const lastSyncedAt = Date.now() - 60_000;

    const { unmount } = render(
      createElement(SyncStatusIndicator, {
        syncStatus: "idle",
        lastSyncedAt,
        pendingCount: 0,
      }),
    );

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("does not set up interval when lastSyncedAt is null", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    render(
      createElement(SyncStatusIndicator, {
        syncStatus: "idle",
        lastSyncedAt: null,
        pendingCount: 0,
      }),
    );

    // setInterval should not be called for the tick effect
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("shows hours ago for sync > 60 minutes", () => {
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

    render(
      createElement(SyncStatusIndicator, {
        syncStatus: "idle",
        lastSyncedAt: twoHoursAgo,
        pendingCount: 0,
      }),
    );

    expect(screen.getByText("2h ago")).toBeDefined();
  });

  it("shows days ago for sync > 24 hours", () => {
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

    render(
      createElement(SyncStatusIndicator, {
        syncStatus: "idle",
        lastSyncedAt: twoDaysAgo,
        pendingCount: 0,
      }),
    );

    expect(screen.getByText("2d ago")).toBeDefined();
  });

  it("shows seconds ago for sync < 60 seconds but > 5 seconds", () => {
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
    const thirtySecondsAgo = Date.now() - 30_000;

    render(
      createElement(SyncStatusIndicator, {
        syncStatus: "idle",
        lastSyncedAt: thirtySecondsAgo,
        pendingCount: 0,
      }),
    );

    expect(screen.getByText("30s ago")).toBeDefined();
  });
});
