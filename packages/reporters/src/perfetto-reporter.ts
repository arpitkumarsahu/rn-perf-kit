/**
 * Perfetto / Chrome Trace reporter.
 * Open output in https://ui.perfetto.dev or chrome://tracing
 */
import { timeline, type PerfEvent } from '@rn-perf-kit/core';

interface TraceEvent {
  name: string; cat: string; ph: 'B' | 'E' | 'X' | 'i';
  ts: number; dur?: number; pid: number; tid: number;
  args?: Record<string, unknown>;
}

const TID = { frame: 1, commit: 2, nav: 3, store: 4, net: 5, stall: 6, gc: 7 } as const;
const PID = 1;
const toUs = (ms: number) => Math.round(ms * 1000);

export function generatePerfettoTrace(events?: PerfEvent[]): string {
  const src = events ?? timeline.recent(60_000);
  const traceEvents: TraceEvent[] = [];

  for (const ev of src) {
    switch (ev.type) {
      case 'frame':
        traceEvents.push({ name: ev.janky ? 'janky-frame' : 'frame', cat: 'frame', ph: 'X', ts: toUs(ev.t), dur: toUs(ev.dur), pid: PID, tid: TID.frame, args: { janky: ev.janky } });
        break;
      case 'commit':
        traceEvents.push({ name: `commit:${ev.phase ?? 'update'}`, cat: 'react', ph: 'X', ts: toUs(ev.t), dur: toUs(Math.max(ev.dur, 0.1)), pid: PID, tid: TID.commit, args: { fibers: ev.fibers.length } });
        break;
      case 'nav':
        traceEvents.push({ name: `nav:${ev.phase}:${ev.route}`, cat: 'navigation', ph: 'i', ts: toUs(ev.t), pid: PID, tid: TID.nav, args: { phase: ev.phase, route: ev.route, from: ev.fromRoute, navId: ev.navId } });
        break;
      case 'store':
        traceEvents.push({ name: `store:${ev.source}:${ev.key}`, cat: 'store', ph: 'i', ts: toUs(ev.t), pid: PID, tid: TID.store, args: { source: ev.source, key: ev.key } });
        break;
      case 'net':
        traceEvents.push({ name: `net:${ev.url}`, cat: 'network', ph: 'X', ts: toUs(ev.t), dur: toUs(ev.dur), pid: PID, tid: TID.net, args: { bytes: ev.bytes, status: ev.status } });
        break;
      case 'stall':
        traceEvents.push({ name: 'js-stall', cat: 'js', ph: 'X', ts: toUs(ev.t), dur: toUs(ev.dur), pid: PID, tid: TID.stall });
        break;
      case 'gc':
        traceEvents.push({ name: 'hermes-gc', cat: 'gc', ph: 'X', ts: toUs(ev.t), dur: toUs(ev.dur), pid: PID, tid: TID.gc });
        break;
    }
  }

  return JSON.stringify({ traceEvents }, null, 2);
}
