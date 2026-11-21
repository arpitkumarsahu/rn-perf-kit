/**
 * Discarded render tracker for concurrent React.
 */
import { useLayoutEffect, useRef } from 'react';
import { timeline } from '@rn-perf-kit/core';

const pending = new Map<number, { name: string; t: number }>();
let tokenCounter = 0;
let sweepTimer: ReturnType<typeof setInterval> | null = null;
const STALE_MS = 100;

function nextToken(): number { return ++tokenCounter; }

function startSweep(): void {
  if (sweepTimer !== null) return;
  sweepTimer = setInterval(() => {
    const now = timeline.now();
    const byName = new Map<string, { t: number; count: number }>();
    pending.forEach((entry, token) => {
      if (now - entry.t <= STALE_MS) return;
      pending.delete(token);
      const agg = byName.get(entry.name);
      if (agg) agg.count++;
      else byName.set(entry.name, { t: entry.t, count: 1 });
    });
    byName.forEach((agg, name) =>
      timeline.add({ type: 'render-discarded', t: agg.t, component: name, renderCount: agg.count })
    );
    if (pending.size === 0) {
      if (sweepTimer !== null) {
        clearInterval(sweepTimer);
        sweepTimer = null;
      }
    }
  }, 200);
}

export function stopDiscardedRenderSweep(): void {
  if (sweepTimer !== null) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  pending.clear();
}

export function useDiscardedRenderTracker(componentName: string): void {
  const tokenRef = useRef<number>(0);
  const token = nextToken();
  tokenRef.current = token;
  pending.set(token, { name: componentName, t: timeline.now() });
  startSweep();
  useLayoutEffect(() => {
    pending.delete(tokenRef.current);
  });
}
