/**
 * PerfProvider — top-level context provider.
 * Initializes all collectors and provides configuration to child components.
 */
import React, { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import {
  timeline,
  perfClock,
  BudgetEngine,
  computeFrameStats,
  type PerfEvent,
  type BudgetConfig,
  type DeviceTier,
  type BudgetViolation,
} from '@rn-perf-kit/core';
import { setFiberHookEnabled, ensureFiberHook } from '@rn-perf-kit/react';
import {
  NativePerfKit,
  startStallDetector,
  stopStallDetector,
  startFrameCollection,
  stopFrameCollection,
  startSystemMonitoring,
  stopSystemMonitoring,
  classifyDeviceTier,
  warnNativeMissing,
} from '@rn-perf-kit/native';
import { installNetworkInterceptor, uninstallNetworkInterceptor } from '@rn-perf-kit/adapters';

export type PerfMode = 'light' | 'deep';

export interface PerfProviderConfig {
  enabled?: boolean;
  mode?: PerfMode;
  budgets?: BudgetConfig;
  onViolation?: (violation: BudgetViolation) => void;
  deviceTier?: DeviceTier;
  /** Timeline size in events (default 20,000). Raise it for long deep-mode sessions. */
  bufferCapacity?: number;
}

interface PerfContextValue {
  enabled: boolean;
  mode: PerfMode;
  tier: DeviceTier;
}

const PerfContext = createContext<PerfContextValue>({ enabled: false, mode: 'light', tier: 'MID' });

export function PerfProvider({
  children,
  enabled = false,
  mode = 'light',
  budgets,
  onViolation,
  deviceTier,
  bufferCapacity,
}: PerfProviderConfig & { children: ReactNode }): React.JSX.Element {
  // Turn recording on during render, not in an effect: children's effects run before
  // this component's, so a screen calling markReady() while mounting would otherwise
  // be dropped. Idempotent; the effect below turns it off.
  if (enabled) {
    if (bufferCapacity && bufferCapacity !== timeline.capacity) timeline.setCapacity(bufferCapacity);
    timeline.enabled = true;
  }
  const [tier, setTier] = useState<DeviceTier>(deviceTier ?? 'MID');
  const [refreshRateHz, setRefreshRateHz] = useState(60);

  useEffect(() => {
    if (!NativePerfKit) return;
    try {
      const info = NativePerfKit.getDeviceInfo();
      if (info.refreshRateHz > 0) setRefreshRateHz(info.refreshRateHz);
      if (!deviceTier) setTier(classifyDeviceTier(info));
    } catch {}
  }, [deviceTier]);

  useEffect(() => {
    if (!enabled) return;
    timeline.enabled = true;
    ensureFiberHook();
    setFiberHookEnabled(true, mode === 'deep');
    startStallDetector();
    installNetworkInterceptor();

    const native = NativePerfKit;
    if (native) {
      perfClock.install(() => native.nativeNow());
      startFrameCollection();
      startSystemMonitoring();
      trackStartup(native);
    } else {
      warnNativeMissing();
    }

    return () => {
      if (native) {
        stopSystemMonitoring();
        stopFrameCollection();
        perfClock.uninstall();
      }
      uninstallNetworkInterceptor();
      stopStallDetector();
      setFiberHookEnabled(false);
      timeline.enabled = false;
    };
  }, [enabled, mode]);

  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;
  const budgetsKey = JSON.stringify(budgets ?? null);
  // Events already judged, so re-subscribing (tier/budget change) never reports twice
  const checkedRef = useRef(new WeakSet<object>());

  useEffect(() => {
    if (!enabled || !budgets) return;
    const engine = new BudgetEngine(budgets, tier, (v) => onViolationRef.current?.(v));
    const checked = checkedRef.current;
    const navStart = new Map<string, number>();

    const onMark = (e: PerfEvent) => {
      if (e.type !== 'mark' || checked.has(e)) return;
      checked.add(e);
      if (e.name.startsWith('screen:ready:')) {
        const { ttfr } = (e.data ?? {}) as { ttfr?: number };
        if (typeof ttfr === 'number') engine.check('screen', ttfr, e.name.slice('screen:ready:'.length), e.t);
      } else if (e.name === 'startup') {
        const { durMs } = (e.data ?? {}) as { durMs?: number };
        if (typeof durMs === 'number') engine.check('startup', durMs, undefined, e.t);
      }
    };
    // Navigation budget: tap (or dispatch) -> interactive, keyed "From→To"
    const onNav = (e: PerfEvent) => {
      if (e.type !== 'nav') return;
      if (e.phase === 'tap' || (e.phase === 'dispatch' && !navStart.has(e.navId))) {
        navStart.set(e.navId, e.t);
      } else if (e.phase === 'interactive' && !checked.has(e)) {
        checked.add(e);
        const start = navStart.get(e.navId);
        navStart.delete(e.navId);
        if (start !== undefined) engine.check('navigation', e.t - start, `${e.fromRoute ?? ''}→${e.route}`, e.t);
      }
    };
    // Events recorded before this subscription (e.g. the first screen) still count
    for (const e of timeline.query()) {
      if (e.type === 'mark') onMark(e);
      else if (e.type === 'nav') onNav(e);
    }
    const offs = [
      timeline.on('mark', onMark),
      timeline.on('nav', onNav),
      timeline.on('commit', (e) => {
        if (e.type === 'commit' && e.dur > 0) {
          engine.check('commit', e.dur, undefined, e.t);
        }
      }),
    ];
    // Native frames arrive in 250 ms batches: judge the 1 s window [now-1250, now-250].
    // Idle windows (nothing drawn) are skipped — an idle screen is not a slow screen.
    const fpsTimer = setInterval(() => {
      const now = timeline.now();
      const stats = computeFrameStats(timeline.query(now - 1250, now - 250), 1000, refreshRateHz);
      if (stats.active) {
        engine.check('fps', stats.uiFps, undefined, now);
        engine.check('dropped-frames', (stats.droppedFrames / refreshRateHz) * 100, undefined, now);
      }
    }, 1000);
    return () => {
      offs.forEach((off) => off());
      clearInterval(fpsTimer);
    };
  }, [enabled, budgetsKey, tier, refreshRateHz]);

  return (
    <PerfContext.Provider value={{ enabled, mode, tier }}>
      {children}
    </PerfContext.Provider>
  );
}

/**
 * Startup = process start -> the first usePerfScreen().markReady() of the session.
 * Recorded once per JS runtime as a `startup` mark ({ durMs }), which the `startup`
 * budget and the CLI read.
 */
let startupTracked = false;
function trackStartup(native: NonNullable<typeof NativePerfKit>): void {
  if (startupTracked || typeof native.getProcessStartTime !== 'function') return;
  let processStart: number;
  try {
    processStart = native.getProcessStartTime();
  } catch {
    return;
  }
  if (!(processStart > 0)) return;
  startupTracked = true;
  const startJs = perfClock.nativeToJs(processStart);
  const record = (e: PerfEvent) => {
    off?.();
    off = null;
    const screen = e.type === 'mark' ? e.name.slice('screen:ready:'.length) : '';
    timeline.mark('startup', { durMs: e.t - startJs, screen });
  };
  const isReady = (e: PerfEvent) => e.type === 'mark' && e.name.startsWith('screen:ready:');
  let off: (() => void) | null = null;
  const already = timeline.query().find(isReady);
  if (already) {
    record(already);
    return;
  }
  off = timeline.on('mark', (e) => {
    if (isReady(e)) record(e);
  });
}

export function usePerfContext(): PerfContextValue {
  return useContext(PerfContext);
}
