import { QueryClient, onlineManager } from "@tanstack/react-query";

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // This is a local-first app — most queries hit IndexedDB, not the network.
        // "always" ensures queries execute regardless of navigator.onLine status.
        networkMode: "always",
        // When offline, treat cached data as fresh indefinitely so pages render
        // with local data instead of showing error/loading states.
        staleTime: onlineManager.isOnline() ? 1000 * 60 * 5 : Infinity,
        // Keep garbage-collected data for 24h so offline sessions have data available.
        gcTime: 1000 * 60 * 60 * 24,
        // Disable automatic retries when offline to avoid unnecessary error cycles.
        retry: (failureCount, _error) => {
          if (!onlineManager.isOnline()) return false;
          return failureCount < 3;
        },
      },
      mutations: {
        networkMode: "always",
      },
    },
  });

  // Dynamically adjust staleTime when connectivity changes so that:
  // - Online: queries refetch normally after 5 minutes
  // - Offline: cached data is treated as fresh (Infinity)
  onlineManager.subscribe((isOnline) => {
    queryClient.setDefaultOptions({
      queries: {
        ...queryClient.getDefaultOptions().queries,
        staleTime: isOnline ? 1000 * 60 * 5 : Infinity,
      },
    });
  });

  return {
    queryClient,
  };
}
export default function TanstackQueryProvider() {}
