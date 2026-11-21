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
  | { type: 'mark'; t: number; name: string; data?: unknown };

export type PerfEventType = PerfEvent['type'];
