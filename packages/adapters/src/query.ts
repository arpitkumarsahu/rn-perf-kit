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
  query: { queryHash: string; queryKey?: readonly unknown[]; state: { data: unknown } };
}

export interface QueryPerfOptions {
  /**
   * How a query is named in events, findings and traces. The default keeps the first
   * key segment and hides the rest, because query keys often carry user data (ids,
   * phone numbers, emails): ['portfolio', userId, 'all'] -> 'portfolio(+2)'.
   * Pass `(q) => q.queryHash` to record full keys in local debugging.
   */
  formatKey?: (query: { queryHash: string; queryKey?: readonly unknown[] }) => string;
}

export function defaultQueryKeyFormat(query: { queryHash: string; queryKey?: readonly unknown[] }): string {
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length === 0) return 'query';
  const head = typeof key[0] === 'string' ? key[0] : 'query';
  return key.length > 1 ? `${head}(+${key.length - 1})` : head;
}

export function queryPerf(queryClient: QueryClient, options: QueryPerfOptions = {}): () => void {
  const formatKey = options.formatKey ?? defaultQueryKeyFormat;
  const lastData = new WeakMap<object, unknown>();
  return queryClient.getQueryCache().subscribe((event: QueryCacheEvent) => {
    // Only completed network fetches; setQueryData dispatches a manual success
    if (event.type !== 'updated' || event.action?.type !== 'success' || event.action.manual) return;
    const { query } = event;
    const next = query.state.data;
    const identical = lastData.has(query) && lastData.get(query) === next;
    lastData.set(query, next);
    const key = formatKey(query);
    timeline.add({
      type: 'store',
      t: timeline.now(),
      source: 'query',
      key,
      storeName: identical ? `${key} [identical-refetch]` : key,
    });
  });
}
