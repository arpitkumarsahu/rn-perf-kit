/**
 * Versioned fiber hook adapter.
 * Installs __REACT_DEVTOOLS_GLOBAL_HOOK__ before React initializes.
 * Compatible with React 18.x and React 19.x (New Architecture).
 *
 * IMPORTANT: Fiber internals are private. All access is isolated here.
 */

import { timeline } from '@rn-perf-kit/core';
import type { RenderedFiber, RenderCause } from '@rn-perf-kit/core';

// React internal flags (ReactFiberFlags.js)
const PerformedWork = 0b000000000000000000000000001;

const COMPONENT_TAGS = new Set([
  0 /* FunctionComponent */,
  1 /* ClassComponent */,
  11 /* ForwardRef */,
  14 /* MemoComponent */,
  15 /* SimpleMemoComponent */,
]);
const CLASS_COMPONENT = 1;
const MAX_FIBERS_PER_COMMIT = 300;

const WRAPPED = Symbol.for('rn-perf-kit.commit');

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
  const g = globalThis as any;
  if (g.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    ensureFiberHook();
    return;
  }
  let nextId = 0;
  g.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: false,
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer: unknown) {
      const id = ++nextId;
      this.renderers.set(id, renderer);
      return id;
    },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
  };
  ensureFiberHook();
}

/**
 * Call again from PerfProvider on enable so if DevTools swapped the hook, we chain onto it.
 */
export function ensureFiberHook(): void {
  const hook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook || hook.onCommitFiberRoot?.[WRAPPED]) return;
  const original = hook.onCommitFiberRoot;
  const wrapper = function (
    this: unknown,
    id: number,
    root: FiberRoot,
    priority?: unknown,
    didError?: boolean
  ) {
    if (enabled) {
      try {
        processCommit(root);
      } catch {}
    }
    return typeof original === 'function' ? original.call(this, id, root, priority, didError) : undefined;
  };
  (wrapper as any)[WRAPPED] = true;
  hook.onCommitFiberRoot = wrapper;
}

export function setFiberHookEnabled(value: boolean, deep = false): void {
  enabled = value;
  deepMode = deep;
}

function processCommit(root: FiberRoot): void {
  const now = timeline.now();
  const current = root.current;
  const dur = typeof current.actualDuration === 'number' ? current.actualDuration : -1;
  const fibers: RenderedFiber[] = [];
  if (deepMode) collectRendered(current, fibers);
  timeline.add({
    type: 'commit',
    t: dur > 0 ? now - dur : now,
    dur,
    fibers,
    phase: current.alternate ? 'update' : 'mount',
  });
}

function collectRendered(root: Fiber, out: RenderedFiber[]): void {
  const stack: Fiber[] = [root];
  while (stack.length > 0 && out.length < MAX_FIBERS_PER_COMMIT) {
    const fiber = stack.pop()!;
    const prev = fiber.alternate;
    if (prev && COMPONENT_TAGS.has(fiber.tag) && (fiber.flags & PerformedWork) !== 0) {
      const cause = classifyRenderCause(fiber, prev);
      out.push({
        name: getFiberName(fiber),
        cause,
        actualDuration: fiber.actualDuration ?? 0,
        wasted: isWasted(cause),
      });
    }
    // A bailed-out subtree shares its child with the previous tree: nothing below it rendered
    if (fiber.child && !(prev && prev.child === fiber.child)) stack.push(fiber.child);
    if (fiber.sibling) stack.push(fiber.sibling);
  }
}

function stateChanged(fiber: Fiber, prev: Fiber): boolean {
  if (fiber.tag === CLASS_COMPONENT) return fiber.memoizedState !== prev.memoizedState;
  let h: any = fiber.memoizedState;
  let p: any = prev.memoizedState;
  while (h && p) {
    if (h.queue != null && h.memoizedState !== p.memoizedState) return true;
    h = h.next;
    p = p.next;
  }
  return false;
}

function classifyRenderCause(fiber: Fiber, prev: Fiber): RenderCause {
  if (stateChanged(fiber, prev)) return 'state-change';
  const a = prev.memoizedProps ?? {};
  const b = fiber.memoizedProps ?? {};
  if (a === b) return fiber.dependencies?.firstContext ? 'context-change' : 'parent-rerender';
  const keys = Object.keys(b);
  if (keys.length !== Object.keys(a).length) return 'prop-change';
  let changed = false;
  for (const k of keys) {
    if (a[k] === b[k]) continue;
    changed = true;
    if (!isSameShape(a[k], b[k])) return 'prop-change';
  }
  return changed ? 'unstable-reference' : 'parent-rerender';
}

function isSameShape(x: unknown, y: unknown): boolean {
  if (typeof x === 'function' && typeof y === 'function') return true;
  if (x && y && typeof x === 'object' && typeof y === 'object') return shallowEqual(x as any, y as any);
  return false;
}

function getFiberName(fiber: Fiber): string {
  let type: any = fiber.type;
  if (!type) return 'Unknown';
  if (typeof type === 'string') return type;
  if (typeof type === 'function') {
    return type.displayName ?? type.name ?? 'Anonymous';
  }
  if (typeof type === 'object') {
    if (type.displayName) return type.displayName;
    if (type.render) {
      return type.render.displayName ?? type.render.name ?? 'ForwardRef';
    }
    if (type.type) {
      const inner = type.type;
      if (typeof inner === 'function') return inner.displayName ?? inner.name ?? 'Memo';
      if (typeof inner === 'string') return inner;
    }
  }
  return 'Unknown';
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
