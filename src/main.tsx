import { createRouter, RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { createRoot } from "react-dom/client";
import { initDeviceIdFromStorage } from "./lib/initDeviceId";
import { setQueryClient } from "./lib/realTimeSync";
import "./styles.css";
import { getContext } from "./presentation/providers/root-provider";

// Restore deviceId from IndexedDB into the API client's in-memory cache.
// This runs eagerly so that any API calls made before useTenantContext
// mounts will already have the X-Device-Id header available.
initDeviceIdFromStorage();

const { queryClient } = getContext();

// Provide the QueryClient to RealTimeSyncManager for cache invalidation
// on incoming SSE events (e.g., card_status_change).
setQueryClient(queryClient);

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
