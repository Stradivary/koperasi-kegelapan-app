import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import { PwaUpdatePrompt } from "../components/block/PwaUpdatePrompt";
import { PwaInstallPrompt } from "../components/block/PwaInstallPrompt";
import { DeviceBlockListener } from "../components/block/DeviceBlockListener";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "#/components/ui/tooltip";

import type { QueryClient } from "@tanstack/react-query";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster />
      <DeviceBlockListener />
      <PwaInstallPrompt />
      <PwaUpdatePrompt />
      <TanStackDevtools
        config={{ position: "bottom-right" }}
        plugins={[
          { name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> },
          TanStackQueryDevtools,
        ]}
      />
    </TooltipProvider>
  );
}
