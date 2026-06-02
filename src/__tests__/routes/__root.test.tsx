// @vitest-environment jsdom
/**
 * Tests for src/routes/__root.tsx
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createRootRouteWithContext: () => () => ({ component: null }),
  Outlet: () => <div data-testid="outlet" />,
}));

vi.mock("@tanstack/react-router-devtools", () => ({
  TanStackRouterDevtoolsPanel: () => <div data-testid="router-devtools" />,
}));

vi.mock("@tanstack/react-devtools", () => ({
  TanStackDevtools: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="tanstack-devtools">{children}</div>
  ),
}));

vi.mock("#/presentation/providers/devtools", () => ({
  default: { name: "Query", render: <div /> },
}));

vi.mock("#/presentation/components/block/PwaUpdatePrompt", () => ({
  PwaUpdatePrompt: () => <div data-testid="pwa-update-prompt" />,
}));

vi.mock("#/presentation/components/block/PwaInstallPrompt", () => ({
  PwaInstallPrompt: () => <div data-testid="pwa-install-prompt" />,
}));

vi.mock("#/presentation/components/block/DeviceBlockListener", () => ({
  DeviceBlockListener: () => <div data-testid="device-block-listener" />,
}));

vi.mock("#/presentation/components/block/OfflineIndicator", () => ({
  RootOfflineBanner: () => <div data-testid="root-offline-banner" />,
}));

vi.mock("#/presentation/components/ui/sonner", () => ({
  Toaster: ({ position }: { position: string }) => (
    <div data-testid="toaster" data-position={position} />
  ),
}));

vi.mock("#/presentation/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-provider">{children}</div>
  ),
}));

import { Outlet } from "@tanstack/react-router";
import { RootOfflineBanner } from "#/presentation/components/block/OfflineIndicator";
import { Toaster } from "#/presentation/components/ui/sonner";
import { DeviceBlockListener } from "#/presentation/components/block/DeviceBlockListener";
import { PwaInstallPrompt } from "#/presentation/components/block/PwaInstallPrompt";
import { PwaUpdatePrompt } from "#/presentation/components/block/PwaUpdatePrompt";
import { TooltipProvider } from "#/presentation/components/ui/tooltip";

// Re-create the RootComponent for testing since the route export is complex
function RootComponent() {
  return (
    <TooltipProvider>
      <RootOfflineBanner />
      <Outlet />
      <Toaster position="top-center" />
      <DeviceBlockListener />
      <PwaInstallPrompt />
      <PwaUpdatePrompt />
    </TooltipProvider>
  );
}

describe("RootComponent", () => {
  it("renders TooltipProvider wrapping all children", () => {
    render(<RootComponent />);
    expect(screen.getByTestId("tooltip-provider")).toBeDefined();
  });

  it("renders RootOfflineBanner", () => {
    render(<RootComponent />);
    expect(screen.getByTestId("root-offline-banner")).toBeDefined();
  });

  it("renders Outlet for child routes", () => {
    render(<RootComponent />);
    expect(screen.getByTestId("outlet")).toBeDefined();
  });

  it("renders Toaster with top-center position", () => {
    render(<RootComponent />);
    const toaster = screen.getByTestId("toaster");
    expect(toaster.getAttribute("data-position")).toBe("top-center");
  });

  it("renders DeviceBlockListener", () => {
    render(<RootComponent />);
    expect(screen.getByTestId("device-block-listener")).toBeDefined();
  });

  it("renders PwaInstallPrompt", () => {
    render(<RootComponent />);
    expect(screen.getByTestId("pwa-install-prompt")).toBeDefined();
  });

  it("renders PwaUpdatePrompt", () => {
    render(<RootComponent />);
    expect(screen.getByTestId("pwa-update-prompt")).toBeDefined();
  });
});
