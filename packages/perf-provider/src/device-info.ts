import { NativePerfKit, classifyDeviceTier } from '@rn-perf-kit/native';
import type { DeviceTier } from '@rn-perf-kit/core';

export function getDeviceReportInfo(): {
  tier: DeviceTier;
  os: string;
  osVersion: string;
  totalRamMb: number;
  refreshRateHz: number;
} {
  if (NativePerfKit) {
    try {
      const info = NativePerfKit.getDeviceInfo();
      return {
        tier: classifyDeviceTier(info),
        os: info.os,
        osVersion: info.osVersion,
        totalRamMb: info.totalRamMb,
        refreshRateHz: info.refreshRateHz,
      };
    } catch {}
  }
  return {
    tier: 'MID',
    os: 'unknown',
    osVersion: 'unknown',
    totalRamMb: 0,
    refreshRateHz: 60,
  };
}
