/**
 * Versioned fiber hook adapter.
 * Installs __REACT_DEVTOOLS_GLOBAL_HOOK__ before React initializes.
 * Compatible with: React 18.x (New Architecture)
 *
 * IMPORTANT: Fiber internals are private. All access is isolated here.
 * Version this file per React version.
 */

import { timeline } from '@rn-perf-kit/core';
import type { RenderedFiber, RenderCause } from '@rn-perf-kit/core';

// React internal flags (ReactFiberFlags.js) — may change between versions
const PerformedWork = 0b000000000000000000000000001;

interface Fiber {
  tag: number;
  type: unknown;
  key: string | null;
  memoizedProps: Record<string, unknown> | null;
  memoizedState: unknown;
  pendingProps: Record<string, unknown> | null;
  flags: number;
  alternate: Fiber | null;
  dependencies: { firstContext: unknown } | null;
  child: Fiber | null;
  sibling: Fiber | null;
  actualDuration?: number;
  selfBaseDuration?: number;
}

type FiberRoot = { current: Fiber };

let enabled = false;
let deepMode = false;

export function installFiberHook(): void {
  if (typeof global === 'undefined') return;
  if ((global as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) return;

  (global as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: false,
    supportsFiber: true,
    renderers: new Map(),
    inject(_renderer: unknown) { return 1; },
    onCommitFiberRoot(_rendererID: number, root: FiberRoot, _priority: unknown) {
      if (!enabled) return;
      try { processCommit(root); } catch (_e) {}
    },
    onCommitFiberUnmount(_rendererID: number, _fiber: Fiber) {},
    onPostCommitFiberRoot(_rendererID: number, _root: FiberRoot) {},
  };
}

export function setFiberHookEnabled(value: boolean, deep = false): void {
  enabled = value;
  deepMode = deep;
}

function processCommit(root: FiberRoot): void {
  const t = timeline.now();
  const fibers: RenderedFiber[] = [];
  if (deepMode) walkFibers(root.current, fibers);
  timeline.add({ type: 'commit', t, dur: 0, fibers, phase: 'update' });
}

function walkFibers(fiber: Fiber | null, out: RenderedFiber[]): void {
  if (!fiber) return;
  if (fiber.flags & PerformedWork) {
    const name = getFiberName(fiber);
    const cause = classifyRenderCause(fiber);
    out.push({ name, cause, actualDuration: fiber.actualDuration ?? 0, wasted: isWasted(cause) });
  }
  walkFibers(fiber.child, out);
  walkFibers(fiber.sibling, out);
}

function getFiberName(fiber: Fiber): string {
  if (typeof fiber.type === 'string') return fiber.type;
  if (typeof fiber.type === 'function') {
    return (fiber.type as Function).displayName ?? (fiber.type as Function).name ?? 'Anonymous';
  }
  return 'Unknown';
}

function classifyRenderCause(fiber: Fiber): RenderCause {
  const alt = fiber.alternate;
  if (!alt) return 'prop-change';
  if (fiber.memoizedState !== alt.memoizedState) return 'state-change';
  if (fiber.dependencies?.firstContext) return 'context-change';
  const prev = alt.memoizedProps;
  const next = fiber.memoizedProps ?? fiber.pendingProps;
  if (!shallowEqual(prev, next)) {
    if (deepEqual(prev, next)) return 'unstable-reference';
    return 'prop-change';
  }
  return 'parent-rerender';
}

function isWasted(cause: RenderCause): boolean {
  return cause === 'parent-rerender' || cause === 'unstable-reference';
}

function shallowEqual(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k]);
}

function deepEqual(a: unknown, b: unknown): boolean {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}
