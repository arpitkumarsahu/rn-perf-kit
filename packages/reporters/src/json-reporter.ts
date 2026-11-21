/**
 * JSON Reporter — source-of-truth format for CLI and CI pipeline.
 */
import { timeline, type PerfEvent } from '@rn-perf-kit/core';

export interface SessionReport {
  version: '1';
  capturedAt: string;
  durationMs: number;
  device: { tier: string; os: string; osVersion: string; totalRamMb?: number; refreshRateHz?: number };
  build: { rnVersion?: string; reactVersion?: string; isDebug: boolean };
  events: PerfEvent[];
  findings: unknown[];
  summary: { totalFrames: number; jankFrames: number; jankPct: number; totalCommits: number; jsStalls: number; navigations: number };
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
  const frames = events.filter((e) => e.type === 'frame') as Extract<PerfEvent, { type: 'frame' }>[];
  const jankFrames = frames.filter((f) => f.janky);
  const commits = events.filter((e) => e.type === 'commit');
  const stalls = events.filter((e) => e.type === 'stall');
  const navEvents = events.filter((e) => e.type === 'nav' && e.phase === 'dispatch');
  const firstT = events[0]?.t ?? now;
  const lastT = events[events.length - 1]?.t ?? now;
  return {
    version: '1',
    capturedAt: new Date().toISOString(),
    durationMs: lastT - firstT,
    device: options.device ?? { tier: 'UNKNOWN', os: 'unknown', osVersion: 'unknown' },
    build: { isDebug: typeof __DEV__ !== 'undefined' ? __DEV__ : true, ...options.build },
    events,
    findings: options.findings ?? [],
    summary: {
      totalFrames: frames.length,
      jankFrames: jankFrames.length,
      jankPct: frames.length > 0 ? (jankFrames.length / frames.length) * 100 : 0,
      totalCommits: commits.length,
      jsStalls: stalls.length,
      navigations: navEvents.length,
    },
  };
}

export function serializeReport(report: SessionReport): string {
  return JSON.stringify(report, null, 2);
}
