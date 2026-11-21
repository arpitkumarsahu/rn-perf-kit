/**
 * TurboModule spec for rn-perf-kit native bridge.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface DeviceInfo {
  tier: 'LOW' | 'MID' | 'HIGH';
  totalRamMb: number;
  cpuCores: number;
  refreshRateHz: number;
  isLowRamDevice: boolean;
  os: 'android' | 'ios';
  osVersion: string;
  mediaPerformanceClass?: number;
}

export interface FrameEvent {
  t: number;
  dur: number;
  janky: boolean;
  inputDur?: number;
  animationDur?: number;
  layoutDur?: number;
  drawDur?: number;
  syncDur?: number;
  gpuDur?: number;
}

export interface ThermalEvent {
  t: number;
  status: 'none' | 'light' | 'moderate' | 'severe' | 'critical' | 'emergency' | 'shutdown';
}

export interface MemorySnapshot {
  t: number;
  usedMb: number;
  availableMb: number;
  trimLevel?: number;
}

export interface Spec extends TurboModule {
  nativeNow(): number;
  getDeviceInfo(): DeviceInfo;
  getMemorySnapshot(): MemorySnapshot;
  getThermalStatus(): ThermalEvent;
  startFrameCollection(onFrame: (event: FrameEvent) => void): void;
  stopFrameCollection(): void;
  startMemoryMonitoring(onTrim: (level: number) => void): void;
  stopMemoryMonitoring(): void;
  startThermalMonitoring(onThermal: (event: ThermalEvent) => void): void;
  stopThermalMonitoring(): void;
  writeSessionFile(path: string, json: string): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RnPerfKit');
