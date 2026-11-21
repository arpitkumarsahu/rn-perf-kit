/**
 * Hook that computes live performance stats for the overlay.
 * Updates at ~2 Hz to minimize overhead.
 */
import { useState, useEffect, useRef } from 'react';
import { timeline } from '@rn-perf-kit/core';
import type { PerfEvent } from '@rn-perf-kit/core';

export interface PerfStats {
  jsFps: number;
  uiFps: number;
  stallCount: number;
  jankFrameCount: number;
  currentRoute: string;
}

export function usePerfStats(enabled = true): PerfStats {
  const [stats, setStats] = useState<PerfStats>({
    jsFps: 60,
    uiFps: 60,
    stallCount: 0,
    jankFrameCount: 0,
    currentRoute: '',
  });

  const routeRef = useRef('');

  useEffect(() => {
    return timeline.on('nav', (e) => {
      if (e.type === 'nav') {
        routeRef.current = e.route;
      }
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let rafFrames = 0;
    let rafId = 0;
    const loop = () => {
      rafFrames++;
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    let refreshRateHz = 60;
    try {
      const { NativePerfKit } = require('@rn-perf-kit/native');
      refreshRateHz = NativePerfKit?.getDeviceInfo?.()?.refreshRateHz ?? 60;
    } catch {}

    let last = timeline.now();
    const iv = setInterval(() => {
      const now = timeline.now();
      const elapsed = now - last;
      const jsFps =
        elapsed > 0 ? Math.min(refreshRateHz, Math.round((rafFrames * 1000) / elapsed)) : 60;
      rafFrames = 0;
      last = now;

      // Native frames arrive in 250 ms batches, so count the window [now-1250, now-250]
      const frameEvents = timeline.query(now - 1250, now - 250).filter(
        (e): e is Extract<PerfEvent, { type: 'frame' }> => e.type === 'frame'
      );
      const jankFrames = frameEvents.filter((f) => f.janky);
      const stalls = timeline.recent(5000).filter((e) => e.type === 'stall');

      setStats({
        jsFps,
        uiFps: Math.min(refreshRateHz, frameEvents.length),
        stallCount: stalls.length,
        jankFrameCount: jankFrames.length,
        currentRoute: routeRef.current,
      });
    }, 500);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(iv);
    };
  }, [enabled]);

  return stats;
}
