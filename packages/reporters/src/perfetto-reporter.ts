/**
 * Perfetto / Chrome Trace reporter.
 * Open output in https://ui.perfetto.dev or chrome://tracing
 */
import { timeline, type PerfEvent } from '@rn-perf-kit/core';

interface TraceEvent {
  name: string; cat: string; ph: 'B' | 'E' | 'X' | 'i' | 'C' | 'M';
  ts: number; dur?: number; pid: number; tid: number;
  s?: 'g' | 'p' | 't';
  args?: Record<string, unknown>;
}

const TID = {
  frame: 1, commit: 2, nav: 3, store: 4, net: 5, stall: 6, gc: 7,
  trace: 8, marks: 9, system: 10, suspense: 11,
} as const;
const THREAD_NAMES: Record<number, string> = {
  1: 'UI frames', 2: 'React commits', 3: 'Navigation', 4: 'Stores', 5: 'Network',
  6: 'JS stalls', 7: 'GC', 8: 'PerfTrace', 9: 'Marks & custom traces', 10: 'Memory & thermal',
  11: 'Suspense',
};
const PID = 1;
const toUs = (ms: number) => Math.round(ms * 1000);

export function generatePerfettoTrace(events?: PerfEvent[]): string {
  const src = events ?? timeline.recent(60_000);
  const traceEvents: TraceEvent[] = Object.entries(THREAD_NAMES).map(([tid, name]) => ({
    name: 'thread_name', cat: '__metadata', ph: 'M' as const, ts: 0, pid: PID, tid: Number(tid), args: { name },
  }));

  for (const ev of src) {
    switch (ev.type) {
      case 'frame':
        traceEvents.push({ name: ev.janky ? 'janky-frame' : 'frame', cat: 'frame', ph: 'X', ts: toUs(ev.t), dur: toUs(ev.dur), pid: PID, tid: TID.frame, args: { janky: ev.janky } });
        break;
      case 'commit':
        traceEvents.push({ name: `commit:${ev.phase ?? 'update'}`, cat: 'react', ph: 'X', ts: toUs(ev.t), dur: toUs(Math.max(ev.dur, 0.1)), pid: PID, tid: TID.commit, args: { fibers: ev.fibers.length } });
        break;
      case 'trace':
        traceEvents.push({ name: `trace:${ev.id}`, cat: 'react', ph: 'X', ts: toUs(ev.t), dur: toUs(Math.max(ev.dur, 0.1)), pid: PID, tid: TID.trace, args: { id: ev.id, phase: ev.phase } });
        break;
      case 'nav':
        traceEvents.push({ name: `nav:${ev.phase}:${ev.route}`, cat: 'navigation', ph: 'i', s: 't', ts: toUs(ev.t), pid: PID, tid: TID.nav, args: { phase: ev.phase, route: ev.route, from: ev.fromRoute, navId: ev.navId } });
        break;
      case 'store':
        traceEvents.push({ name: `store:${ev.source}:${ev.key}`, cat: 'store', ph: 'i', s: 't', ts: toUs(ev.t), pid: PID, tid: TID.store, args: { source: ev.source, key: ev.key } });
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
      case 'memory':
        // Counter track: shows as a line graph in Perfetto
        traceEvents.push({ name: 'memory (MB)', cat: 'memory', ph: 'C', ts: toUs(ev.t), pid: PID, tid: TID.system, args: { usedMb: ev.usedMb, availableMb: ev.availableMb } });
        if (ev.trimLevel) {
          traceEvents.push({ name: `memory-pressure:${ev.trimLevel}`, cat: 'memory', ph: 'i', s: 'p', ts: toUs(ev.t), pid: PID, tid: TID.system, args: { trimLevel: ev.trimLevel } });
        }
        break;
      case 'thermal':
        traceEvents.push({ name: `thermal:${ev.status}`, cat: 'thermal', ph: 'i', s: 'p', ts: toUs(ev.t), pid: PID, tid: TID.system, args: { status: ev.status } });
        break;
      case 'suspense':
        traceEvents.push({ name: ev.showingFallback ? `suspense-fallback:${ev.boundary}` : `suspense-resolved:${ev.boundary}`, cat: 'react', ph: 'i', s: 't', ts: toUs(ev.t), pid: PID, tid: TID.suspense });
        break;
      case 'render-discarded':
        traceEvents.push({ name: `discarded:${ev.component}`, cat: 'react', ph: 'i', s: 't', ts: toUs(ev.t), pid: PID, tid: TID.commit, args: { renders: ev.renderCount } });
        break;
      case 'mark': {
        // perf.start(name) ... end() records `${name}:end` with data.dur: draw it as a slice
        const data = (ev.data ?? {}) as { dur?: unknown };
        if (ev.name.endsWith(':end') && typeof data.dur === 'number') {
          const name = ev.name.slice(0, -':end'.length);
          traceEvents.push({ name, cat: 'custom', ph: 'X', ts: toUs(ev.t - data.dur), dur: toUs(data.dur), pid: PID, tid: TID.marks, args: data as Record<string, unknown> });
        } else if (!ev.name.endsWith(':start')) {
          traceEvents.push({ name: ev.name, cat: 'mark', ph: 'i', s: 't', ts: toUs(ev.t), pid: PID, tid: TID.marks, args: ev.data && typeof ev.data === 'object' ? (ev.data as Record<string, unknown>) : undefined });
        }
        break;
      }
    }
  }

  return JSON.stringify({ traceEvents }, null, 2);
}
