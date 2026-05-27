// @vitest-environment jsdom
/**
 * Tests for src/components/block/OfflineIndicator.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockToastSuccess = vi.fn();
const mockToastWarning = vi.fn();
const mockUseOnlineStatus = vi.fn();

vi.mock("#/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => mockUseOnlineStatus(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    warning: (...args: unknown[]) => mockToastWarning(...args),
  },
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  WifiHigh: () => null,
  WifiOff: () => null,
}));

import { OfflineIndicator, RootOfflineBanner } from "../OfflineIndicator";

describe("OfflineIndicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: online
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders nothing when online and no pending items", () => {
    const { container } = render(
      <OfflineIndicator pendingCount={0} syncStatus="idle" onSync={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows offline badge when offline", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    render(<OfflineIndicator pendingCount={0} syncStatus="idle" onSync={vi.fn()} />);
    expect(screen.getByText("Offline")).toBeDefined();
  });

  it("shows pending count button when there are pending items", () => {
    render(<OfflineIndicator pendingCount={5} syncStatus="idle" onSync={vi.fn()} />);
    expect(screen.getByText("5 pending")).toBeDefined();
  });

  it("calls onSync when pending button is clicked", async () => {
    const onSync = vi.fn();
    render(<OfflineIndicator pendingCount={3} syncStatus="idle" onSync={onSync} />);

    await userEvent.click(screen.getByText("3 pending"));
    expect(onSync).toHaveBeenCalledOnce();
  });

  it("disables sync button when syncing", () => {
    render(<OfflineIndicator pendingCount={3} syncStatus="syncing" onSync={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText("Syncing...")).toBeDefined();
  });

  it("disables sync button when offline", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    render(<OfflineIndicator pendingCount={3} syncStatus="idle" onSync={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    const pendingBtn = buttons.find((b) => b.textContent?.includes("pending"));
    expect(pendingBtn?.getAttribute("disabled")).not.toBeNull();
  });
});

describe("RootOfflineBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOnlineStatus.mockReturnValue({ isOnline: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders nothing in the DOM", () => {
    const { container } = render(<RootOfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("shows warning toast when going offline", async () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: true });
    const { rerender } = render(<RootOfflineBanner />);

    // Transition to offline
    mockUseOnlineStatus.mockReturnValue({ isOnline: false });
    await act(async () => {
      rerender(<RootOfflineBanner />);
    });

    expect(mockToastWarning).toHaveBeenCalledOnce();
  });

  it("shows success toast when coming back online", async () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: false });
    const { rerender } = render(<RootOfflineBanner />);

    // Transition to online
    mockUseOnlineStatus.mockReturnValue({ isOnline: true });
    await act(async () => {
      rerender(<RootOfflineBanner />);
    });

    expect(mockToastSuccess).toHaveBeenCalledOnce();
  });

  it("does not show toast on initial render", () => {
    mockUseOnlineStatus.mockReturnValue({ isOnline: true });
    render(<RootOfflineBanner />);

    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockToastWarning).not.toHaveBeenCalled();
  });
});
