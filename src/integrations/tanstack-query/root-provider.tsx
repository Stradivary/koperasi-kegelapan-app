import { QueryClient } from "@tanstack/react-query";

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // This is a local-first app — queries hit IndexedDB, not the network.
        // "always" ensures queries execute regardless of navigator.onLine status.
        networkMode: "always",
        // Fixed staleTime — queries resolve from local IndexedDB so there's no
        // benefit to treating them as "forever fresh" when offline. A fixed value
        // ensures invalidateQueries always triggers a refetch after mutations.
        staleTime: 1000 * 60 * 5,
        // Keep garbage-collected data for 24h so offline sessions have data available.
        gcTime: 1000 * 60 * 60 * 24,
        // IndexedDB reads don't benefit from retries — fail fast.
        retry: false,
      },
      mutations: {
        networkMode: "always",
        retry: false,
      },
    },
  });

  return {
    queryClient,
  };
}
export default function TanstackQueryProvider() {}
