/**
 * TanStack Query adapter for rn-perf-kit.
 * Subscribes to QueryCache and flags identical refetches.
 *
 * Usage: queryPerf(queryClient);
 */
import { timeline } from '@rn-perf-kit/core';

interface QueryClient {
  getQueryCache: () => QueryCache;
}
interface QueryCache {
  subscribe: (listener: (event: QueryCacheEvent) => void) => () => void;
}
interface QueryCacheEvent {
  type: string;
  action?: { type: string; manual?: boolean };
  query: { queryHash: string; state: { data: unknown } };
}

export function queryPerf(queryClient: QueryClient): () => void {
  const lastData = new WeakMap<object, unknown>();
  return queryClient.getQueryCache().subscribe((event: QueryCacheEvent) => {
    // Only completed network fetches; setQueryData dispatches a manual success
    if (event.type !== 'updated' || event.action?.type !== 'success' || event.action.manual) return;
    const { query } = event;
    const next = query.state.data;
    const identical = lastData.has(query) && lastData.get(query) === next;
    lastData.set(query, next);
    timeline.add({
      type: 'store',
      t: timeline.now(),
      source: 'query',
      key: query.queryHash,
      storeName: identical ? `${query.queryHash} [identical-refetch]` : query.queryHash,
    });
  });
}
