/**
 * Core event model for rn-perf-kit.
 * All performance signals are expressed as PerfEvent union types.
 */

export type NavPhase =
  | 'tap'
  | 'dispatch'
  | 'first-commit'
  | 'transition-start'
  | 'transition-end'
  | 'content-ready'
  | 'interactive';

export interface FrameBreakdown {
  input: number;
  animation: number;
  layoutMeasure: number;
  draw: number;
  sync: number;
  gpu: number;
}

export interface RenderedFiber {
  name: string;
  cause: RenderCause;
  actualDuration: number;
  wasted: boolean;
}

export type RenderCause =
  | 'parent-rerender'
  | 'unstable-reference'
  | 'state-change'
  | 'context-change'
  | 'store-subscription'
  // A store selector (useSelector / zustand / useSyncExternalStore) returned a NEW object
  // with the same contents, so the component re-rendered for nothing.
  | 'unstable-selector'
  | 'prop-change'
  | 'unknown';

export type StoreSource = 'redux' | 'zustand' | 'query' | 'context' | 'custom';

export type PerfEvent =
  | {
      type: 'frame';
      t: number;
      dur: number;
      janky: boolean;
      breakdown?: FrameBreakdown;
    }
  | {
      type: 'commit';
      t: number;
      dur: number;
      lane?: string;
      fibers: RenderedFiber[];
      phase?: 'mount' | 'update' | 'nested-update';
    }
  | {
      type: 'render-discarded';
      t: number;
      component: string;
      renderCount: number;
    }
  | {
      type: 'nav';
      t: number;
      phase: NavPhase;
      route: string;
      fromRoute?: string;
      navId: string;
    }
  | {
      type: 'store';
      t: number;
      source: StoreSource;
      key: string;
      storeName?: string;
    }
  | {
      type: 'net';
      t: number;
      dur: number;
      url: string;
      bytes: number;
      status?: number;
    }
  | { type: 'stall'; t: number; dur: number }
  | { type: 'gc'; t: number; dur: number }
  | {
      type: 'thermal';
      t: number;
      status: 'none' | 'light' | 'moderate' | 'severe' | 'critical' | 'emergency' | 'shutdown';
    }
  | {
      type: 'memory';
      t: number;
      usedMb: number;
      availableMb: number;
      trimLevel?: number;
    }
  | { type: 'mark'; t: number; name: string; data?: unknown }
  // <PerfTrace id>: one React Profiler measurement of a subtree. Kept separate from
  // 'commit' so traced subtrees are not counted as extra commits.
  | {
      type: 'trace';
      t: number;
      dur: number;
      id: string;
      phase: 'mount' | 'update' | 'nested-update';
    }
  // A Suspense boundary switched between fallback and content (deep mode).
  | { type: 'suspense'; t: number; boundary: string; showingFallback: boolean };

export type PerfEventType = PerfEvent['type'];
