import type { DeviceTier } from '@rn-perf-kit/core';
import type { DeviceInfo } from './NativeRnPerfKit';

export function classifyDeviceTier(info: DeviceInfo): DeviceTier {
  if (info.isLowRamDevice || info.totalRamMb < 3000) return 'LOW';
  if (info.os === 'android') {
    if (info.cpuCores <= 4) return 'LOW';
    if (info.totalRamMb >= 6000 && info.cpuCores >= 8 && info.mediaPerformanceClass >= 31) return 'HIGH';
    return 'MID';
  }
  // iOS has no performance class; RAM tracks chip generation closely
  return info.totalRamMb >= 5800 ? 'HIGH' : 'MID';
}
