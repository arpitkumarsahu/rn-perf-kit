/**
 * Hook to track screen-level performance for a named screen.
 */
import { useCallback, useEffect, useRef } from 'react';
import { timeline } from '@rn-perf-kit/core';

export interface PerfScreenHandle {
  markReady: () => void;
}

export function usePerfScreen(screenName: string): PerfScreenHandle {
  const mountedAt = useRef(timeline.now());
  const markedReady = useRef(false);

  useEffect(() => {
    mountedAt.current = timeline.now();
    markedReady.current = false;
    timeline.mark(`screen:mount:${screenName}`);
    return () => { timeline.mark(`screen:unmount:${screenName}`); };
  }, [screenName]);

  const markReady = useCallback(() => {
    if (markedReady.current) return;
    markedReady.current = true;
    const readyAt = timeline.now();
    timeline.mark(`screen:ready:${screenName}`, {
      mountedAt: mountedAt.current,
      readyAt,
      ttfr: readyAt - mountedAt.current,
    });
  }, [screenName]);

  return { markReady };
}
