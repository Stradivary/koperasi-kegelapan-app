import { useEffect } from "react";
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import { BRAND } from "../lib/brand";
import { PwaUpdatePrompt } from "../components/block/PwaUpdatePrompt";
import { PwaInstallPrompt } from "../components/block/PwaInstallPrompt";
import { Toaster } from "../components/ui/sonner";

import appCss from "../styles.css?url";

import type { QueryClient } from "@tanstack/react-query";
import { TooltipProvider } from "#/components/ui/tooltip";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: BRAND.APP_NAME },
      { name: "description", content: BRAND.APP_DESCRIPTION },
      { name: "theme-color", content: "#FF0025" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: BRAND.SHORT_NAME },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  // Eager service worker registration — decoupled from PwaUpdatePrompt component lifecycle.
  // This ensures the SW is registered on app load regardless of which components mount.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Registration may fail in dev mode or unsupported contexts — silently ignore.
      });
    }
  }, []);

  return (
    <html lang="id">
      <head>
        <HeadContent />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
        <PwaInstallPrompt />
        <PwaUpdatePrompt />
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[
            { name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
