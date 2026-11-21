import type { DeviceTier } from '@rn-perf-kit/core';

export type FindingSeverity = 'critical' | 'warning' | 'info';

export interface Finding {
  id: string;
  severity: FindingSeverity;
  category: 'navigation' | 'render' | 'frame' | 'memory' | 'cascade';
  title: string;
  detail: string;
  suggestion: string;
  route?: string;
  component?: string;
  t: number;
  meta?: Record<string, unknown>;
}

export interface AnalyzerContext {
  tier: DeviceTier;
  refreshRateHz: number;
  frameBudgetMs: number;
}
