import type { EventSubscription } from 'react-native';
import { timeline, perfClock } from '@rn-perf-kit/core';
import NativeRnPerfKit from './NativeRnPerfKit';

let sub: EventSubscription | null = null;

export function startFrameCollection(): boolean {
  if (!NativeRnPerfKit) return false;
  if (sub) return true;
  sub = NativeRnPerfKit.onFrames(({ frames }) => {
    for (const f of frames) {
      timeline.add({
        type: 'frame',
        t: perfClock.nativeToJs(f.t),
        dur: f.dur,
        janky: f.janky,
      });
    }
  });
  NativeRnPerfKit.startFrameCollection();
  return true;
}

export function stopFrameCollection(): void {
  NativeRnPerfKit?.stopFrameCollection();
  sub?.remove();
  sub = null;
}
