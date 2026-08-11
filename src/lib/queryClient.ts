import { QueryClient } from "@tanstack/react-query";

// Single shared client so non-React code (memory watchdog) can relieve
// pressure by dropping inactive cache entries.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Don't refetch when tab regains focus
      refetchOnMount: false, // Don't refetch when component remounts
      staleTime: 1000 * 60 * 5, // Data stays fresh for 5 minutes
      gcTime: 1000 * 60 * 10, // Keep unused data in cache for 10 minutes
      retry: 1, // Only retry failed requests once
    },
  },
});

/**
 * Drop every cached query that no component is currently observing.
 * Active screens keep their data; everything else is freed immediately.
 */
export function pruneInactiveQueries(): number {
  const cache = queryClient.getQueryCache();
  const inactive = cache.getAll().filter((q) => !q.getObserversCount());
  inactive.forEach((q) => cache.remove(q));
  return inactive.length;
}
