/**
 * PerfProvider — top-level context provider.
 * Initializes all collectors and provides configuration to child components.
 */
import React, { createContext, useContext, useEffect, type ReactNode } from 'react';
import { timeline, BudgetEngine, type BudgetConfig, type DeviceTier } from '@rn-perf-kit/core';
import type { BudgetViolation } from '@rn-perf-kit/core';
import { setFiberHookEnabled } from '@rn-perf-kit/react';
import { startStallDetector, stopStallDetector } from '@rn-perf-kit/native';
import { installFetchInterceptor, uninstallFetchInterceptor } from '@rn-perf-kit/adapters';

export type PerfMode = 'light' | 'deep';

export interface PerfProviderConfig {
  enabled?: boolean;
  mode?: PerfMode;
  budgets?: BudgetConfig;
  onViolation?: (violation: BudgetViolation) => void;
  deviceTier?: DeviceTier;
}

interface PerfContextValue { enabled: boolean; mode: PerfMode; tier: DeviceTier }

const PerfContext = createContext<PerfContextValue>({ enabled: false, mode: 'light', tier: 'MID' });

export function PerfProvider({
  children,
  enabled = false,
  mode = 'light',
  budgets,
  onViolation,
  deviceTier = 'MID',
}: PerfProviderConfig & { children: ReactNode }): React.JSX.Element {
  useEffect(() => {
    if (!enabled) return;
    timeline.enabled = true;
    startStallDetector();
    installFetchInterceptor();
    setFiberHookEnabled(true, mode === 'deep');
    return () => {
      stopStallDetector();
      uninstallFetchInterceptor();
      setFiberHookEnabled(false);
      timeline.enabled = false;
    };
  }, [enabled, mode]);

  return (
    <PerfContext.Provider value={{ enabled, mode, tier: deviceTier }}>
      {children}
    </PerfContext.Provider>
  );
}

export function usePerfContext(): PerfContextValue {
  return useContext(PerfContext);
}
