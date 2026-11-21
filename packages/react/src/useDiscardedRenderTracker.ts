/**
 * Discarded render tracker for concurrent React.
 */
import { useLayoutEffect } from 'react';
import { timeline } from '@rn-perf-kit/core';

const pending = new Map<number, { name: string; t: number; count: number }>();
let tokenCounter = 0;
let sweepTimer: ReturnType<typeof setInterval> | null = null;
const STALE_MS = 100;

function nextToken(): number { return ++tokenCounter; }

function startSweep(): void {
  if (sweepTimer !== null) return;
  sweepTimer = setInterval(() => {
    const now = timeline.now();
    pending.forEach((entry, token) => {
      if (now - entry.t > STALE_MS) {
        timeline.add({ type: 'render-discarded', t: entry.t, component: entry.name, renderCount: entry.count });
        pending.delete(token);
      }
    });
  }, 200);
}

export function stopDiscardedRenderSweep(): void {
  if (sweepTimer !== null) { clearInterval(sweepTimer); sweepTimer = null; }
  pending.clear();
}

export function useDiscardedRenderTracker(componentName: string): void {
  const token = nextToken();
  const existing = pending.get(token);
  pending.set(token, { name: componentName, t: timeline.now(), count: existing ? existing.count + 1 : 1 });
  startSweep();
  useLayoutEffect(() => { pending.delete(token); });
}
