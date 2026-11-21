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
}: PerfProviderConfig & { children: ReactNode }): React.JSX.Element {
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

  useEffect(() => {
    if (!enabled || !budgets) return;
    const engine = new BudgetEngine(budgets, tier, (v) => onViolationRef.current?.(v));
    const offs = [
      timeline.on('mark', (e) => {
        if (e.type === 'mark' && e.name.startsWith('screen:ready:')) {
          const { ttfr } = (e.data ?? {}) as { ttfr: number };
          if (typeof ttfr === 'number') {
            engine.check('screen', ttfr, e.name.slice('screen:ready:'.length), e.t);
          }
        }
      }),
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
      if (stats.active) engine.check('fps', stats.uiFps, undefined, now);
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

export function usePerfContext(): PerfContextValue {
  return useContext(PerfContext);
}
