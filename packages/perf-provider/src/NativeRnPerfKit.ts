import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes';

export type DeviceInfo = {
  totalRamMb: number;
  cpuCores: number;
  refreshRateHz: number;
  isLowRamDevice: boolean;
  os: string;
  osVersion: string;
  mediaPerformanceClass: number; // -1 when unknown
};
export type FrameEvent = { t: number; dur: number; janky: boolean };
export type FrameBatch = { frames: FrameEvent[] };
export type MemoryEvent = { t: number; usedMb: number; availableMb: number; trimLevel: number };
export type ThermalEvent = { t: number; status: string };

export interface Spec extends TurboModule {
  nativeNow(): number;
  getDeviceInfo(): DeviceInfo;
  getMemorySnapshot(): MemoryEvent;
  getThermalStatus(): ThermalEvent;
  startFrameCollection(): void;
  stopFrameCollection(): void;
  startMemoryMonitoring(): void;
  stopMemoryMonitoring(): void;
  startThermalMonitoring(): void;
  stopThermalMonitoring(): void;
  writeSessionFile(path: string, json: string): Promise<void>;

  readonly onFrames: EventEmitter<FrameBatch>;
  readonly onMemoryTrim: EventEmitter<MemoryEvent>;
  readonly onThermal: EventEmitter<ThermalEvent>;
}

export default TurboModuleRegistry.get<Spec>('RnPerfKit');
