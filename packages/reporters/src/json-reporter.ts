/**
 * JSON Reporter — source-of-truth format for CLI and CI pipeline.
 */
import { timeline, type PerfEvent, type DeviceTier } from '@rn-perf-kit/core';

// Defined by React Native/Metro; may be absent when the reporter runs elsewhere (CLI, tests)
declare const __DEV__: boolean | undefined;
import {
  analyzeNavigation,
  analyzeRenderCauses,
  analyzeFrameAttribution,
  analyzeCascades,
  type AnalyzerContext,
} from '@rn-perf-kit/analyzers';

export interface SessionReport {
  version: '1';
  capturedAt: string;
  durationMs: number;
  device: { tier: string; os: string; osVersion: string; totalRamMb?: number; refreshRateHz?: number };
  build: { rnVersion?: string; reactVersion?: string; isDebug: boolean };
  events: PerfEvent[];
  findings: unknown[];
  summary: {
    totalFrames: number;
    jankFrames: number;
    jankPct: number;
    totalCommits: number;
    jsStalls: number;
    navigations: number;
    /** Component renders with no prop/state/context change (deep mode only). */
    wastedRenders?: number;
    wastedPct?: number;
    /** Events lost because the timeline buffer was full: the report is incomplete if > 0. */
    evictedEvents?: number;
  };
}

export interface ReportOptions {
  device?: SessionReport['device'];
  build?: Partial<SessionReport['build']>;
  findings?: unknown[];
  windowMs?: number;
}

export function generateJsonReport(options: ReportOptions = {}): SessionReport {
  const events = timeline.recent(options.windowMs ?? 60_000);
  const now = timeline.now();
  const refreshRateHz = options.device?.refreshRateHz ?? 60;
  const ctx: AnalyzerContext = {
    tier: (options.device?.tier as DeviceTier) ?? 'MID',
    refreshRateHz,
    frameBudgetMs: 1000 / refreshRateHz,
  };

  const navResults = analyzeNavigation(events, ctx);
  const renderCauses = analyzeRenderCauses(events, ctx);
  const frameAttrib = analyzeFrameAttribution(events, ctx);
  const cascades = analyzeCascades(events, ctx);

  const findings = [
    ...navResults.flatMap((r) => r.findings),
    ...renderCauses.findings,
    ...frameAttrib.findings,
    ...cascades,
    ...(options.findings ?? []),
  ];

  const frames = events.filter((e) => e.type === 'frame') as Extract<PerfEvent, { type: 'frame' }>[];
  const jankFrames = frames.filter((f) => f.janky);
  const commits = events.filter((e) => e.type === 'commit');
  const stalls = events.filter((e) => e.type === 'stall');
  const navEvents = events.filter((e) => e.type === 'nav' && e.phase === 'dispatch');
  // Events are stored in arrival order, which is not strictly time order
  let firstT = now;
  let lastT = now;
  if (events.length > 0) {
    firstT = Infinity;
    lastT = -Infinity;
    for (const e of events) {
      if (e.t < firstT) firstT = e.t;
      if (e.t > lastT) lastT = e.t;
    }
  }

  return {
    version: '1',
    capturedAt: new Date().toISOString(),
    durationMs: lastT - firstT,
    device: options.device ?? { tier: 'UNKNOWN', os: 'unknown', osVersion: 'unknown' },
    build: { isDebug: typeof __DEV__ !== 'undefined' ? __DEV__ : true, ...options.build },
    events,
    findings,
    summary: {
      totalFrames: frames.length,
      jankFrames: jankFrames.length,
      jankPct: frames.length > 0 ? (jankFrames.length / frames.length) * 100 : 0,
      totalCommits: commits.length,
      jsStalls: stalls.length,
      navigations: navEvents.length,
      wastedRenders: renderCauses.stats.wastedFibers,
      wastedPct: renderCauses.stats.wastedPct,
      evictedEvents: timeline.evicted,
    },
  };
}

export function serializeReport(report: SessionReport): string {
  return JSON.stringify(report, null, 2);
}
