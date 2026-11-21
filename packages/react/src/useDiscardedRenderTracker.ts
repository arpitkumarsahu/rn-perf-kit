/**
 * Discarded render tracker for concurrent React.
 *
 * Every render registers a token; the layout effect of the render that commits marks it
 * committed. Renders are grouped by the JS task they ran in. When a group is old enough,
 * renders that never committed are reported as discarded.
 *
 * StrictMode (dev) calls each component twice per render and commits only one of the two
 * calls, in the same task. Those twins are not discards: in a group where some renders
 * committed, each committed render accounts for one uncommitted twin.
 */
import { useLayoutEffect, useRef } from 'react';
import { timeline } from '@rn-perf-kit/core';

interface Group {
  name: string;
  t: number;
  rendered: number;
  committed: number;
}

// Long enough for a slow concurrent render to reach its commit before being judged
const STALE_MS = 1000;
const groups = new Map<string, Group>(); // key: `${taskId}|${name}`
let sweepTimer: ReturnType<typeof setInterval> | null = null;

// Task id: bumped by a microtask, which only runs after the current task finishes, so
// every render inside one synchronous React work loop shares an id.
let taskId = 0;
let bumpScheduled = false;
const scheduleMicrotask: (cb: () => void) => void =
  typeof queueMicrotask === 'function' ? queueMicrotask : (cb) => void Promise.resolve().then(cb);

function currentTask(): number {
  if (!bumpScheduled) {
    bumpScheduled = true;
    scheduleMicrotask(() => {
      taskId++;
      bumpScheduled = false;
    });
  }
  return taskId;
}

function sweep(): void {
  const now = timeline.now();
  const discardedByName = new Map<string, { t: number; count: number }>();
  groups.forEach((g, key) => {
    if (now - g.t <= STALE_MS) return;
    groups.delete(key);
    const discarded = g.committed > 0 ? Math.max(0, g.rendered - 2 * g.committed) : g.rendered;
    if (discarded === 0) return;
    const agg = discardedByName.get(g.name);
    if (agg) agg.count += discarded;
    else discardedByName.set(g.name, { t: g.t, count: discarded });
  });
  discardedByName.forEach((agg, name) =>
    timeline.add({ type: 'render-discarded', t: agg.t, component: name, renderCount: agg.count })
  );
  if (groups.size === 0) stopDiscardedRenderSweep();
}

function startSweep(): void {
  if (sweepTimer === null) sweepTimer = setInterval(sweep, 200);
}

export function stopDiscardedRenderSweep(): void {
  if (sweepTimer !== null) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

export function useDiscardedRenderTracker(componentName: string): void {
  const groupKeyRef = useRef<string | null>(null);
  let key: string | null = null;
  // Zero work while profiling is off (PerfProvider disabled or not mounted)
  if (timeline.enabled) {
    key = `${currentTask()}|${componentName}`;
    const g = groups.get(key);
    if (g) g.rendered++;
    else groups.set(key, { name: componentName, t: timeline.now(), rendered: 1, committed: 0 });
    startSweep();
  }
  groupKeyRef.current = key;
  useLayoutEffect(() => {
    const committedKey = groupKeyRef.current;
    if (committedKey === null) return;
    groupKeyRef.current = null; // StrictMode re-runs effects: count each commit once
    const g = groups.get(committedKey);
    if (g) g.committed++;
  });
}
