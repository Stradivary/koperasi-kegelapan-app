// @vitest-environment jsdom
/**
 * Tests for src/components/block/PwaUpdatePrompt.tsx
 * Covers: needRefresh=false hides, needRefresh=true shows, dismiss, update, callbacks
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateServiceWorker = vi.fn();
const mockUseRegisterSW = vi.fn();

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: (opts: {
    onRegistered?: (r: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (e: unknown) => void;
  }) => mockUseRegisterSW(opts),
}));

vi.mock("#/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
  }) => <button onClick={onClick}>{children}</button>,
}));

import { PwaUpdatePrompt } from "#/components/block/PwaUpdatePrompt";

describe("PwaUpdatePrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no update needed
    mockUseRegisterSW.mockImplementation(() => ({
      needRefresh: [false],
      updateServiceWorker: mockUpdateServiceWorker,
    }));
  });

  it("renders nothing when needRefresh is false", () => {
    const { container } = render(<PwaUpdatePrompt />);
    expect(container.firstChild).toBeNull();
  });

  it("renders update prompt when needRefresh is true", () => {
    mockUseRegisterSW.mockImplementation(() => ({
      needRefresh: [true],
      updateServiceWorker: mockUpdateServiceWorker,
    }));
    render(<PwaUpdatePrompt />);
    expect(screen.getByText("Update tersedia")).toBeDefined();
  });

  it("calls updateServiceWorker when Install clicked", () => {
    mockUseRegisterSW.mockImplementation(() => ({
      needRefresh: [true],
      updateServiceWorker: mockUpdateServiceWorker,
    }));
    render(<PwaUpdatePrompt />);
    fireEvent.click(screen.getByText("Install"));
    expect(mockUpdateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("hides prompt when Nanti clicked (dismissed)", () => {
    mockUseRegisterSW.mockImplementation(() => ({
      needRefresh: [true],
      updateServiceWorker: mockUpdateServiceWorker,
    }));
    render(<PwaUpdatePrompt />);
    fireEvent.click(screen.getByText("Nanti"));
    expect(screen.queryByText("Update tersedia")).toBeNull();
  });

  it("onRegistered with undefined registration logs warning without throwing", () => {
    let capturedOnRegistered: ((r: ServiceWorkerRegistration | undefined) => void) | undefined;
    mockUseRegisterSW.mockImplementation(
      (opts: { onRegistered?: (r: ServiceWorkerRegistration | undefined) => void }) => {
        capturedOnRegistered = opts.onRegistered;
        return { needRefresh: [false], updateServiceWorker: mockUpdateServiceWorker };
      },
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<PwaUpdatePrompt />);
    act(() => {
      capturedOnRegistered?.(undefined);
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("onRegistered with valid registration calls update initially", () => {
    vi.useFakeTimers();
    let capturedOnRegistered: ((r: ServiceWorkerRegistration | undefined) => void) | undefined;
    mockUseRegisterSW.mockImplementation(
      (opts: { onRegistered?: (r: ServiceWorkerRegistration | undefined) => void }) => {
        capturedOnRegistered = opts.onRegistered;
        return { needRefresh: [false], updateServiceWorker: mockUpdateServiceWorker };
      },
    );
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    const mockReg = { update: mockUpdate } as unknown as ServiceWorkerRegistration;
    render(<PwaUpdatePrompt />);
    act(() => {
      capturedOnRegistered?.(mockReg);
    });
    expect(mockUpdate).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("onRegisterError logs error without throwing", () => {
    let capturedOnRegisterError: ((e: unknown) => void) | undefined;
    mockUseRegisterSW.mockImplementation((opts: { onRegisterError?: (e: unknown) => void }) => {
      capturedOnRegisterError = opts.onRegisterError;
      return { needRefresh: [false], updateServiceWorker: mockUpdateServiceWorker };
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<PwaUpdatePrompt />);
    act(() => {
      capturedOnRegisterError?.(new Error("SW failed"));
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
