/**
 * Memory + thermal collector.
 * Wires the native monitors (trim-memory / memory-warning, thermal status) to the
 * timeline, and samples memory periodically so reports show a memory curve, not just
 * the rare moments the OS complains.
 */
import type { EventSubscription } from 'react-native';
import { timeline, perfClock, type PerfEvent } from '@rn-perf-kit/core';
import NativeRnPerfKit, { type MemoryEvent, type ThermalEvent } from './NativeRnPerfKit';

type ThermalStatus = Extract<PerfEvent, { type: 'thermal' }>['status'];
const THERMAL_STATUSES: ReadonlySet<string> = new Set<ThermalStatus>([
  'none',
  'light',
  'moderate',
  'severe',
  'critical',
  'emergency',
  'shutdown',
]);

const MEMORY_SAMPLE_MS = 10_000;

let subs: EventSubscription[] = [];
let sampleTimer: ReturnType<typeof setInterval> | null = null;

function addMemory(m: MemoryEvent): void {
  timeline.add({
    type: 'memory',
    t: perfClock.nativeToJs(m.t),
    usedMb: m.usedMb,
    availableMb: m.availableMb,
    ...(m.trimLevel ? { trimLevel: m.trimLevel } : {}),
  });
}

function addThermal(e: ThermalEvent): void {
  if (!THERMAL_STATUSES.has(e.status)) return;
  timeline.add({ type: 'thermal', t: perfClock.nativeToJs(e.t), status: e.status as ThermalStatus });
}

/** Returns false when the native module isn't linked. */
export function startSystemMonitoring(): boolean {
  const native = NativeRnPerfKit;
  if (!native) return false;
  if (sampleTimer !== null) return true;

  subs = [native.onMemoryTrim(addMemory), native.onThermal(addThermal)];
  native.startMemoryMonitoring();
  native.startThermalMonitoring();

  const sample = () => {
    try {
      addMemory(native.getMemorySnapshot());
    } catch {}
  };
  sample();
  try {
    addThermal(native.getThermalStatus());
  } catch {}
  sampleTimer = setInterval(sample, MEMORY_SAMPLE_MS);
  return true;
}

export function stopSystemMonitoring(): void {
  if (sampleTimer !== null) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
  subs.forEach((s) => s.remove());
  subs = [];
  NativeRnPerfKit?.stopMemoryMonitoring();
  NativeRnPerfKit?.stopThermalMonitoring();
}
