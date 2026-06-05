import { createRootRouteWithContext, Outlet, Navigate } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import TanStackQueryDevtools from "#/presentation/providers/devtools";
import { PwaUpdatePrompt } from "#/presentation/components/block/PwaUpdatePrompt";
import { PwaInstallPrompt } from "#/presentation/components/block/PwaInstallPrompt";
import { DeviceBlockListener } from "#/presentation/components/block/DeviceBlockListener";
import { RootOfflineBanner } from "#/presentation/components/block/OfflineIndicator";
import { Toaster } from "#/presentation/components/ui/sonner";
import { TooltipProvider } from "#/presentation/components/ui/tooltip";

import type { QueryClient } from "@tanstack/react-query";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundRedirect,
});

function NotFoundRedirect() {
  return <Navigate to="/" replace />;
}

function RootComponent() {
  return (
    <TooltipProvider>
      <RootOfflineBanner />
      <Outlet />
      <Toaster position="top-center" />
      <DeviceBlockListener />
      <PwaInstallPrompt />
      <PwaUpdatePrompt />
      <TanStackDevtools
        config={{ position: "bottom-right", triggerHidden: true }}
        plugins={[
          { name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> },
          TanStackQueryDevtools,
        ]}
      />
    </TooltipProvider>
  );
}
