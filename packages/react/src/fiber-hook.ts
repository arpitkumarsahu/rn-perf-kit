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
const SUSPENSE_COMPONENT = 13;
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
  return?: Fiber | null;
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

// A commit that starts while the JS task of the previous commit is still running was
// triggered by that commit's effects (setState in useLayoutEffect, or a synchronously
// flushed useEffect). React's Profiler calls this a "nested update"; the DevTools hook
// doesn't say, so detect it: the flag is cleared by a microtask, which only runs once
// the current task has finished.
let commitInCurrentTask = false;
const clearTaskFlag = () => {
  commitInCurrentTask = false;
};
const scheduleMicrotask: (cb: () => void) => void =
  typeof queueMicrotask === 'function' ? queueMicrotask : (cb) => void Promise.resolve().then(cb);

interface SuspenseToggle {
  boundary: string;
  showingFallback: boolean;
}

function processCommit(root: FiberRoot): void {
  const now = timeline.now();
  const current = root.current;
  const fibers: RenderedFiber[] = [];
  const suspense: SuspenseToggle[] = [];
  // Commits where only ignored subtrees rendered (e.g. the PerfOverlay HUD) are the
  // profiler measuring itself: drop them so they never reach the timeline.
  if (!walkCommit(current, deepMode ? fibers : null, suspense)) return;
  const nested = commitInCurrentTask;
  if (!commitInCurrentTask) {
    commitInCurrentTask = true;
    scheduleMicrotask(clearTaskFlag);
  }
  const dur = typeof current.actualDuration === 'number' ? current.actualDuration : -1;
  const t = dur > 0 ? now - dur : now;
  timeline.add({
    type: 'commit',
    t,
    dur,
    fibers,
    phase: !current.alternate ? 'mount' : nested ? 'nested-update' : 'update',
  });
  for (const s of suspense) {
    timeline.add({ type: 'suspense', t, boundary: s.boundary, showingFallback: s.showingFallback });
  }
}

/** Components opt out of profiling with `Component.__rnPerfKitIgnore = true`. */
const IGNORE_KEY = '__rnPerfKitIgnore';

function isIgnored(fiber: Fiber): boolean {
  const type = fiber.type as any;
  if (!type || (typeof type !== 'function' && typeof type !== 'object')) return false;
  return (
    type[IGNORE_KEY] === true ||
    type.type?.[IGNORE_KEY] === true || // memo(Component)
    type.render?.[IGNORE_KEY] === true // forwardRef(Component)
  );
}

/**
 * Walks the fibers that took part in this commit, skipping ignored subtrees.
 * Returns true if any non-ignored component mounted or rendered.
 * With `out`, also records re-rendered components (deep mode); without it, stops at
 * the first piece of real work, so light mode stays cheap.
 */
function walkCommit(root: Fiber, out: RenderedFiber[] | null, suspense: SuspenseToggle[]): boolean {
  let hasWork = false;
  const stack: Fiber[] = [root];
  while (stack.length > 0) {
    const fiber = stack.pop()!;
    if (fiber.sibling) stack.push(fiber.sibling);
    if (isIgnored(fiber)) continue;
    const prev = fiber.alternate;
    // Suspense boundary switched between fallback (memoizedState set) and content
    if (out && fiber.tag === SUSPENSE_COMPONENT && prev) {
      const showingFallback = fiber.memoizedState != null;
      if (showingFallback !== (prev.memoizedState != null)) {
        suspense.push({ boundary: nearestComponentName(fiber), showingFallback });
      }
    }
    if (COMPONENT_TAGS.has(fiber.tag)) {
      // No alternate on a fiber reached by this walk = it mounted in this commit
      const rendered = !prev || (fiber.flags & PerformedWork) !== 0;
      if (rendered) {
        hasWork = true;
        if (!out || out.length >= MAX_FIBERS_PER_COMMIT) return true;
        if (prev) {
          const cause = classifyRenderCause(fiber, prev);
          out.push({
            name: getFiberName(fiber),
            cause,
            actualDuration: fiber.actualDuration ?? 0,
            wasted: isWasted(cause),
          });
        }
      }
    }
    // A bailed-out subtree shares its child with the previous tree: nothing below it rendered
    if (fiber.child && !(prev && prev.child === fiber.child)) stack.push(fiber.child);
  }
  return hasWork;
}

function nearestComponentName(fiber: Fiber): string {
  let f: Fiber | null | undefined = fiber.return;
  while (f) {
    if (COMPONENT_TAGS.has(f.tag)) return getFiberName(f);
    f = f.return;
  }
  return 'Suspense';
}

/**
 * Which hook state changed between the two renders, if any.
 * useState/useReducer queues have `dispatch`; useSyncExternalStore (react-redux
 * useSelector, zustand, TanStack Query) queues have `getSnapshot`.
 */
function stateCause(fiber: Fiber, prev: Fiber): RenderCause | null {
  if (fiber.tag === CLASS_COMPONENT) {
    return fiber.memoizedState !== prev.memoizedState ? 'state-change' : null;
  }
  let storeChanged = false;
  let storeChangedForReal = false;
  let h: any = fiber.memoizedState;
  let p: any = prev.memoizedState;
  while (h && p) {
    if (h.queue != null && h.memoizedState !== p.memoizedState) {
      if (typeof h.queue.getSnapshot === 'function') {
        storeChanged = true;
        if (!isSameShape(h.memoizedState, p.memoizedState)) storeChangedForReal = true;
      } else {
        return 'state-change';
      }
    }
    h = h.next;
    p = p.next;
  }
  if (!storeChanged) return null;
  return storeChangedForReal ? 'store-subscription' : 'unstable-selector';
}

function classifyRenderCause(fiber: Fiber, prev: Fiber): RenderCause {
  const fromState = stateCause(fiber, prev);
  if (fromState) return fromState;
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
  return cause === 'parent-rerender' || cause === 'unstable-reference' || cause === 'unstable-selector';
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
