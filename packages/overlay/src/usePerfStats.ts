/**
 * Hook that computes live performance stats for the overlay.
 * Updates at ~2 Hz to minimize overhead.
 */
import { useState, useEffect, useRef } from 'react';
import { timeline } from '@rn-perf-kit/core';
import type { PerfEvent } from '@rn-perf-kit/core';

const UPDATE_INTERVAL_MS = 500;
const FPS_WINDOW_MS = 1000;

export interface PerfStats {
  jsFps: number;
  uiFps: number;
  stallCount: number;
  jankFrameCount: number;
  currentRoute: string;
}

export function usePerfStats(): PerfStats {
  const [stats, setStats] = useState<PerfStats>({
    jsFps: 60, uiFps: 60, stallCount: 0, jankFrameCount: 0, currentRoute: '',
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      const now = timeline.now();
      const recent = timeline.recent(FPS_WINDOW_MS * 2);
      const frames = recent.filter(
        (e): e is Extract<PerfEvent, { type: 'frame' }> => e.type === 'frame' && e.t >= now - FPS_WINDOW_MS
      );
      const stalls = recent.filter((e) => e.type === 'stall' && e.t >= now - 5000);
      const jankFrames = frames.filter((f) => f.janky);
      const navEvents = recent.filter((e) => e.type === 'nav').slice(-1);
      const currentRoute = navEvents.length > 0 && navEvents[0].type === 'nav' ? navEvents[0].route : '';
      setStats({
        jsFps: Math.min(60, 60 - stalls.length * 5),
        uiFps: Math.min(60, frames.length),
        stallCount: stalls.length,
        jankFrameCount: jankFrames.length,
        currentRoute,
      });
    }, UPDATE_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return stats;
}
