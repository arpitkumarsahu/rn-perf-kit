/**
 * Bridges native FrameMetrics/JankStats (Android) and CADisplayLink (iOS)
 * into the core timeline as 'frame' events.
 */
import { timeline, perfClock } from '@rn-perf-kit/core';
import NativePerfKit, { type FrameEvent } from './NativePerfKit';

export function startFrameCollection(): void {
  NativePerfKit.startFrameCollection((nativeEvent: FrameEvent) => {
    const t = perfClock.nativeToJs(nativeEvent.t);
    timeline.add({
      type: 'frame',
      t,
      dur: nativeEvent.dur,
      janky: nativeEvent.janky,
      breakdown:
        nativeEvent.inputDur != null
          ? {
              input: nativeEvent.inputDur ?? 0,
              animation: nativeEvent.animationDur ?? 0,
              layoutMeasure: nativeEvent.layoutDur ?? 0,
              draw: nativeEvent.drawDur ?? 0,
              sync: nativeEvent.syncDur ?? 0,
              gpu: nativeEvent.gpuDur ?? 0,
            }
          : undefined,
    });
  });
}

export function stopFrameCollection(): void {
  NativePerfKit.stopFrameCollection();
}
