/**
 * Device tier classification: LOW / MID / HIGH
 */
import type { DeviceInfo } from './NativePerfKit';
import type { DeviceTier } from '@rn-perf-kit/core';

export function classifyDeviceTier(info: DeviceInfo): DeviceTier {
  if (info.isLowRamDevice || info.totalRamMb < 3000 || info.cpuCores <= 4) {
    return 'LOW';
  }
  if (
    info.totalRamMb >= 6000 &&
    info.cpuCores >= 8 &&
    (info.mediaPerformanceClass ?? 0) >= 31
  ) {
    return 'HIGH';
  }
  return 'MID';
}

export function frameBudgetMs(refreshRateHz: number): number {
  return 1000 / refreshRateHz;
}
