/**
 * TanStack Query adapter for rn-perf-kit.
 * Subscribes to QueryCache and flags identical refetches.
 *
 * Usage: queryPerf(queryClient);
 */
import { timeline } from '@rn-perf-kit/core';

interface QueryClient { getQueryCache: () => QueryCache; }
interface QueryCache { subscribe: (listener: (event: QueryCacheEvent) => void) => () => void; }
interface QueryCacheEvent {
  type: 'added' | 'removed' | 'updated' | 'observerAdded' | 'observerRemoved' | 'observerResultsUpdated';
  query: { queryKey: unknown[]; state: { data: unknown; status: string } };
}

const previousData = new Map<string, unknown>();

export function queryPerf(queryClient: QueryClient): () => void {
  const cache = queryClient.getQueryCache();
  return cache.subscribe((event: QueryCacheEvent) => {
    if (event.type !== 'updated') return;
    const key = JSON.stringify(event.query.queryKey);
    const prevData = previousData.get(key);
    const nextData = event.query.state.data;
    const isIdenticalRefetch =
      prevData !== undefined &&
      prevData !== nextData &&
      JSON.stringify(prevData) === JSON.stringify(nextData);
    previousData.set(key, nextData);
    timeline.add({
      type: 'store',
      t: timeline.now(),
      source: 'query',
      key,
      storeName: isIdenticalRefetch ? `${key} [identical-refetch]` : key,
    });
  });
}
