/**
 * Hook that computes live performance stats for the overlay.
 * Updates at ~2 Hz to minimize overhead.
 */
import { useState, useEffect, useRef } from 'react';
import { timeline, computeFrameStats } from '@rn-perf-kit/core';

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

      // Native frames arrive in 250 ms batches, so read the 1 s window [now-1250, now-250].
      // UI fps comes from dropped frames: an idle screen (no frames drawn) reads full fps.
      const frames = computeFrameStats(timeline.query(now - 1250, now - 250), 1000, refreshRateHz);
      const stalls = timeline.recent(5000).filter((e) => e.type === 'stall');

      setStats({
        jsFps,
        uiFps: frames.uiFps,
        stallCount: stalls.length,
        jankFrameCount: frames.jankFrames,
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
