// @vitest-environment jsdom
/**
 * Tests for src/components/block/PwaInstallPrompt.tsx
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseInstallPrompt = vi.fn();

vi.mock("#/hooks/useInstallPrompt", () => ({
  useInstallPrompt: () => mockUseInstallPrompt(),
}));

vi.mock("#/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
  }) => (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
}));

import { PwaInstallPrompt } from "#/components/block/PwaInstallPrompt";

describe("PwaInstallPrompt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when canInstall is false", () => {
    mockUseInstallPrompt.mockReturnValue({ canInstall: false, install: vi.fn(), dismiss: vi.fn() });
    const { container } = render(<PwaInstallPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it("renders install prompt when canInstall is true", () => {
    mockUseInstallPrompt.mockReturnValue({ canInstall: true, install: vi.fn(), dismiss: vi.fn() });
    render(<PwaInstallPrompt />);
    expect(screen.getByText("Install Aplikasi")).toBeDefined();
  });

  it("calls install when Install button clicked", () => {
    const install = vi.fn();
    mockUseInstallPrompt.mockReturnValue({ canInstall: true, install, dismiss: vi.fn() });
    render(<PwaInstallPrompt />);
    fireEvent.click(screen.getByText("Install"));
    expect(install).toHaveBeenCalledOnce();
  });

  it("calls dismiss when Nanti button clicked", () => {
    const dismiss = vi.fn();
    mockUseInstallPrompt.mockReturnValue({ canInstall: true, install: vi.fn(), dismiss });
    render(<PwaInstallPrompt />);
    fireEvent.click(screen.getByText("Nanti"));
    expect(dismiss).toHaveBeenCalledOnce();
  });
});
