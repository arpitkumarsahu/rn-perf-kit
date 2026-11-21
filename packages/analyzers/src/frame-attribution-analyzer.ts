/**
 * Frame Attribution Analyzer
 * Links dropped frames to JS commits, stalls, GC, or labels them native-side.
 */
import type { PerfEvent } from '@rn-perf-kit/core';
import type { Finding, AnalyzerContext } from './types';

export interface FrameAttribution {
  frameT: number;
  frameDur: number;
  cause: 'commit' | 'stall' | 'gc' | 'native-side';
  commitDur?: number;
  stallDur?: number;
  detail: string;
}

export function analyzeFrameAttribution(
  events: PerfEvent[],
  ctx: AnalyzerContext
): { attributions: FrameAttribution[]; findings: Finding[] } {
  const jankFrames = events.filter((e) => e.type === 'frame' && e.janky) as Extract<PerfEvent, { type: 'frame' }>[];
  const commits = events.filter((e) => e.type === 'commit') as Extract<PerfEvent, { type: 'commit' }>[];
  const stalls = events.filter((e) => e.type === 'stall') as Extract<PerfEvent, { type: 'stall' }>[];
  const gcs = events.filter((e) => e.type === 'gc') as Extract<PerfEvent, { type: 'gc' }>[];

  const attributions: FrameAttribution[] = [];
  const findings: Finding[] = [];

  for (const frame of jankFrames) {
    const fEnd = frame.t + frame.dur;
    const commit = commits.find((c) => c.t <= fEnd && c.t + c.dur >= frame.t);
    const stall = stalls.find((s) => s.t <= fEnd && s.t + s.dur >= frame.t);
    const gc = gcs.find((g) => g.t <= fEnd && g.t + g.dur >= frame.t);

    let attr: FrameAttribution;

    if (commit && commit.dur >= (stall?.dur ?? 0)) {
      attr = { frameT: frame.t, frameDur: frame.dur, cause: 'commit', commitDur: commit.dur, detail: `Commit (${commit.dur.toFixed(0)}ms) overlapped janky frame (${frame.dur.toFixed(0)}ms > budget ${ctx.frameBudgetMs}ms)` };
    } else if (stall) {
      attr = { frameT: frame.t, frameDur: frame.dur, cause: 'stall', stallDur: stall.dur, detail: `JS stall (${stall.dur.toFixed(0)}ms) caused janky frame` };
    } else if (gc) {
      attr = { frameT: frame.t, frameDur: frame.dur, cause: 'gc', detail: `GC pause (${gc.dur.toFixed(0)}ms) caused janky frame` };
    } else {
      attr = { frameT: frame.t, frameDur: frame.dur, cause: 'native-side', detail: `Janky frame (${frame.dur.toFixed(0)}ms) with no overlapping JS work — likely native-side (layout, images, overdraw)` };
      findings.push({
        id: `frame:native-side:${frame.t}`,
        severity: 'info',
        category: 'frame',
        title: 'Native-side jank (no JS cause)',
        detail: attr.detail,
        suggestion: 'Profile with Android Studio GPU profiler. Check for overdraw, large images, expensive layouts.',
        t: frame.t,
      });
    }

    attributions.push(attr);
  }

  return { attributions, findings };
}
