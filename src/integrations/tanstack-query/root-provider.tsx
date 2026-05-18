import { QueryClient } from "@tanstack/react-query";

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // This is a local-first app — most queries hit IndexedDB, not the network.
        // "always" ensures queries execute regardless of navigator.onLine status.
        networkMode: "always",
      },
      mutations: {
        networkMode: "always",
      },
    },
  });

  return {
    queryClient,
  };
}
export default function TanstackQueryProvider() {}
