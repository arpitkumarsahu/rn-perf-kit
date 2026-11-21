import NativeRnPerfKit from './NativeRnPerfKit';
export { NativeRnPerfKit };
export const NativePerfKit = NativeRnPerfKit;
export const isNativeAvailable = NativeRnPerfKit != null;

let warned = false;
export function warnNativeMissing(): void {
  if (__DEV__ && !warned) {
    warned = true;
    console.warn(
      '[rn-perf-kit] RnPerfKit native module not linked — frame, memory and device data are off. Rebuild the native app.'
    );
  }
}

export * from './device-tier';
export * from './stall-detector';
export * from './frame-collector';
export * from './system-monitor';
export type { DeviceInfo, FrameEvent, FrameBatch, MemoryEvent, ThermalEvent } from './NativeRnPerfKit';
