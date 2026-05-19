import { createRouter, RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { createRoot } from "react-dom/client";
import { initDeviceIdFromStorage } from "./lib/initDeviceId";
import "./styles.css";

// Restore deviceId from IndexedDB into the API client's in-memory cache.
// This runs eagerly so that any API calls made before useTenantContext
// mounts will already have the X-Device-Id header available.
initDeviceIdFromStorage();

const { queryClient } = getContext();

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
