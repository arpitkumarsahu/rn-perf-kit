/**
 * PerfProvider — top-level context provider.
 * Initializes all collectors and provides configuration to child components.
 */
import React, { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import {
  timeline,
  perfClock,
  BudgetEngine,
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

  useEffect(() => {
    if (deviceTier || !NativePerfKit) return;
    try {
      setTier(classifyDeviceTier(NativePerfKit.getDeviceInfo()));
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
    } else {
      warnNativeMissing();
    }

    return () => {
      if (native) {
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
    const fpsTimer = setInterval(() => {
      const now = timeline.now();
      const frames = timeline.query(now - 1250, now - 250).filter((e) => e.type === 'frame').length;
      if (frames > 0) engine.check('fps', frames, undefined, now);
    }, 1000);
    return () => {
      offs.forEach((off) => off());
      clearInterval(fpsTimer);
    };
  }, [enabled, budgetsKey, tier]);

  return (
    <PerfContext.Provider value={{ enabled, mode, tier }}>
      {children}
    </PerfContext.Provider>
  );
}

export function usePerfContext(): PerfContextValue {
  return useContext(PerfContext);
}
